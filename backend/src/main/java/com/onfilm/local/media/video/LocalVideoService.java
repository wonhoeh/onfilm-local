package com.onfilm.local.media.video;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Copies are immutable. Only generated IDs are used as filesystem paths. */
@Service
public class LocalVideoService {
    static final long MAX_BYTES=2L*1024*1024*1024;
    private final Path root;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Semaphore slot=new Semaphore(1);
    public record Video(String id,String filmId,String name,long bytes,String status,boolean available) { }
    public LocalVideoService(@Value("${onfilm.data-dir}") String directory,JdbcTemplate jdbc,PlatformTransactionManager manager) throws IOException {
        this.jdbc=jdbc;tx=new TransactionTemplate(manager);
        root=Path.of(directory).resolve("media/videos").toAbsolutePath().normalize();
        Files.createDirectories(root);
        // An unfinished copy is never exposed as a connected video after restart.
        jdbc.update("UPDATE local_video SET status='INTERRUPTED' WHERE status='COPYING'");
    }
    private Path path(String id,String suffix) { return root.resolve(UUID.fromString(id)+suffix); }
    public List<Video> list() {
        return jdbc.query("SELECT * FROM local_video WHERE film_id IS NOT NULL AND status='READY' ORDER BY created_at",(r,n)->{
            String id=r.getString("id");long size=r.getLong("size_bytes");boolean available=false;
            try{available=Files.isRegularFile(path(id,".source"),LinkOption.NOFOLLOW_LINKS)&&Files.size(path(id,".source"))==size;}catch(IOException ignored){}
            return new Video(id,r.getString("film_id"),r.getString("original_name"),size,r.getString("status"),available);
        });
    }
    public Video findReady(String id){
        if(id==null)return null;
        var rows=jdbc.query("SELECT * FROM local_video WHERE id=? AND status='READY'",(r,n)->{
            long size=r.getLong("size_bytes");boolean available=false;
            try{available=Files.isRegularFile(path(id,".source"),LinkOption.NOFOLLOW_LINKS)&&Files.size(path(id,".source"))==size;}catch(IOException ignored){}
            return new Video(id,r.getString("film_id"),r.getString("original_name"),size,"READY",available);
        },id);return rows.isEmpty()?null:rows.get(0);
    }
    public List<Video> trailers(){
        return jdbc.query("SELECT film_id,video_id FROM filmography_trailer",(r,n)->{
            Video v=findReady(r.getString("video_id"));
            return new Video(v.id(),r.getString("film_id"),v.name(),v.bytes(),v.status(),v.available());
        });
    }
    private void claim(String filmId,long version) {
        if(jdbc.update("UPDATE filmography_state SET version=version+1 WHERE id=1 AND version=?",version)!=1) throw error(HttpStatus.CONFLICT,"작품 정보가 변경됐습니다. 다시 읽기로 확인해 주세요.");
        if(jdbc.queryForObject("SELECT COUNT(*) FROM filmography_item WHERE id=?",Integer.class,filmId)!=1) throw error(HttpStatus.NOT_FOUND,"작품을 찾을 수 없습니다.");
    }
    public void unlink(String filmId,long version) {
        tx.executeWithoutResult(s->{claim(filmId,version);jdbc.update("UPDATE local_video SET film_id=NULL WHERE film_id=?",filmId);});
    }
    public void upload(String filmId,long version,String name,long length,InputStream input) throws IOException {
        copy(filmId,version,null,false,name,length,input);
    }
    public void uploadDraft(String draftId,String name,long length,InputStream input)throws IOException{
        copy(null,0,draftId,false,name,length,input);
    }
    public void uploadTrailerDraft(String draftId,String name,long length,InputStream input)throws IOException{
        copy(null,0,draftId,true,name,length,input);
    }
    private void copy(String filmId,long version,String draftId,boolean trailer,String name,long length,InputStream input)throws IOException{
        if(length<=0||length>MAX_BYTES)throw error(HttpStatus.PAYLOAD_TOO_LARGE,"빈 파일은 저장할 수 없으며 영상은 2GB 이하여야 합니다.");
        if(name==null||name.isBlank()||name.length()>200||name.chars().anyMatch(c->c<32)||name.contains("/")||name.contains("\\"))throw error(HttpStatus.BAD_REQUEST,"파일 이름을 확인해 주세요.");
        String lower=name.toLowerCase(Locale.ROOT);
        if(!lower.endsWith(".mp4")&&!lower.endsWith(".mov"))throw error(HttpStatus.BAD_REQUEST,"현재 MP4·MOV 파일만 지원합니다.");
        if(!slot.tryAcquire())throw error(HttpStatus.TOO_MANY_REQUESTS,"다른 영상을 저장 중입니다. 완료 후 다시 시도해 주세요.");
        String id=UUID.randomUUID().toString();boolean registered=false,linked=false;
        try{
            // Read-only preflight; the final transaction checks version again after the slow copy.
            if(draftId==null){
            if(jdbc.queryForObject("SELECT version FROM filmography_state WHERE id=1",Long.class)!=version)throw error(HttpStatus.CONFLICT,"다시 읽기로 작품 상태를 확인해 주세요.");
            if(jdbc.queryForObject("SELECT COUNT(*) FROM filmography_item WHERE id=?",Integer.class,filmId)!=1)throw error(HttpStatus.NOT_FOUND,"작품을 찾을 수 없습니다.");
            }else if(jdbc.queryForObject("SELECT COUNT(*) FROM filmography_media_draft WHERE id=?",Integer.class,draftId)!=1)throw error(HttpStatus.NOT_FOUND,"임시 작업이 없습니다.");
            if(Files.getFileStore(root).getUsableSpace()<length+64L*1024*1024)throw error(HttpStatus.INSUFFICIENT_STORAGE,"저장 공간이 부족합니다.");
            byte[] header=input.readNBytes(16);
            if(header.length<16||header[4]!='f'||header[5]!='t'||header[6]!='y'||header[7]!='p')throw error(HttpStatus.BAD_REQUEST,"MP4·MOV 컨테이너 헤더를 확인할 수 없습니다. 파일을 확인해 주세요.");
            jdbc.update("INSERT INTO local_video (id,original_name,size_bytes,status) VALUES (?,?,?,'COPYING')",id,name,length);registered=true;
            try(var output=new FileOutputStream(path(id,".part").toFile())){
                output.write(header);long total=header.length;byte[] buffer=new byte[128*1024];int count;
                while((count=input.read(buffer))!=-1){total+=count;if(total>length||total>MAX_BYTES)throw error(HttpStatus.PAYLOAD_TOO_LARGE,"파일 크기가 변경됐거나 제한을 초과했습니다.");output.write(buffer,0,count);}
                if(total!=length)throw error(HttpStatus.BAD_REQUEST,"파일 복사가 중단됐습니다. 다시 선택해 주세요.");
                output.getFD().sync();
            }
            Files.move(path(id,".part"),path(id,".source"),StandardCopyOption.ATOMIC_MOVE);
            tx.executeWithoutResult(s->{
                if(draftId!=null){
                    if(jdbc.queryForList("SELECT id FROM filmography_media_draft WHERE id=? FOR UPDATE",String.class,draftId).isEmpty())throw error(HttpStatus.CONFLICT,"임시 작업이 이미 저장됐습니다. 다시 읽기로 확인해 주세요.");
                    jdbc.update("UPDATE local_video SET status='READY' WHERE id=?",id);
                    jdbc.update(trailer?"UPDATE filmography_media_draft SET trailer_changed=TRUE,trailer_id=? WHERE id=?":"UPDATE filmography_media_draft SET video_changed=TRUE,video_id=? WHERE id=?",id,draftId);
                }else{
                claim(filmId,version);
                jdbc.update("UPDATE local_video SET film_id=NULL WHERE film_id=?",filmId);
                jdbc.update("UPDATE local_video SET film_id=?,status='READY' WHERE id=?",filmId,id);
                }
            });
            linked=true;
        }finally{
            try {
                if(registered&&!linked){
                    // Keep recovery files: never remove a file if DB commit outcome is uncertain.
                    jdbc.update("UPDATE local_video SET status='FAILED' WHERE id=? AND status='COPYING'",id);
                }
            } finally {slot.release();}
        }
    }
    private static ResponseStatusException error(HttpStatus status,String message){return new ResponseStatusException(status,message);}
}
