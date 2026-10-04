package com.onfilm.local.profile;

import com.onfilm.local.OnfilmLocalApplication;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.*;

public class LocalPersistenceTest {
    @TempDir protected Path temporary;

    protected ConfigurableApplicationContext start() {
        return new SpringApplicationBuilder(OnfilmLocalApplication.class).run(
                "--spring.main.web-application-type=none", "--spring.main.banner-mode=off",
                "--onfilm.encoding-worker=false",
                "--onfilm.data-dir=" + temporary.resolve("한글 프로필"),
                "--onfilm.token=" + "test".repeat(16), "--onfilm.instance-id=test",
                "--logging.level.root=WARN");
    }

    @Test
    protected void linksAndTagsAreAtomicAndPreservePhotos() throws Exception {
        try (var context=start()) {
            var profiles=context.getBean(ProfileController.class);
            context.getBean(JdbcTemplate.class).update("UPDATE profile SET portrait=? WHERE id=1", new byte[]{1,2});
            var sns=java.util.List.of(new ProfileExtras.Sns("INSTAGRAM","https://instagram.com/actor"));
            profiles.update(new ProfileController.Update("배우", "소개", 0L, null, "서울", sns, java.util.List.of("#액션")));
            assertThatThrownBy(()->profiles.update(new ProfileController.Update("손실 금지", "", 1L, null,"",java.util.List.of(new ProfileExtras.Sns("ETC","javascript:alert(1)")),java.util.List.of())))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(profiles.get().name()).isEqualTo("배우");
            assertThat(profiles.get().version()).isEqualTo(1);
        }
        try(var context=start()) {
            var saved=context.getBean(ProfileController.class).get();
            assertThat(saved.snsList()).hasSize(1);
            assertThat(saved.rawTags()).containsExactly("액션");
            assertThat(saved.hasPortrait()).isTrue();
        }
    }

    @Test
    protected void portraitReplacementFailureAndDeletionSurviveRestart() throws Exception {
        byte[] original;
        try (var context = start()) {
            var portraits = context.getBean(PortraitController.class);
            var output = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", output);
            var file = new org.springframework.mock.web.MockMultipartFile("file", "../../photo.png", "image/png", output.toByteArray());
            portraits.upload(file, 0);
            original = portraits.get().getBody();
            assertThat(original).isNotEmpty();
            assertThatThrownBy(() -> portraits.upload(file, 0)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            var fake = new org.springframework.mock.web.MockMultipartFile("file", "fake.png", "image/png", "not an image".getBytes());
            assertThatThrownBy(() -> portraits.upload(fake, 1)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(portraits.get().getBody()).isEqualTo(original);
            assertThat(context.getBean(ProfileController.class).get().version()).isEqualTo(1);
        }
        try (var context = start()) {
            var portraits = context.getBean(PortraitController.class);
            assertThat(portraits.get().getBody()).isEqualTo(original);
            portraits.delete(1);
        }
        try (var context = start()) {
            assertThat(context.getBean(ProfileController.class).get().hasPortrait()).isFalse();
            assertThatThrownBy(() -> context.getBean(PortraitController.class).get()).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
    }

    @Test
    protected void migrationsAndProfileSurviveRestartWithoutReseeding() {
        try (var context = start()) {
            var profiles = context.getBean(ProfileController.class);
            assertThat(profiles.get().version()).isZero();
            var saved = profiles.update(new ProfileController.Update("배우 이름", "로컬 소개", 0L));
            assertThat(saved.version()).isEqualTo(1);
            assertThatThrownBy(() -> profiles.update(new ProfileController.Update("stale", "stale", 0L)))
                    .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(profiles.get().name()).isEqualTo("배우 이름");
            assertThatThrownBy(() -> context.getBean(JdbcTemplate.class).update(
                    "INSERT INTO profile (id, name, one_line_intro, version) VALUES (2, 'other', '', 0)"))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
        try (var context = start()) {
            var saved = context.getBean(ProfileController.class).get();
            assertThat(saved.name()).isEqualTo("배우 이름");
            assertThat(saved.oneLineIntro()).isEqualTo("로컬 소개");
            assertThat(saved.version()).isEqualTo(1);
            assertThat(context.getBean(JdbcTemplate.class).queryForObject(
                    "SELECT COUNT(*) FROM profile", Integer.class)).isEqualTo(1);
        }
    }
}
