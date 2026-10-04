package com.onfilm.local.media.encoding;

import com.onfilm.local.profile.LocalPersistenceTest;
import com.onfilm.local.filmography.FilmographyController;
import com.onfilm.local.media.video.LocalVideoService;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class EncodingTest extends LocalPersistenceTest {
    private Path source() throws Exception {
        Process version;
        try{version=new ProcessBuilder("ffmpeg","-version").redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();}
        catch(java.io.IOException e){Assumptions.abort("FFmpeg required for real encoding test");return null;}
        assertThat(version.waitFor(10,TimeUnit.SECONDS)).isTrue();
        Path file=temporary.resolve("test video.mp4");
        var create=new ProcessBuilder("ffmpeg","-nostdin","-v","error","-f","lavfi","-i","testsrc=size=160x120:rate=10","-t","1","-c:v","libx264","-threads","1","-pix_fmt","yuv420p",file.toString()).redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.INHERIT).start();
        try{assertThat(create.waitFor(20,TimeUnit.SECONDS)).isTrue();assertThat(create.exitValue()).isZero();}finally{create.destroyForcibly();}
        return file;
    }
    @Test void realHlsIdempotentRequestAndRestart() throws Exception {
        Path original=source();byte[] before=Files.readAllBytes(original);String jobId,videoId;
        try(var ctx=start()){
            var films=ctx.getBean(FilmographyController.class);var videos=ctx.getBean(LocalVideoService.class);var jobs=ctx.getBean(EncodingService.class);
            var film=films.update(new FilmographyController.Update(0,List.of(new FilmographyController.Item(null,"인코딩",null,null,"",List.of(),List.of(),"","")))).items().get(0);
            try(var input=Files.newInputStream(original)){videos.upload(film.id(),1,"test.mp4",Files.size(original),input);}
            videoId=videos.list().get(0).id();jobId=jobs.request(videoId).id();assertThat(jobs.request(videoId).id()).isEqualTo(jobId);
            var playback=ctx.getBean(PlaybackController.class);String requestedId=videoId;
            assertThatThrownBy(()->playback.playback(requestedId)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            jobs.runNext();assertThat(jobs.list().get(0).status()).isEqualTo("DONE");assertThat(jobs.list().get(0).attempts()).isEqualTo(1);
            Path output=jobs.output(jobId,1);assertThat(Files.readString(output.resolve("index.m3u8"))).contains("#EXT-X-ENDLIST","segment-00000.ts");
            assertThat(Files.size(output.resolve("segment-00000.ts"))).isPositive();
            assertThat(playback.playback(videoId).title()).isEqualTo("인코딩");
            assertThat(playback.playback(videoId).manifestUrl()).isEqualTo("/api/videos/"+videoId+"/hls/index.m3u8");
            var segment=playback.content(videoId,"segment-00000.ts");
            assertThat(segment.getHeaders().getContentType().toString()).isEqualTo("video/mp2t");
            assertThat(segment.getBody().contentLength()).isEqualTo(Files.size(output.resolve("segment-00000.ts")));
            assertThatThrownBy(()->playback.content(requestedId,"../index.m3u8")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->playback.content(requestedId,"segment-99999.ts")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->playback.playback("../outside")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(jobs.request(videoId).status()).isEqualTo("DONE");jobs.runNext();assertThat(jobs.list().get(0).attempts()).isEqualTo(1);
            assertThat(Files.readAllBytes(original)).isEqualTo(before);
        }
        try(var ctx=start()){
            var job=ctx.getBean(EncodingService.class).list().get(0);assertThat(job.id()).isEqualTo(jobId);assertThat(job.status()).isEqualTo("DONE");
            var playback=ctx.getBean(PlaybackController.class);assertThat(playback.playback(videoId).title()).isEqualTo("인코딩");
            var jdbc=ctx.getBean(JdbcTemplate.class);jdbc.update("UPDATE local_video SET film_id=NULL WHERE id=?",videoId);
            assertThatThrownBy(()->playback.playback(videoId)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->playback.content(videoId,"segment-00000.ts")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
    }
    @Test void interruptedStateRetryAndInvalidVideoFailSafely() throws Exception {
        String id;
        try(var ctx=start()){
            var films=ctx.getBean(FilmographyController.class);var videos=ctx.getBean(LocalVideoService.class);var jobs=ctx.getBean(EncodingService.class);
            String film=films.update(new FilmographyController.Update(0,List.of(new FilmographyController.Item(null,"불량 영상",null,null,"",List.of(),List.of(),"","")))).items().get(0).id();
            byte[] fake=new byte[100];fake[4]='f';fake[5]='t';fake[6]='y';fake[7]='p';videos.upload(film,1,"fake.mp4",100,new java.io.ByteArrayInputStream(fake));
            id=videos.list().get(0).id();jobs.request(id);jobs.runNext();assertThat(jobs.list().get(0).status()).isEqualTo("FAILED");
            jobs.request(id);assertThat(jobs.list().get(0).status()).isEqualTo("QUEUED");
        }
        try(var ctx=start()){
            var jobs=ctx.getBean(EncodingService.class);assertThat(jobs.list().get(0).status()).isEqualTo("QUEUED");
            ctx.getBean(JdbcTemplate.class).update("UPDATE encode_job SET status='RUNNING'");
        }
        try(var ctx=start()){
            var jobs=ctx.getBean(EncodingService.class);assertThat(jobs.list().get(0).status()).isEqualTo("INTERRUPTED");
            jobs.request(id);jobs.runNext();assertThat(jobs.list().get(0).status()).isEqualTo("FAILED");assertThat(jobs.list().get(0).attempts()).isEqualTo(2);
        }
    }
    @Test void missingExecutableAndInvalidOutputGiveSafeFailure() throws Exception {
        var encoder=new FfmpegEncoder(temporary.resolve("missing").toString(),temporary.resolve("missing").toString(),new com.fasterxml.jackson.databind.ObjectMapper());
        Path input=temporary.resolve("input");Files.write(input,new byte[]{1});
        assertThatThrownBy(()->encoder.encode(input,temporary.resolve("output"))).isInstanceOf(FfmpegEncoder.Failure.class).hasMessageContaining("실행할 수 없습니다");
        Path output=temporary.resolve("invalid");Files.createDirectories(output);Files.writeString(output.resolve("index.m3u8"),"#EXTM3U\n../outside.ts\n#EXT-X-ENDLIST\n");
        assertThatThrownBy(()->encoder.validateOutput(output)).isInstanceOf(FfmpegEncoder.Failure.class);
    }
}
