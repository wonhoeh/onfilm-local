package com.onfilm.local.media.video;

import com.onfilm.local.profile.LocalPersistenceTest;

import com.onfilm.local.filmography.FilmographyController;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class LocalVideoTest extends LocalPersistenceTest {
    // Container header fixture only, intentionally not a decodable video.
    private byte[] fixture(){byte[] bytes=new byte[1024];bytes[3]=24;bytes[4]='f';bytes[5]='t';bytes[6]='y';bytes[7]='p';return bytes;}
    private String create(FilmographyController films){return films.update(new FilmographyController.Update(0,List.of(new FilmographyController.Item(null,"작품",null,null,"",List.of(),List.of(),"","")))).items().get(0).id();}
    @Test void copyReplaceRestartDetachAndPreserveOriginal() throws Exception {
        String filmId,assetId;byte[] bytes=fixture();
        Path original=temporary.resolve("배우 원본.mov");Files.write(original,bytes);
        try(var ctx=start()){
            var films=ctx.getBean(FilmographyController.class);var videos=ctx.getBean(LocalVideoService.class);filmId=create(films);
            try(var input=Files.newInputStream(original)){videos.upload(filmId,1,"배우 원본.mov",bytes.length,input);}
            var video=videos.list().get(0);assetId=video.id();assertThat(video.available()).isTrue();assertThat(video.filmId()).isEqualTo(filmId);
            Path copy=temporary.resolve("한글 프로필/media/videos/"+assetId+".source");assertThat(Files.readAllBytes(copy)).isEqualTo(bytes);
            assertThat(Files.readAllBytes(original)).isEqualTo(bytes);
            films.update(new FilmographyController.Update(2,films.get().items()));
            assertThat(videos.list()).hasSize(1);
            assertThatThrownBy(()->videos.upload(filmId,2,"new.mp4",bytes.length,new ByteArrayInputStream(bytes))).isInstanceOf(ResponseStatusException.class);
            videos.upload(filmId,3,"교체.mp4",bytes.length,new ByteArrayInputStream(bytes));
            assertThat(videos.list()).hasSize(1);assertThat(videos.list().get(0).id()).isNotEqualTo(assetId);assertThat(Files.exists(copy)).isTrue();
        }
        try(var ctx=start()){
            var videos=ctx.getBean(LocalVideoService.class);assertThat(videos.list().get(0).name()).isEqualTo("교체.mp4");assertThat(videos.list().get(0).available()).isTrue();
            videos.unlink(filmId,4);assertThat(videos.list()).isEmpty();
            videos.upload(filmId,5,"again.mp4",bytes.length,new ByteArrayInputStream(bytes));
            ctx.getBean(FilmographyController.class).update(new FilmographyController.Update(6,List.of()));assertThat(videos.list()).isEmpty();
            assertThat(Files.readAllBytes(original)).isEqualTo(bytes);
        }
        try(var ctx=start()){assertThat(ctx.getBean(LocalVideoService.class).list()).isEmpty();}
    }
    @Test void failedCopyConflictAndRestartNeverReplaceWorkingVideo() throws Exception {
        String filmId;
        try(var ctx=start()){
            var films=ctx.getBean(FilmographyController.class);var videos=ctx.getBean(LocalVideoService.class);filmId=create(films);byte[] bytes=fixture();
            videos.upload(filmId,1,"good.mp4",bytes.length,new ByteArrayInputStream(bytes));
            assertThatThrownBy(()->videos.upload(filmId,2,"bad.mp4",bytes.length+1,new ByteArrayInputStream(bytes))).isInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(()->videos.upload(filmId,2,"bad.mp4",100,new ByteArrayInputStream(new byte[100]))).isInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(()->videos.upload(filmId,2,"../bad.mp4",1024,new ByteArrayInputStream(bytes))).isInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(()->videos.upload(filmId,2,"big.mp4",LocalVideoService.MAX_BYTES+1,new ByteArrayInputStream(bytes))).isInstanceOf(ResponseStatusException.class);
            InputStream broken=new ByteArrayInputStream(bytes){@Override public synchronized int read(byte[] b,int off,int len){if(pos>=16)throw new java.io.UncheckedIOException(new IOException("simulated read failure"));return super.read(b,off,Math.min(len,16));}};
            assertThatThrownBy(()->videos.upload(filmId,2,"broken.mp4",1024,broken)).isInstanceOf(UncheckedIOException.class);
            // Another edit commits during the slow copy: final version check must reject linking.
            InputStream conflict=new ByteArrayInputStream(bytes){boolean changed;@Override public synchronized int read(byte[] b,int off,int len){if(!changed){changed=true;films.update(new FilmographyController.Update(2,films.get().items()));}return super.read(b,off,len);}};
            assertThatThrownBy(()->videos.upload(filmId,2,"conflict.mp4",1024,conflict)).isInstanceOf(ResponseStatusException.class);
            assertThat(videos.list().get(0).name()).isEqualTo("good.mp4");assertThat(films.get().version()).isEqualTo(3);
            ctx.getBean(JdbcTemplate.class).update("INSERT INTO local_video(id,original_name,size_bytes,status) VALUES (?,?,?,'COPYING')",UUID.randomUUID().toString(),"interrupted.mp4",1024);
        }
        try(var ctx=start()){
            assertThat(ctx.getBean(JdbcTemplate.class).queryForObject("SELECT COUNT(*) FROM local_video WHERE status='COPYING'",Integer.class)).isZero();
            var videos=ctx.getBean(LocalVideoService.class);assertThat(videos.list()).hasSize(1);assertThat(videos.list().get(0).name()).isEqualTo("good.mp4");
            // Missing external files are reported, not silently treated as ready for encoding.
            Path copy=temporary.resolve("한글 프로필/media/videos/"+videos.list().get(0).id()+".source");Files.move(copy,copy.resolveSibling("test-relocated.source"));
            assertThat(videos.list().get(0).available()).isFalse();
        }
    }
}
