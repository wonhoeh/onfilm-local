package com.onfilm.local.filmography;

import com.onfilm.local.profile.LocalPersistenceTest;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class FilmographyThumbnailTest extends LocalPersistenceTest {
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
