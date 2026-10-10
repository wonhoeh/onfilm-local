package com.onfilm.local.filmography;

import com.onfilm.local.profile.LocalPersistenceTest;
import com.onfilm.local.media.video.LocalVideoService;
import com.onfilm.local.media.encoding.EncodingService;
import com.onfilm.local.media.encoding.PlaybackController;
import java.io.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class FilmographyDraftPersistenceTest extends LocalPersistenceTest {
    @Test void trailerIsIndependentAndCommittedAtomically()throws Exception{
        String filmId,mainId,trailerId;
        try(var c=start()){
            var drafts=c.getBean(FilmographyDraftController.class);var api=c.getBean(FilmographyController.class);var videos=c.getBean(LocalVideoService.class);
            String draft=drafts.create().id();
            videos.uploadDraft(draft,"main.mp4",32,new ByteArrayInputStream(source()));
            videos.uploadTrailerDraft(draft,"trailer.mp4",32,new ByteArrayInputStream(source()));
            mainId=drafts.get(draft).video().id();trailerId=drafts.get(draft).trailer().id();
            assertThat(mainId).isNotEqualTo(trailerId);assertThat(api.get().trailers()).isEmpty();
            assertThat(c.getBean(EncodingService.class).request(trailerId).status()).isEqualTo("QUEUED");
            assertThatThrownBy(()->api.update(new FilmographyController.Update(0,List.of(item(null,"film"),item("missing","bad")),List.of(new FilmographyController.MediaChange(0,draft))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(drafts.get(draft).trailer().id()).isEqualTo(trailerId);assertThat(api.get().trailers()).isEmpty();
            var saved=api.update(new FilmographyController.Update(0,List.of(item(null,"film")),List.of(new FilmographyController.MediaChange(0,draft))));
            filmId=saved.items().get(0).id();assertThat(saved.videos().get(0).id()).isEqualTo(mainId);assertThat(saved.trailers().get(0).id()).isEqualTo(trailerId);
        }
        try(var c=start()){
            var api=c.getBean(FilmographyController.class);var drafts=c.getBean(FilmographyDraftController.class);
            assertThat(api.get().trailers().get(0).id()).isEqualTo(trailerId);
            var draft=drafts.create();drafts.removeTrailer(draft.id());assertThat(api.get().trailers()).hasSize(1);
            api.update(new FilmographyController.Update(1,List.of(item(filmId,"film")),List.of(new FilmographyController.MediaChange(0,draft.id()))));
            assertThat(api.get().trailers()).isEmpty();assertThat(api.get().videos().get(0).id()).isEqualTo(mainId);
            assertThatThrownBy(()->c.getBean(PlaybackController.class).playback(trailerId)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
    }
    private FilmographyController.Item item(String id,String title){return new FilmographyController.Item(id,title,2026,1,"ALL",List.of(),List.of(),"","");}
    private byte[] source(){byte[] bytes=new byte[32];bytes[4]='f';bytes[5]='t';bytes[6]='y';bytes[7]='p';return bytes;}
    @Test void stageEncodeThenCommitTogetherAndRestart()throws Exception{
        String draftId,videoId,filmId;
        try(var c=start()){
            var drafts=c.getBean(FilmographyDraftController.class);var api=c.getBean(FilmographyController.class);
            draftId=drafts.create().id();
            var out=new ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(8,8,1),"png",out);
            drafts.thumbnail(draftId,new MockMultipartFile("file","image.png","image/png",out.toByteArray()));
            c.getBean(LocalVideoService.class).uploadDraft(draftId,"video.mp4",32,new ByteArrayInputStream(source()));
            videoId=drafts.get(draftId).video().id();
            assertThat(api.get().items()).isEmpty();assertThat(api.get().videos()).isEmpty();assertThat(api.get().thumbnailIds()).isEmpty();assertThat(api.get().version()).isZero();
            assertThat(c.getBean(EncodingService.class).request(videoId).status()).isEqualTo("QUEUED");
            assertThatThrownBy(()->c.getBean(PlaybackController.class).playback(videoId)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            // Even a failure after applying the first draft rolls back all metadata and media links.
            var bad=item(null," ");
            assertThatThrownBy(()->api.update(new FilmographyController.Update(0,List.of(item(null,"first"),bad),List.of(new FilmographyController.MediaChange(0,draftId))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(api.get().version()).isZero();assertThat(drafts.get(draftId).video().filmId()).isNull();
            assertThatThrownBy(()->api.update(new FilmographyController.Update(0,List.of(item(null,"first"),item("missing","bad")),List.of(new FilmographyController.MediaChange(0,draftId))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(api.get().items()).isEmpty();assertThat(drafts.get(draftId).thumbnailPresent()).isTrue();
        }
        try(var c=start()){
            var api=c.getBean(FilmographyController.class);
            var saved=api.update(new FilmographyController.Update(0,List.of(item(null,"new film")),List.of(new FilmographyController.MediaChange(0,draftId))));
            filmId=saved.items().get(0).id();assertThat(saved.thumbnailIds()).containsExactly(filmId);
            assertThat(saved.videos()).hasSize(1);assertThat(saved.videos().get(0).id()).isEqualTo(videoId);
            assertThatThrownBy(()->api.update(new FilmographyController.Update(0,List.of(item(null,"new film")),List.of(new FilmographyController.MediaChange(0,draftId))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->c.getBean(FilmographyDraftController.class).get(draftId)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(api.get().items()).hasSize(1);
            var draft=c.getBean(FilmographyDraftController.class).create();
            c.getBean(FilmographyDraftController.class).removeThumbnail(draft.id());c.getBean(FilmographyDraftController.class).removeVideo(draft.id());
            assertThat(api.get().videos()).hasSize(1); // No effect until final save.
            assertThatThrownBy(()->api.update(new FilmographyController.Update(1,List.of(item(filmId,"should roll back"),item("missing","bad")),List.of(new FilmographyController.MediaChange(0,draft.id()))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(api.get().items().get(0).title()).isEqualTo("new film");
            assertThat(api.get().videos().get(0).id()).isEqualTo(videoId);
            assertThat(api.get().thumbnailIds()).containsExactly(filmId);
            assertThat(api.get().version()).isEqualTo(1);
            api.update(new FilmographyController.Update(1,List.of(item(filmId,"edited")),List.of(new FilmographyController.MediaChange(0,draft.id()))));
            assertThat(api.get().videos()).isEmpty();assertThat(api.get().thumbnailIds()).isEmpty();
            assertThat(c.getBean(JdbcTemplate.class).queryForObject("SELECT COUNT(*) FROM local_video WHERE id=?",Integer.class,videoId)).isEqualTo(1);
        }
        try(var c=start()){var saved=c.getBean(FilmographyController.class).get();assertThat(saved.items().get(0).title()).isEqualTo("edited");assertThat(saved.videos()).isEmpty();}
    }
}
