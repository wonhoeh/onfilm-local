package com.onfilm.local.gallery;

import com.onfilm.local.profile.LocalPersistenceTest;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class GalleryPersistenceTest extends LocalPersistenceTest {
    @Test void displayPositionFollowsIdThroughReorderRotationAndRestart()throws Exception {
        var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(6,3,1),"png",out);
        var file=new MockMultipartFile("file","photo.png","image/png",out.toByteArray());
        String first,second;byte[] bytes;
        try(var context=start()) {
            var api=context.getBean(GalleryController.class);
            first=api.add(file,0).ids().get(0);second=api.add(file,1).ids().get(1);bytes=api.image(first).getBody();
            var position=new com.onfilm.local.media.image.ImagePosition(90,20);
            api.save(new GalleryController.Edit(2,List.of(new GalleryController.Photo(second,null,0),new GalleryController.Photo(first,null,0,position))));
            assertThat(api.get().positions().get(first)).isEqualTo(position);
            assertThat(api.image(first).getBody()).isEqualTo(bytes);
            assertThatThrownBy(()->api.save(new GalleryController.Edit(3,List.of(new GalleryController.Photo(first,null,0,new com.onfilm.local.media.image.ImagePosition(0,0)),new GalleryController.Photo("missing",null,0))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(api.get().version()).isEqualTo(3);assertThat(api.get().positions().get(first)).isEqualTo(position);
        }
        try(var context=start()) {
            var api=context.getBean(GalleryController.class);
            assertThat(api.get().ids()).containsExactly(second,first);
            assertThat(api.get().positions().get(first)).isEqualTo(new com.onfilm.local.media.image.ImagePosition(90,20));
            api.save(new GalleryController.Edit(3,List.of(new GalleryController.Photo(first,null,1))));
            assertThat(api.get().positions().get(first)).isEqualTo(new com.onfilm.local.media.image.ImagePosition(80,90));
            assertThat(api.get().positions()).doesNotContainKey(second);
        }
    }
    @Test void stagedRotationAtomicSaveAndRestart()throws Exception {
        var image=new java.awt.image.BufferedImage(3,2,java.awt.image.BufferedImage.TYPE_INT_ARGB);
        image.setRGB(0,0,0xffff0000);image.setRGB(2,1,0xff0000ff);
        var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(image,"png",out);
        var file=new MockMultipartFile("file","photo.png","image/png",out.toByteArray());
        String draft,id;
        try(var context=start()){
            var api=context.getBean(GalleryController.class);draft=api.stage(file).id();
            assertThat(api.get().ids()).isEmpty();assertThat(api.get().version()).isZero();
            assertThatThrownBy(()->api.save(new GalleryController.Edit(0,List.of(new GalleryController.Photo(null,draft,1),new GalleryController.Photo("missing",null,0))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(api.get().ids()).isEmpty();assertThat(api.get().version()).isZero();assertThat(api.draftImage(draft).getBody()).isNotEmpty();
        }
        try(var context=start()){
            var api=context.getBean(GalleryController.class);
            id=api.save(new GalleryController.Edit(0,List.of(new GalleryController.Photo(null,draft,1)))).ids().get(0);
            var rotated=javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(api.image(id).getBody()));
            assertThat(rotated.getWidth()).isEqualTo(2);assertThat(rotated.getHeight()).isEqualTo(3);
            assertThat(rotated.getRGB(1,0)).isEqualTo(0xffff0000);assertThat(rotated.getRGB(0,2)).isEqualTo(0xff0000ff);
            assertThatThrownBy(()->api.save(new GalleryController.Edit(0,List.of()))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->api.save(new GalleryController.Edit(1,List.of(new GalleryController.Photo(id,null,1),new GalleryController.Photo(id,null,0))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(api.get().version()).isEqualTo(1);
            for(int i=0;i<3;i++)api.save(new GalleryController.Edit(api.get().version(),List.of(new GalleryController.Photo(id,null,1))));
            var restored=javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(api.image(id).getBody()));
            assertThat(restored.getWidth()).isEqualTo(3);assertThat(restored.getHeight()).isEqualTo(2);
            assertThat(restored.getRGB(0,0)).isEqualTo(0xffff0000);assertThat(restored.getRGB(2,1)).isEqualTo(0xff0000ff);
        }
        try(var context=start()){
            var api=context.getBean(GalleryController.class);assertThat(api.get().ids()).containsExactly(id);
            api.save(new GalleryController.Edit(api.get().version(),List.of()));assertThat(api.get().ids()).isEmpty();
        }
    }
    @Test
    void galleryOrderFailuresLimitAndDeletePersist() throws Exception {
        var output = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2, 2, 1), "png", output);
        var file = new MockMultipartFile("file", "photo.png", "image/png", output.toByteArray());
        String first, second;
        try (var context = start()) {
            var gallery = context.getBean(GalleryController.class);
            first = gallery.add(file, 0).ids().get(0);
            second = gallery.add(file, 1).ids().get(1);
            gallery.reorder(new GalleryController.Order(2, List.of(second, first)));
            assertThatThrownBy(() -> gallery.delete(first, 2)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(() -> gallery.reorder(new GalleryController.Order(3, List.of(first, first)))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(gallery.get().version()).isEqualTo(3);
            var fake = new MockMultipartFile("file", "fake.png", "image/png", new byte[]{1});
            assertThatThrownBy(() -> gallery.add(fake, 3)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(gallery.get().ids()).containsExactly(second, first);
        }
        try (var context = start()) {
            var gallery = context.getBean(GalleryController.class);
            assertThat(gallery.get().ids()).containsExactly(second, first);
            assertThat(gallery.image(first).getBody()).isNotEmpty();
            gallery.delete(first, 3);
            for (int i=0; i<11; i++) gallery.add(file, gallery.get().version());
            long version = gallery.get().version();
            assertThatThrownBy(() -> gallery.add(file, version)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(gallery.get().ids()).hasSize(12).doesNotContain(first);
            assertThat(gallery.get().version()).isEqualTo(version);
        }
        try (var context = start()) {
            var gallery = context.getBean(GalleryController.class);
            assertThat(gallery.get().ids()).hasSize(12).doesNotContain(first);
            assertThatThrownBy(() -> gallery.image(first)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
    }
}
