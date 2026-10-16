package com.onfilm.local.media.encoding;

import com.onfilm.local.profile.LocalPersistenceTest;
import com.onfilm.local.filmography.*;
import com.onfilm.local.media.video.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class TrailerEditingTest extends LocalPersistenceTest {
    private Path fixture() throws Exception {
        Path path=temporary.resolve("원본.mp4");
        Process p=new ProcessBuilder("ffmpeg","-nostdin","-v","error","-f","lavfi","-i","testsrc=size=160x120:rate=10","-t","4","-c:v","libx264","-threads","1","-pix_fmt","yuv420p",path.toString()).redirectError(ProcessBuilder.Redirect.INHERIT).start();
        try{assertThat(p.waitFor(20,TimeUnit.SECONDS)).isTrue();assertThat(p.exitValue()).isZero();}finally{p.destroyForcibly();}
        return path;
    }
    private void upload(LocalVideoService videos,String draft,Path path)throws Exception{
        try(var input=Files.newInputStream(path)){videos.uploadDraft(draft,"original.mp4",Files.size(path),input);}
    }
    @Test void cutAcceptSaveAndRestartPreserveOriginal() throws Exception {
        Path original=fixture();byte[] bytes=Files.readAllBytes(original);String result;
        try(var ctx=start()){
            var edits=ctx.getBean(TrailerEditingService.class);var drafts=ctx.getBean(FilmographyDraftController.class);var videos=ctx.getBean(LocalVideoService.class);var films=ctx.getBean(FilmographyController.class);var worker=ctx.getBean(EncodingService.class);
            var draft=drafts.create();upload(videos,draft.id(),original);String source=drafts.get(draft.id()).video().id();
            var edit=edits.open(draft.id(),source,null);assertThat(edits.open(draft.id(),source,null).id()).isEqualTo(edit.id());
            assertThat(edits.activeJobs()).hasSize(1);worker.runNext();assertThat(edits.get(edit.id()).status()).isEqualTo("READY");
            assertThat(edits.get(edit.id()).duration()).isCloseTo(4,within(.1));
            assertThatThrownBy(()->edits.cut(edit.id(),3,2)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            edits.retryProbe(edit.id());worker.runNext();assertThat(edits.get(edit.id()).previewReady()).isFalse();
            assertThat(Files.exists(temporary.resolve("한글 프로필/media/trailer-edits").resolve(edit.id()).resolve("preview.mp4"))).isFalse();
            var queued=edits.cut(edit.id(),1,3);assertThat(edits.cut(edit.id(),1,3).resultId()).isEqualTo(queued.resultId());
            ctx.getBean(UnusedMediaCleanup.class).clean();assertThat(drafts.get(draft.id()).video()).isNotNull();
            worker.runNext();var done=edits.get(edit.id());assertThat(done.status()).isEqualTo("DONE");assertThat(done.progress()).isEqualTo(100);result=done.resultId();
            assertThat(ctx.getBean(FfmpegEncoder.class).inspect(edits.content(edit.id(),"result"),()->false).duration()).isCloseTo(2,within(.15));
            assertThat(drafts.get(draft.id()).trailer()).isNull();assertThat(films.get().trailers()).isEmpty();
            edits.accept(edit.id());worker.runNext();edits.accept(edit.id()); // Lost response retry remains safe after cleanup tick.
            assertThat(drafts.get(draft.id()).trailer().id()).isEqualTo(result);
            var item=new FilmographyController.Item(null,"트레일러 작품",2026,null,"",List.of("ACTOR"),List.of(),"","");
            var saved=films.update(new FilmographyController.Update(0,List.of(item),List.of(new FilmographyController.MediaChange(0,draft.id()))));
            assertThat(saved.trailers().get(0).id()).isEqualTo(result);
            worker.runNext();ctx.getBean(UnusedMediaCleanup.class).clean();
            assertThat(videos.findReady(result)).isNotNull();assertThat(Files.readAllBytes(original)).isEqualTo(bytes);
            assertThat(ctx.getBean(JdbcTemplate.class).queryForObject("SELECT COUNT(*) FROM trailer_edit",Integer.class)).isZero();
        }
        try(var ctx=start()){
            assertThat(ctx.getBean(FilmographyController.class).get().trailers().get(0).id()).isEqualTo(result);
            assertThat(ctx.getBean(EncodingService.class).list()).anyMatch(j->j.videoId().equals(result)&&j.status().equals("DONE"));
        }
    }
    @Test void cancelAndAbandonedDraftCleanOnlyGeneratedCopies()throws Exception{
        Path original=fixture();
        try(var ctx=start()){
            var edits=ctx.getBean(TrailerEditingService.class);var drafts=ctx.getBean(FilmographyDraftController.class);var videos=ctx.getBean(LocalVideoService.class);var cleanup=ctx.getBean(UnusedMediaCleanup.class);
            var d=drafts.create();upload(videos,d.id(),original);String source=drafts.get(d.id()).video().id();var e=edits.open(d.id(),source,null);edits.runNext();
            var cut=edits.cut(e.id(),0,1);edits.cancel(e.id());edits.cancel(e.id());edits.runNext();edits.cancel(e.id());cleanup.clean();
            assertThat(videos.findReady(source)).isNotNull();assertThat(ctx.getBean(JdbcTemplate.class).queryForObject("SELECT COUNT(*) FROM local_video WHERE id=?",Integer.class,cut.resultId())).isZero();
            var another=edits.open(d.id(),source,null);drafts.discard(d.id());edits.runNext();cleanup.clean();
            assertThatThrownBy(()->edits.get(another.id())).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(Files.exists(original)).isTrue();
        }
    }
    @Test void interruptedEditingIsRecoverableAfterFileDatabaseRestart()throws Exception{
        Path original=fixture();String id;
        try(var ctx=start()){
            var d=ctx.getBean(FilmographyDraftController.class).create();upload(ctx.getBean(LocalVideoService.class),d.id(),original);
            var e=ctx.getBean(TrailerEditingService.class).open(d.id(),ctx.getBean(FilmographyDraftController.class).get(d.id()).video().id(),null);id=e.id();
            ctx.getBean(JdbcTemplate.class).update("UPDATE trailer_edit SET status='RUNNING' WHERE id=?",id);
        }
        try(var ctx=start()){
            var edits=ctx.getBean(TrailerEditingService.class);assertThat(edits.get(id).status()).isEqualTo("INTERRUPTED");edits.retryProbe(id);edits.runNext();assertThat(edits.get(id).status()).isEqualTo("READY");
        }
    }
    @Test void repeatedCancelKeepsActiveProcessFilesProtected()throws Exception{
        Path original=fixture();
        try(var ctx=start()){
            var edits=ctx.getBean(TrailerEditingService.class);var drafts=ctx.getBean(FilmographyDraftController.class);var videos=ctx.getBean(LocalVideoService.class);var jdbc=ctx.getBean(JdbcTemplate.class);
            var d=drafts.create();upload(videos,d.id(),original);String source=drafts.get(d.id()).video().id();var e=edits.open(d.id(),source,null);edits.runNext();
            var cut=edits.cut(e.id(),0,1);jdbc.update("UPDATE trailer_edit SET status='RUNNING' WHERE id=?",e.id());
            edits.cancel(e.id());edits.cancel(e.id());assertThat(edits.get(e.id()).status()).isEqualTo("CANCELLING");
            drafts.discard(d.id());ctx.getBean(UnusedMediaCleanup.class).clean();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM local_video WHERE id=?",Integer.class,source)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM local_video WHERE id=?",Integer.class,cut.resultId())).isEqualTo(1);
        }
    }
}
