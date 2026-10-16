package com.onfilm.local.media.video;

import com.onfilm.local.export.PortfolioExportService;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Only DB-identified, unreferenced app copies are eligible. DELETING is a durable retry marker. */
@Service
public class UnusedMediaCleanup {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Path root;
    private final PortfolioExportService exports;
    private final java.sql.Timestamp startedAt=java.sql.Timestamp.from(java.time.Instant.now());
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(UnusedMediaCleanup.class);
    private static final String UNUSED="film_id IS NULL AND NOT EXISTS (SELECT 1 FROM filmography_trailer t WHERE t.video_id=local_video.id) "
        +"AND NOT EXISTS (SELECT 1 FROM filmography_media_draft d WHERE d.video_id=local_video.id OR d.trailer_id=local_video.id) "
        +"AND NOT EXISTS (SELECT 1 FROM encode_job j WHERE j.video_id=local_video.id AND j.status IN ('QUEUED','RUNNING')) "
        +"AND NOT EXISTS (SELECT 1 FROM trailer_edit e WHERE (e.source_id=local_video.id OR e.result_id=local_video.id) AND (e.status IN ('RUNNING','CANCELLING') OR (e.draft_id IS NOT NULL AND e.status NOT IN ('CANCELLED','APPLIED'))))";

    public UnusedMediaCleanup(JdbcTemplate jdbc,PlatformTransactionManager manager,PortfolioExportService exports,
                              @Value("${onfilm.data-dir}") String directory){
        this.jdbc=jdbc;this.tx=new TransactionTemplate(manager);this.exports=exports;
        root=Path.of(directory).toAbsolutePath().normalize();
    }
    @Scheduled(fixedDelay=10000,initialDelay=10000)
    public void clean(){
        // Export may already have captured references in a DB snapshot and still be copying them.
        synchronized(exports){
            // Only expire a previous session's abandoned drafts. Current-session edits survive sleep.
            tx.executeWithoutResult(s->{
                jdbc.update("DELETE FROM filmography_media_draft WHERE last_seen_at < DATEADD('HOUR',-24,CURRENT_TIMESTAMP) AND last_seen_at < ?",startedAt);
                jdbc.update("DELETE FROM gallery_photo_draft WHERE last_seen_at < DATEADD('HOUR',-24,CURRENT_TIMESTAMP) AND last_seen_at < ?",startedAt);
            });
            for(String id:jdbc.queryForList("SELECT id FROM local_video WHERE status IN ('READY','FAILED','INTERRUPTED','DELETING') AND "+UNUSED,String.class)){
                try{cleanOne(id);}catch(Exception error){log.warn("Unused media cleanup deferred for videoId={}",id);}
            }
        }
    }
    private void cleanOne(String id)throws IOException{
        UUID.fromString(id);
        Boolean claimed=tx.execute(s->{
            if(jdbc.queryForList("SELECT id FROM local_video WHERE id=? FOR UPDATE",String.class,id).isEmpty())return false;
            return jdbc.update("UPDATE local_video SET status='DELETING' WHERE id=? AND status IN ('READY','FAILED','INTERRUPTED','DELETING') AND "+UNUSED,id)==1;
        });
        if(!Boolean.TRUE.equals(claimed))return;
        for(String job:jdbc.queryForList("SELECT id FROM encode_job WHERE video_id=?",String.class,id)){
            UUID.fromString(job);removeTree(root.resolve("media/encoded").resolve(job));
        }
        removeTree(root.resolve("media/videos").resolve(id+".source"));
        removeTree(root.resolve("media/videos").resolve(id+".part"));
        tx.executeWithoutResult(s->{
            jdbc.update("DELETE FROM app_notification WHERE job_id IN (SELECT id FROM encode_job WHERE video_id=?)",id);
            jdbc.update("DELETE FROM encode_job WHERE video_id=?",id);
            jdbc.update("DELETE FROM local_video WHERE id=? AND status='DELETING'",id);
        });
    }
    private void removeTree(Path target)throws IOException{
        // Refuse redirected parents as well as links inside an app-owned job folder.
        Path relative=root.relativize(target),current=root;
        if(Files.isSymbolicLink(root))throw new IOException("Linked data root");
        for(Path part:relative){current=current.resolve(part);if(Files.isSymbolicLink(current))throw new IOException("Linked media path");}
        if(!Files.exists(target,LinkOption.NOFOLLOW_LINKS))return;
        List<Path> paths;
        try(var stream=Files.walk(target)){paths=stream.sorted(Comparator.reverseOrder()).toList();}
        if(paths.stream().anyMatch(Files::isSymbolicLink))throw new IOException("Linked media file");
        for(Path path:paths)Files.deleteIfExists(path);
    }
}
