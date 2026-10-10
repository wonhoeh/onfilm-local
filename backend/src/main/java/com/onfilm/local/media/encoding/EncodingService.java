package com.onfilm.local.media.encoding;

import java.nio.file.*;
import java.util.*;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EncodingService {
    public record Job(String id,String videoId,String status,int attempts,String message,int progress) { }
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final FfmpegEncoder encoder;
    private final Path root;
    private final Object execution=new Object();
    private volatile boolean closing;
    public EncodingService(JdbcTemplate jdbc,PlatformTransactionManager manager,FfmpegEncoder encoder,@Value("${onfilm.data-dir}") String directory){
        this.jdbc=jdbc;this.tx=new TransactionTemplate(manager);this.encoder=encoder;root=Path.of(directory).toAbsolutePath().normalize();
        jdbc.update("UPDATE encode_job SET status='INTERRUPTED',message='앱 종료로 중단됐습니다. 재시도해 주세요.' WHERE status='RUNNING'");
    }
    public List<Job> list(){return jdbc.query("SELECT * FROM encode_job ORDER BY created_at,id",(r,n)->new Job(r.getString("id"),r.getString("video_id"),r.getString("status"),r.getInt("attempts"),r.getString("message"),r.getInt("progress")));}
    public synchronized Job request(String videoId){
        if(closing)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        return tx.execute(s->{
            if(jdbc.queryForObject("SELECT COUNT(*) FROM local_video v WHERE id=? AND (film_id IS NOT NULL OR EXISTS (SELECT 1 FROM filmography_trailer t WHERE t.video_id=v.id) OR EXISTS (SELECT 1 FROM filmography_media_draft d WHERE d.video_id=v.id OR d.trailer_id=v.id)) AND status='READY'",Integer.class,videoId)!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            var current=list().stream().filter(j->j.videoId().equals(videoId)).findFirst();
            if(current.isEmpty())jdbc.update("INSERT INTO encode_job(id,video_id,status) VALUES (?,?,'QUEUED')",UUID.randomUUID().toString(),videoId);
            else jdbc.update("UPDATE encode_job SET status='QUEUED',message='',progress=0 WHERE id=? AND status IN ('FAILED','INTERRUPTED')",current.get().id());
            return list().stream().filter(j->j.videoId().equals(videoId)).findFirst().orElseThrow();
        });
    }
    // Only one worker, no Kafka or in-memory-only queue. No transaction during ffmpeg.
    public void runNext(){synchronized(execution){
        if(closing)return;
        Job queued=list().stream().filter(j->j.status().equals("QUEUED")).findFirst().orElse(null);if(queued==null)return;
        if(jdbc.update("UPDATE encode_job SET status='RUNNING',attempts=attempts+1,message='',progress=0 WHERE id=? AND status='QUEUED'",queued.id())!=1)return;
        try{
            var sizes=jdbc.queryForList("SELECT size_bytes FROM local_video v WHERE id=? AND (film_id IS NOT NULL OR EXISTS (SELECT 1 FROM filmography_trailer t WHERE t.video_id=v.id) OR EXISTS (SELECT 1 FROM filmography_media_draft d WHERE d.video_id=v.id OR d.trailer_id=v.id)) AND status='READY'",Long.class,queued.videoId());
            Path source=root.resolve("media/videos").resolve(UUID.fromString(queued.videoId())+".source");
            if(sizes.isEmpty()||!Files.isRegularFile(source)||Files.size(source)!=sizes.get(0))throw new FfmpegEncoder.Failure("연결된 원본이 없거나 파일이 변경됐습니다. 영상을 다시 선택해 주세요.");
            Path output=output(queued.id(),queued.attempts()+1);
            var lastProgress=new java.util.concurrent.atomic.AtomicInteger(0);
            encoder.encode(source,output,percent->{
                if(percent>lastProgress.get()){
                    jdbc.update("UPDATE encode_job SET progress=? WHERE id=? AND status='RUNNING'",percent,queued.id());
                    lastProgress.set(percent);
                }
            });
            if(closing)throw new InterruptedException();
            tx.executeWithoutResult(s->{
                if(jdbc.update("UPDATE encode_job SET status='DONE',progress=100,message='HLS 변환 완료' WHERE id=? AND status='RUNNING'",queued.id())==1){
                    String name=jdbc.queryForObject("SELECT original_name FROM local_video WHERE id=?",String.class,queued.videoId());
                    boolean trailer=jdbc.queryForObject("SELECT COUNT(*) FROM filmography_trailer WHERE video_id=?",Integer.class,queued.videoId())>0
                        ||jdbc.queryForObject("SELECT COUNT(*) FROM filmography_media_draft WHERE trailer_id=?",Integer.class,queued.videoId())>0;
                    jdbc.update("INSERT INTO app_notification(job_id,message) VALUES (?,?)",queued.id(),(trailer?"트레일러":"영상")+" 인코딩 완료 · "+name);
                }
            });
        }catch(Exception error){
            String status=closing?"INTERRUPTED":"FAILED";
            String message=closing?"앱 종료로 중단됐습니다. 재시도해 주세요.":error instanceof FfmpegEncoder.Failure?error.getMessage():"영상 변환에 실패했습니다. 파일과 저장 공간을 확인하고 재시도해 주세요.";
            jdbc.update("UPDATE encode_job SET status=?,message=? WHERE id=? AND status='RUNNING'",status,message,queued.id());
        }
    }}
    Path output(String id,int attempt){return root.resolve("media/encoded").resolve(UUID.fromString(id).toString()).resolve("attempt-"+attempt);}
    @PreDestroy public void close(){closing=true;encoder.stop();jdbc.update("UPDATE encode_job SET status='INTERRUPTED',message='앱 종료로 중단됐습니다. 재시도해 주세요.' WHERE status='RUNNING'");}
}
