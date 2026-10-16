package com.onfilm.local.media.video;

import com.onfilm.local.profile.LocalPersistenceTest;
import com.onfilm.local.filmography.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

class UnusedMediaCleanupTest extends LocalPersistenceTest {
    private Path data(){return temporary.resolve("한글 프로필");}
    private byte[] source(){byte[] b=new byte[32];b[4]='f';b[5]='t';b[6]='y';b[7]='p';return b;}
    private String upload(LocalVideoService videos,FilmographyDraftController drafts,String draft)throws Exception{
        videos.uploadDraft(draft,"video.mp4",32,new ByteArrayInputStream(source()));return drafts.get(draft).video().id();
    }
    private Path file(String id){return data().resolve("media/videos/"+id+".source");}
    private String job(JdbcTemplate jdbc,String video,String status)throws Exception{
        String id=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO encode_job(id,video_id,status) VALUES (?,?,?)",id,video,status);
        Path out=data().resolve("media/encoded/"+id+"/attempt-1");Files.createDirectories(out);Files.writeString(out.resolve("segment-00000.ts"),"fixture");
        return id;
    }
    @Test void replacementRemovesOnlyUnusedAppCopiesAndResultsAfterCommit()throws Exception{
        String old;
        try(var ctx=start()){
            var jdbc=ctx.getBean(JdbcTemplate.class);var videos=ctx.getBean(LocalVideoService.class);
            var drafts=ctx.getBean(FilmographyDraftController.class);var cleanup=ctx.getBean(UnusedMediaCleanup.class);
            String draft=drafts.create().id();old=upload(videos,drafts,draft);String job=job(jdbc,old,"DONE");
            jdbc.update("INSERT INTO app_notification(job_id,message) VALUES (?,?)",job,"done");
            Path original=temporary.resolve("user-original.mp4");Files.write(original,source());
            Path export=data().resolve("exports/retained-copy.ts");Files.createDirectories(export.getParent());Files.writeString(export,"snapshot");
            String replacement=upload(videos,drafts,draft);
            cleanup.clean();assertThat(file(old)).doesNotExist();assertThat(file(replacement)).exists();
            assertThat(data().resolve("media/encoded/"+job)).doesNotExist();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM local_video WHERE id=?",Integer.class,old)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_notification WHERE job_id=?",Integer.class,job)).isZero();
            assertThat(original).exists();assertThat(export).exists();
            // Rollback keeps the draft reference and therefore its file.
            var tx=new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class));
            tx.executeWithoutResult(s->{drafts.discard(draft);s.setRollbackOnly();});
            cleanup.clean();assertThat(file(replacement)).exists();
            drafts.discard(draft);cleanup.clean();assertThat(file(replacement)).doesNotExist();
        }
        try(var ctx=start()){ctx.getBean(UnusedMediaCleanup.class).clean();assertThat(file(old)).doesNotExist();}
    }
    @Test void savedFilmsTrailersAndActiveJobsAreProtected()throws Exception{
        try(var ctx=start()){
            var jdbc=ctx.getBean(JdbcTemplate.class);var videos=ctx.getBean(LocalVideoService.class);var drafts=ctx.getBean(FilmographyDraftController.class);
            var cleanup=ctx.getBean(UnusedMediaCleanup.class);String draft=drafts.create().id();String main=upload(videos,drafts,draft);
            videos.uploadTrailerDraft(draft,"trailer.mp4",32,new ByteArrayInputStream(source()));String trailer=drafts.get(draft).trailer().id();
            var films=ctx.getBean(FilmographyController.class);
            films.update(new FilmographyController.Update(0,List.of(new FilmographyController.Item(null,"film",null,null,"",List.of(),List.of(),"","")),List.of(new FilmographyController.MediaChange(0,draft))));
            cleanup.clean();assertThat(file(main)).exists();assertThat(file(trailer)).exists();
            String running=job(jdbc,main,"RUNNING"),queued=job(jdbc,trailer,"QUEUED");
            films.update(new FilmographyController.Update(1,List.of()));cleanup.clean();
            assertThat(file(main)).exists();assertThat(file(trailer)).exists();
            jdbc.update("UPDATE encode_job SET status='FAILED' WHERE id IN (?,?)",running,queued);
            cleanup.clean();assertThat(file(main)).doesNotExist();assertThat(file(trailer)).doesNotExist();
        }
    }
    @Test void failedDeletionIsDurableAndNeverFollowsSymlinks()throws Exception{
        String id,job;
        Path outside=temporary.resolve("outside");Files.createDirectories(outside);Files.writeString(outside.resolve("keep"),"keep");
        try(var ctx=start()){
            var jdbc=ctx.getBean(JdbcTemplate.class);var drafts=ctx.getBean(FilmographyDraftController.class);
            String draft=drafts.create().id();id=upload(ctx.getBean(LocalVideoService.class),drafts,draft);job=job(jdbc,id,"DONE");drafts.discard(draft);
            Files.createSymbolicLink(data().resolve("media/encoded/"+job+"/external"),outside);
            ctx.getBean(UnusedMediaCleanup.class).clean();
            assertThat(jdbc.queryForObject("SELECT status FROM local_video WHERE id=?",String.class,id)).isEqualTo("DELETING");
            assertThat(outside.resolve("keep")).exists();assertThat(file(id)).exists();
        }
        Files.delete(data().resolve("media/encoded/"+job+"/external"));
        try(var ctx=start()){ctx.getBean(UnusedMediaCleanup.class).clean();assertThat(file(id)).doesNotExist();assertThat(outside.resolve("keep")).exists();}
    }
    @Test void expiredDraftsReleasePhotosButActiveDraftsRemain()throws Exception{
        try(var ctx=start()){
            var jdbc=ctx.getBean(JdbcTemplate.class);var drafts=ctx.getBean(FilmographyDraftController.class);
            String expired=drafts.create().id(),active=drafts.create().id();
            String video=upload(ctx.getBean(LocalVideoService.class),drafts,expired);
            jdbc.update("UPDATE filmography_media_draft SET last_seen_at=DATEADD('HOUR',-25,CURRENT_TIMESTAMP) WHERE id IN (?,?)",expired,active);
            drafts.touch(active);
            jdbc.update("INSERT INTO gallery_photo_draft(id,image,last_seen_at) VALUES ('old',?,DATEADD('HOUR',-25,CURRENT_TIMESTAMP)),('active',?,CURRENT_TIMESTAMP)",new byte[]{1},new byte[]{2});
            ctx.getBean(UnusedMediaCleanup.class).clean();
            assertThat(file(video)).doesNotExist();assertThat(drafts.get(active).id()).isEqualTo(active);
            assertThat(jdbc.queryForList("SELECT id FROM gallery_photo_draft",String.class)).containsExactly("active");
        }
    }
}
