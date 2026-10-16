package com.onfilm.local.media.encoding;

import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Durable local editing queue, executed by the same worker as ordinary HLS jobs. */
@Service
public class TrailerEditingService {
    public record Edit(String id,String draftId,String sourceId,String phase,String status,double duration,
                       boolean previewReady,Double start,Double end,String resultId,String encodeId,int progress,String message){}
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final FfmpegEncoder encoder;
    private final Path root;
    public TrailerEditingService(JdbcTemplate jdbc,PlatformTransactionManager manager,FfmpegEncoder encoder,@Value("${onfilm.data-dir}") String directory){
        this.jdbc=jdbc;tx=new TransactionTemplate(manager);this.encoder=encoder;root=Path.of(directory).toAbsolutePath().normalize();
        jdbc.update("UPDATE trailer_edit SET status='INTERRUPTED',message='앱 종료로 중단됐습니다. 다시 시도해 주세요.' WHERE status='RUNNING'");
        jdbc.update("UPDATE trailer_edit SET status='CANCELLED' WHERE status='CANCELLING'");
    }
    private List<Edit> rows(String sql,Object... args){return jdbc.query(sql,(r,n)->new Edit(r.getString("id"),r.getString("draft_id"),r.getString("source_id"),r.getString("phase"),r.getString("status"),r.getDouble("duration_seconds"),r.getBoolean("preview_ready"),r.getObject("start_seconds",Double.class),r.getObject("end_seconds",Double.class),r.getString("result_id"),r.getString("encode_id"),r.getInt("progress"),r.getString("message")),args);}
    public Edit get(String id){uuid(id);var found=rows("SELECT * FROM trailer_edit WHERE id=? AND draft_id IS NOT NULL",id);if(found.isEmpty())throw error("편집 작업이 없습니다. 다시 열어 주세요.");return found.get(0);}
    private Map<String,Object> draft(String id){var rows=jdbc.queryForList("SELECT * FROM filmography_media_draft WHERE id=? FOR UPDATE",id);if(rows.isEmpty())throw error("작품 편집이 이미 저장되거나 취소됐습니다.");return rows.get(0);}
    private void sourceMatches(String source,String film,Map<String,Object> draft){
        if(Boolean.TRUE.equals(draft.get("video_changed"))){if(!Objects.equals(draft.get("video_id"),source))throw error("선택된 원본 영상이 변경됐습니다.");}
        else if(film==null||jdbc.queryForObject("SELECT COUNT(*) FROM local_video WHERE id=? AND film_id=? AND status='READY'",Integer.class,source,film)!=1)throw error("해당 작품의 원본 영상이 아닙니다.");
    }
    public Edit open(String draftId,String source,String film){
        uuid(draftId);uuid(source);if(film!=null)uuid(film);
        return tx.execute(s->{
            var d=draft(draftId);
            if(jdbc.queryForList("SELECT id FROM local_video WHERE id=? AND status='READY' FOR UPDATE",String.class,source).isEmpty())throw error("원본 파일을 찾을 수 없습니다.");
            sourceMatches(source,film,d);
            var existing=rows("SELECT * FROM trailer_edit WHERE draft_id=?",draftId);
            if(!existing.isEmpty()){
                var old=existing.get(0);
                if(old.sourceId().equals(source)&&!Set.of("CANCELLED","APPLIED").contains(old.status()))return old;
                if(Set.of("RUNNING","CANCELLING","QUEUED").contains(old.status()))throw error("이전 편집 작업이 끝난 후 다시 열어 주세요.");
                jdbc.update("UPDATE trailer_edit SET draft_id=NULL WHERE id=?",old.id());
            }
            String id=UUID.randomUUID().toString();
            jdbc.update("INSERT INTO trailer_edit(id,draft_id,source_id,film_id,expected_trailer_id,expected_trailer_changed) VALUES (?,?,?,?,?,?)",id,draftId,source,film,d.get("trailer_id"),d.get("trailer_changed"));
            return get(id);
        });
    }
    public Edit retryProbe(String id){return tx.execute(s->{
        Edit e=locked(id);
        if(!Set.of("READY","FAILED","INTERRUPTED").contains(e.status()))throw error("작업이 진행 중입니다.");
        jdbc.update("UPDATE trailer_edit SET phase='PROBE',status='QUEUED',progress=0,message='' WHERE id=?",id);return get(id);
    });}
    public Edit reset(String id){return tx.execute(s->{
        Edit e=locked(id);
        if(!Set.of("DONE","FAILED","INTERRUPTED").contains(e.status())||e.duration()<=0)throw error("작업 완료 후 구간을 다시 선택해 주세요.");
        abandonResult(e);
        jdbc.update("UPDATE trailer_edit SET phase='PROBE',status='READY',result_id=NULL,encode_id=NULL,progress=100,message='' WHERE id=?",id);return get(id);
    });}
    public Edit cut(String id,double start,double end){return tx.execute(s->{
        Edit e=locked(id);
        if(!Double.isFinite(start)||!Double.isFinite(end)||start<0||end>e.duration()||end-start<0.2||end-start>300)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"시작·종료를 확인해 주세요. 트레일러는 0.2초 이상 5분 이하로 만들 수 있습니다.");
        if(e.phase().equals("CLIP")&&Set.of("QUEUED","RUNNING","DONE").contains(e.status())){
            if(Objects.equals(e.start(),start)&&Objects.equals(e.end(),end))return e;
            throw error("현재 작업을 취소하고 다시 열어 주세요.");
        }
        if(!Set.of("READY","FAILED","INTERRUPTED").contains(e.status()))throw error("미리보기 준비 후 다시 시도해 주세요.");
        String result=UUID.randomUUID().toString(),job=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO local_video(id,original_name,size_bytes,status) VALUES (?, '원본에서 만든 트레일러.mp4',0,'COPYING')",result);
        jdbc.update("INSERT INTO encode_job(id,video_id,status,attempts) VALUES (?,?,'EDITING',1)",job,result);
        jdbc.update("UPDATE trailer_edit SET phase='CLIP',status='QUEUED',start_seconds=?,end_seconds=?,result_id=?,encode_id=?,progress=0,message='' WHERE id=?",start,end,result,job,id);return get(id);
    });}
    private Edit locked(String id){Edit e=get(id);draft(e.draftId());jdbc.queryForList("SELECT id FROM trailer_edit WHERE id=? FOR UPDATE",id);return get(id);}
    public void cancel(String id){tx.executeWithoutResult(s->{
        uuid(id);
        if(rows("SELECT * FROM trailer_edit WHERE id=? AND draft_id IS NOT NULL",id).isEmpty())return;
        Edit e=locked(id);
        if(e.status().equals("APPLIED"))throw error("이미 편집본에 반영됐습니다. 트레일러 사용을 다시 눌러 확인해 주세요.");
        jdbc.update("UPDATE trailer_edit SET status=CASE WHEN status IN ('RUNNING','CANCELLING') THEN 'CANCELLING' ELSE 'CANCELLED' END WHERE id=? AND status<>'APPLIED'",id);
        abandonResult(e);
    });}
    private void abandonResult(Edit e){if(e.resultId()!=null){jdbc.update("UPDATE local_video SET status='FAILED' WHERE id=? AND status='COPYING'",e.resultId());jdbc.update("UPDATE encode_job SET status='FAILED',message='트레일러 만들기가 완료되지 않았습니다.' WHERE id=? AND status='EDITING'",e.encodeId());}}
    public void accept(String id){tx.executeWithoutResult(s->{
        Edit e=locked(id);if(e.status().equals("APPLIED"))return;
        if(!e.status().equals("DONE"))throw error("트레일러 생성 완료 후 사용할 수 있습니다.");
        var d=draft(e.draftId());var saved=jdbc.queryForMap("SELECT * FROM trailer_edit WHERE id=?",id);
        sourceMatches(e.sourceId(),(String)saved.get("film_id"),d);
        if(!Objects.equals(d.get("trailer_id"),saved.get("expected_trailer_id"))||!Objects.equals(d.get("trailer_changed"),saved.get("expected_trailer_changed")))throw error("트레일러가 다른 작업에서 변경됐습니다. 다시 열어 주세요.");
        jdbc.update("UPDATE filmography_media_draft SET trailer_changed=TRUE,trailer_id=? WHERE id=?",e.resultId(),e.draftId());
        jdbc.update("UPDATE trailer_edit SET status='APPLIED' WHERE id=?",id);
    });}
    public List<EncodingService.Job> activeJobs(){return rows("SELECT * FROM trailer_edit WHERE status IN ('QUEUED','RUNNING','CANCELLING')").stream().map(e->new EncodingService.Job(e.id(),"editor:"+e.id(),e.status().equals("QUEUED")?"QUEUED":"RUNNING",0,e.message(),e.progress())).toList();}
    private boolean cancelled(String id){return jdbc.queryForObject("SELECT COUNT(*) FROM trailer_edit WHERE id=? AND draft_id IS NOT NULL AND status='RUNNING'",Integer.class,id)!=1;}
    private void progress(Edit e,int value){jdbc.update("UPDATE trailer_edit SET progress=? WHERE id=? AND status='RUNNING' AND progress<?",value,e.id(),value);}
    public boolean runNext(){
        cleanAbandoned();
        var queue=rows("SELECT * FROM trailer_edit WHERE status='QUEUED' AND draft_id IS NOT NULL ORDER BY created_at,id");if(queue.isEmpty())return false;
        Edit e=queue.get(0);
        if(jdbc.update("UPDATE trailer_edit SET status='RUNNING',message='',progress=0 WHERE id=? AND status='QUEUED'",e.id())!=1)return true;
        try{
            Path source=source(e);java.util.function.BooleanSupplier cancelled=()->cancelled(e.id());
            if(e.phase().equals("PROBE")||e.phase().equals("PREVIEW")){
                var info=encoder.inspect(source,cancelled);
                jdbc.update("UPDATE trailer_edit SET duration_seconds=? WHERE id=?",info.duration(),e.id());
                ready(e);
            }else{
                Path part=root.resolve("media/videos").resolve(uuid(e.resultId())+".part"),result=root.resolve("media/videos").resolve(e.resultId()+".source");
                safeOutput(part);safeOutput(result);
                encoder.makeMp4(source,part,e.start(),e.end()-e.start(),false,p->progress(e,p*45/100),cancelled);
                if(cancelled.getAsBoolean())throw new InterruptedException();
                Files.move(part,result,StandardCopyOption.ATOMIC_MOVE);
                Path output=root.resolve("media/encoded").resolve(uuid(e.encodeId())).resolve("attempt-1");
                safeOutput(output.resolve("index.m3u8"));
                encoder.encode(result,output,p->progress(e,45+p*54/100),cancelled);
                long size=Files.size(result);
                tx.executeWithoutResult(s->{
                    locked(e.id());
                    if(cancelled(e.id()))throw error("편집이 취소됐습니다.");
                    jdbc.update("UPDATE local_video SET status='READY',size_bytes=? WHERE id=?",size,e.resultId());
                    jdbc.update("UPDATE encode_job SET status='DONE',progress=100,message='HLS 변환 완료' WHERE id=?",e.encodeId());
                    jdbc.update("UPDATE trailer_edit SET status='DONE',progress=100,message='' WHERE id=? AND status='RUNNING'",e.id());
                    jdbc.update("INSERT INTO app_notification(job_id,message) VALUES (?,?)",e.encodeId(),"트레일러 인코딩 완료 · 원본에서 만든 트레일러");
                });
            }
        }catch(Exception error){
            boolean cancelled=cancelled(e.id());
            jdbc.update("UPDATE trailer_edit SET status=?,message=? WHERE id=?",cancelled?"CANCELLED":error instanceof InterruptedException?"INTERRUPTED":"FAILED",cancelled?"편집을 취소했습니다.":error instanceof FfmpegEncoder.Failure?error.getMessage():"트레일러 준비에 실패했습니다. 파일·저장 공간을 확인하고 다시 시도해 주세요.",e.id());
            abandonResult(e);
        }
        return true;
    }
    private void ready(Edit e)throws InterruptedException{if(jdbc.update("UPDATE trailer_edit SET status='READY',progress=100 WHERE id=? AND status='RUNNING' AND draft_id IS NOT NULL",e.id())!=1)throw new InterruptedException();}
    private Path temporary(Edit e)throws java.io.IOException{Path path=root.resolve("media/trailer-edits").resolve(uuid(e.id()));safeOutput(path.resolve("preview.mp4"));return path;}
    private void safeOutput(Path file)throws java.io.IOException{
        Path current=root;
        for(Path component:root.relativize(file.getParent())){
            current=current.resolve(component);
            if(Files.exists(current,LinkOption.NOFOLLOW_LINKS))safe(current);
            else Files.createDirectory(current);
        }
        if(Files.exists(file,LinkOption.NOFOLLOW_LINKS))safe(file);
    }
    private Path source(Edit e)throws java.io.IOException{
        var size=jdbc.queryForList("SELECT size_bytes FROM local_video WHERE id=? AND status='READY'",Long.class,e.sourceId());
        Path p=safe(root.resolve("media/videos").resolve(uuid(e.sourceId())+".source"));
        if(size.size()!=1||!Files.isRegularFile(p)||Files.size(p)!=size.get(0))throw error("원본 파일이 없거나 변경됐습니다.");return p;
    }
    public Path content(String id,String kind)throws java.io.IOException{
        Edit e=get(id);if(Set.of("CANCELLED","CANCELLING","APPLIED").contains(e.status()))throw error("편집 미리보기가 종료됐습니다.");
        Path file=switch(kind){case "source"->source(e);case "preview"->{if(!e.previewReady()||!Set.of("READY","DONE").contains(e.status()))throw error("미리보기 준비 중입니다.");yield temporary(e).resolve("preview.mp4");}case "result"->{if(!e.status().equals("DONE"))throw error("트레일러 생성 중입니다.");yield root.resolve("media/videos").resolve(uuid(e.resultId())+".source");}default->throw error("알 수 없는 영상입니다.");};
        file=safe(file);if(!Files.isRegularFile(file))throw error("미리보기 파일이 없습니다.");return file;
    }
    private Path safe(Path file)throws java.io.IOException{Path expected=root.toRealPath().resolve(root.relativize(file));if(!file.toRealPath().equals(expected))throw new java.io.IOException("Linked media path");return file;}
    private void cleanAbandoned(){
        for(Edit e:rows("SELECT * FROM trailer_edit WHERE draft_id IS NULL OR status='CANCELLED'")){
            try{
                abandonResult(e);
                Path folder=root.resolve("media/trailer-edits").resolve(uuid(e.id()));
                if(Files.exists(folder,LinkOption.NOFOLLOW_LINKS)){
                    safe(folder);try(var files=Files.walk(folder)){var paths=files.sorted(Comparator.reverseOrder()).toList();for(Path p:paths)safe(p);for(Path p:paths)Files.deleteIfExists(p);}
                }
                jdbc.update("DELETE FROM trailer_edit WHERE id=?",e.id());
            }catch(Exception ignored){/* Known session cleanup is retried; never walk unrelated paths. */}
        }
    }
    private static String uuid(String value){try{return UUID.fromString(value).toString();}catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"잘못된 영상 식별자입니다.");}}
    private static ResponseStatusException error(String message){return new ResponseStatusException(HttpStatus.CONFLICT,message);}
}
