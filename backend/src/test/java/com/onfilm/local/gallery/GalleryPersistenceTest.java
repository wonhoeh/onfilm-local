package com.onfilm.local.gallery;

import com.onfilm.local.profile.LocalPersistenceTest;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class GalleryPersistenceTest extends LocalPersistenceTest {
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
