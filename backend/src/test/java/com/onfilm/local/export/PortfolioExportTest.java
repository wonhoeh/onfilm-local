package com.onfilm.local.export;

import com.onfilm.local.profile.LocalPersistenceTest;
import com.onfilm.local.filmography.FilmographyController;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class PortfolioExportTest extends LocalPersistenceTest {
    @Test void archiveContainsOnlyPublicFilesAndFailedArchiveIsNotPublished()throws Exception{
        try(var ctx=start()){
            ctx.getBean(JdbcTemplate.class).update("UPDATE profile SET name='배우' WHERE id=1");
            var exports=ctx.getBean(PortfolioExportService.class);var result=exports.create();
            Path archive=exports.archive(result.id());
            try(var zip=new java.util.zip.ZipFile(archive.toFile())){
                assertThat(zip.stream().map(java.util.zip.ZipEntry::getName).toList())
                    .containsExactlyInAnyOrderElementsOf(result.files().stream().map(PortfolioExportService.Entry::path).toList());
                for(var entry:result.files())try(var in=zip.getInputStream(zip.getEntry(entry.path()))){
                    assertThat(in.readAllBytes()).isEqualTo(Files.readAllBytes(exports.resource(result.id(),entry.path())));
                }
            }
            assertThat(exports.archive(result.id())).isEqualTo(archive);
            var broken=exports.create();Files.delete(exports.resource(broken.id(),"portfolio.json"));
            assertThatThrownBy(()->exports.archive(broken.id())).isInstanceOf(java.io.IOException.class);
            try(var files=Files.list(exports.directory().resolve(broken.id()))){
                assertThat(files.map(p->p.getFileName().toString()).toList()).containsExactlyInAnyOrder("site","result.json");
            }
            assertThat(Files.exists(archive)).isTrue();
        }
    }
    @Test void staticSnapshotSurvivesRestartAndLaterEdits()throws Exception{
        String id;
        try(var ctx=start()){
            var jdbc=ctx.getBean(JdbcTemplate.class);jdbc.update("UPDATE profile SET name=?,one_line_intro=? WHERE id=1","배우 <script>bad()</script>","소개");
            var films=ctx.getBean(FilmographyController.class);
            films.update(new FilmographyController.Update(0,List.of(new FilmographyController.Item(null,"작품",2025,10,"",List.of("ACTOR"),List.of("드라마"),"",""))));
            var exports=ctx.getBean(PortfolioExportService.class);var result=exports.create();id=result.id();
            assertThat(result.fileCount()).isGreaterThan(15);assertThat(result.bytes()).isPositive();
            assertThat(exports.list()).hasSize(1);
            var json=ctx.getBean(com.fasterxml.jackson.databind.ObjectMapper.class);
            var data=json.readTree(exports.resource(id,"portfolio.json").toFile());
            assertThat(data.path("profile").path("name").asText()).isEqualTo("배우 <script>bad()</script>");
            assertThat(data.toString()).doesNotContain("version","token","jobId",temporary.toString());
            assertThat(data.path("films").get(0).path("id").asText()).isEqualTo("film-0");
            assertThat(Files.readString(exports.resource(id,"index.html"))).doesNotContain("script>bad","edit-filmography","profileSettingsBtn");
            assertThat(Files.readString(exports.resource(id,"css/actor-detail.css"))).doesNotContain("cdn.jsdelivr.net");
            assertThat(Files.readString(exports.resource(id,"video-player.html"))).contains("data-public-portfolio").doesNotContain("src=\"/","href=\"/");
            for(var entry:result.files())assertThat(Files.size(exports.resource(id,entry.path()))).isEqualTo(entry.bytes());
            jdbc.update("UPDATE profile SET name='다음 수정' WHERE id=1");
            assertThat(Files.readString(exports.resource(id,"portfolio.json"))).contains("배우").doesNotContain("다음 수정");
            assertThatThrownBy(()->exports.resource(id,"../result.json")).isInstanceOf(java.io.IOException.class);
            assertThatThrownBy(()->exports.resource(id,"result.json")).isInstanceOf(java.io.IOException.class);
            assertThatThrownBy(()->exports.resource("../outside","index.html")).isInstanceOf(java.io.IOException.class);
            Files.createDirectories(exports.directory().resolve(UUID.randomUUID()+".partial/site"));
            assertThat(exports.list()).hasSize(1);
        }
        try(var ctx=start()){assertThat(ctx.getBean(PortfolioExportService.class).list().get(0).id()).isEqualTo(id);}
    }
    @Test void unfinishedVideoCannotProduceIncompletePublicCopy()throws Exception{
        try(var ctx=start()){
            var jdbc=ctx.getBean(JdbcTemplate.class);jdbc.update("UPDATE profile SET name='배우' WHERE id=1");
            var exports=ctx.getBean(PortfolioExportService.class);String old=exports.create().id();
            var films=ctx.getBean(FilmographyController.class);
            String film=films.update(new FilmographyController.Update(0,List.of(new FilmographyController.Item(null,"미완료",null,null,"",List.of(),List.of(),"","")))).items().get(0).id();
            jdbc.update("INSERT INTO local_video(id,film_id,original_name,size_bytes,status) VALUES(?,?,?,?,'READY')",UUID.randomUUID().toString(),film,"secret-original.mp4",100);
            assertThatThrownBy(exports::create).isInstanceOf(IllegalStateException.class).hasMessageContaining("인코딩");
            assertThat(exports.list()).hasSize(1);assertThat(exports.list().get(0).id()).isEqualTo(old);assertThat(exports.busy()).isFalse();
        }
    }
}
