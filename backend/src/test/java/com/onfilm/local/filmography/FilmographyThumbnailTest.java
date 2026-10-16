package com.onfilm.local.filmography;

import com.onfilm.local.profile.LocalPersistenceTest;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class FilmographyThumbnailTest extends LocalPersistenceTest {
    @Test void stagedPositionPersistsExportsAndMetadataOnlyEditsPreserveIt()throws Exception {
        var output=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(100,200,1),"png",output);
        var file=new MockMultipartFile("file","thumb.png","image/png",output.toByteArray());
        String id;byte[] bytes;
        try(var context=start()){
            var films=context.getBean(FilmographyController.class);var drafts=context.getBean(FilmographyDraftController.class);
            var draft=drafts.thumbnail(drafts.create().id(),file);
            var item=new FilmographyController.Item(null,"작품",2026,null,"",List.of(),List.of(),"","",new com.onfilm.local.media.image.ImagePosition(20,90),"ACTING",new com.onfilm.local.media.image.ImagePosition(80,10));
            var result=films.update(new FilmographyController.Update(0,List.of(item),List.of(new FilmographyController.MediaChange(0,draft.id()))));
            id=result.items().get(0).id();assertThat(result.items().get(0).thumbnailPosition()).isEqualTo(item.thumbnailPosition());
            bytes=context.getBean(FilmographyThumbnailController.class).get(id).getBody();
            assertThatThrownBy(()->films.update(new FilmographyController.Update(0,List.of()))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            films.update(new FilmographyController.Update(1,List.of(new FilmographyController.Item(id,"새 제목",2026,null,"",List.of(),List.of(),"",""))));
            assertThat(films.get().items().get(0).thumbnailPosition()).isEqualTo(item.thumbnailPosition());
            assertThat(films.get().items().get(0).mobileThumbnailPosition()).isEqualTo(item.mobileThumbnailPosition());
            assertThat(context.getBean(FilmographyThumbnailController.class).get(id).getBody()).isEqualTo(bytes);
            context.getBean(org.springframework.jdbc.core.JdbcTemplate.class).update("UPDATE profile SET name='배우' WHERE id=1");
            var exports=context.getBean(com.onfilm.local.export.PortfolioExportService.class);var exported=exports.create();
            var json=context.getBean(com.fasterxml.jackson.databind.ObjectMapper.class).readTree(exports.resource(exported.id(),"portfolio.json").toFile());
            assertThat(json.at("/films/0/thumbnailPosition/y").asInt()).isEqualTo(90);
            assertThat(json.at("/films/0/mobileThumbnailPosition/x").asInt()).isEqualTo(80);
        }
        try(var context=start()){
            var films=context.getBean(FilmographyController.class);var thumbs=context.getBean(FilmographyThumbnailController.class);
            assertThat(films.get().items().get(0).thumbnailPosition()).isEqualTo(new com.onfilm.local.media.image.ImagePosition(20,90));
            assertThat(films.get().items().get(0).mobileThumbnailPosition()).isEqualTo(new com.onfilm.local.media.image.ImagePosition(80,10));
            assertThat(thumbs.get(id).getBody()).isEqualTo(bytes);
            thumbs.upload(id,file,2);assertThat(films.get().items().get(0).thumbnailPosition()).isEqualTo(com.onfilm.local.media.image.ImagePosition.center());
            assertThat(films.get().items().get(0).mobileThumbnailPosition()).isEqualTo(com.onfilm.local.media.image.ImagePosition.center());
            thumbs.delete(id,3);assertThat(films.get().thumbnailIds()).isEmpty();
        }
    }
    @Test void replaceRejectRestartAndCascadeDelete() throws Exception {
        String id;byte[] saved;
        var output=new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(12,8,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",output);
        var file=new MockMultipartFile("file","photo.png","image/png",output.toByteArray());
        try(var context=start()){
            var films=context.getBean(FilmographyController.class);
            var thumbs=context.getBean(FilmographyThumbnailController.class);
            var item=new FilmographyController.Item(null,"작품",2026,null,"",List.of(),List.of(),"","");
            id=films.update(new FilmographyController.Update(0,List.of(item))).items().get(0).id();
            thumbs.upload(id,file,1);saved=thumbs.get(id).getBody();
            assertThat(films.get().thumbnailIds()).containsExactly(id);
            assertThatThrownBy(()->thumbs.upload(id,file,1)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->thumbs.upload(id,new MockMultipartFile("file","bad.png","image/png",new byte[]{1}),2)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->thumbs.upload("unknown",file,2)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(films.get().version()).isEqualTo(2);
            assertThat(thumbs.get(id).getBody()).isEqualTo(saved);
            // Metadata update must preserve image; stale metadata must not remove it.
            films.update(new FilmographyController.Update(2,films.get().items()));
            assertThatThrownBy(()->films.update(new FilmographyController.Update(2,List.of()))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
        try(var context=start()){
            var films=context.getBean(FilmographyController.class);
            var thumbs=context.getBean(FilmographyThumbnailController.class);
            assertThat(thumbs.get(id).getBody()).isEqualTo(saved);
            thumbs.upload(id,file,3);
            thumbs.delete(id,4);
            assertThat(films.get().thumbnailIds()).isEmpty();
            thumbs.upload(id,file,5);
            films.update(new FilmographyController.Update(6,List.of()));
            assertThat(films.get().thumbnailIds()).isEmpty();
        }
        try(var context=start()){
            assertThatThrownBy(()->context.getBean(FilmographyThumbnailController.class).get(id)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
    }
}
