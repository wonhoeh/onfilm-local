package com.onfilm.local.filmography;

import com.onfilm.local.profile.LocalPersistenceTest;
import com.onfilm.local.export.PortfolioExportService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class FilmographyCategoryTest extends LocalPersistenceTest {
    @Test void fiveCategoriesPersistAndExportAfterRestart() throws Exception {
        var categories=List.of("ACTING","DIRECTING","LEAD","SUPPORTING","MINOR");
        try(var context=start()) {
            context.getBean(FilmographyController.class).update(new FilmographyController.Update(0,categories.stream().map(c->item(null,c)).toList()));
        }
        try(var context=start()) {
            var films=context.getBean(FilmographyController.class);
            assertThat(films.get().items()).extracting(FilmographyController.Item::category).containsExactlyElementsOf(categories);
            context.getBean(JdbcTemplate.class).update("UPDATE profile SET name='배우' WHERE id=1");
            var exports=context.getBean(PortfolioExportService.class);var export=exports.create();
            var json=context.getBean(ObjectMapper.class).readTree(exports.resource(export.id(),"portfolio.json").toFile());
            for(int i=0;i<categories.size();i++)assertThat(json.at("/films/"+i+"/category").asText()).isEqualTo(categories.get(i));
            films.update(new FilmographyController.Update(1,List.of()));
            assertThat(films.get().items()).isEmpty();
        }
    }
    @Test void existingRowsUpgradeWithoutChangingRoles() throws Exception {
        // Build the historical database without booting services that require the current schema.
        var directory=temporary.resolve("한글 프로필/database");java.nio.file.Files.createDirectories(directory);
        String url="jdbc:h2:file:"+directory.resolve("onfilm").toAbsolutePath()+";DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0";
        org.flywaydb.core.Flyway.configure().dataSource(url,"sa","").target("16").load().migrate();
        try(var connection=java.sql.DriverManager.getConnection(url,"sa","");var statement=connection.createStatement()) {
            statement.executeUpdate("INSERT INTO filmography_item (id,position,title,age_rating,roles,genres,cast_type,character_name) VALUES ('old',0,'기존 감독 작품','','DIRECTOR','','','')");
        }
        try(var context=start()) {
            var saved=context.getBean(FilmographyController.class).get().items().get(0);
            assertThat(saved.category()).isEqualTo("ACTING");
            assertThat(saved.title()).isEqualTo("기존 감독 작품");
            assertThat(saved.roles()).containsExactly("DIRECTOR");
        }
    }
    private FilmographyController.Item item(String id,String category) {
        return new FilmographyController.Item(id,"작품",2026,null,"",List.of("ACTOR","DIRECTOR"),List.of(),"CAMEO","행인",null,category);
    }
    @Test void categoriesPersistIndependentlyOfRolesAndExport() throws Exception {
        String id;
        try(var context=start()) {
            var films=context.getBean(FilmographyController.class);
            var initial=films.update(new FilmographyController.Update(0,List.of(item(null,null))));
            id=initial.items().get(0).id();
            assertThat(initial.items().get(0).category()).isEqualTo("ACTING");
            films.update(new FilmographyController.Update(1,List.of(item(id,"DIRECTING"),item(null,"MINOR"))));
            assertThatThrownBy(()->films.update(new FilmographyController.Update(2,List.of(item(id,"UNKNOWN")))))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->films.update(new FilmographyController.Update(1,List.of(item(id,"ACTING")))))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            var current=films.get();
            films.update(new FilmographyController.Update(2,List.of(item(id,null),current.items().get(1))));
            assertThat(films.get().items()).extracting(FilmographyController.Item::category).containsExactly("DIRECTING","MINOR");
            assertThat(films.get().items().get(0).roles()).containsExactly("ACTOR","DIRECTOR");
            context.getBean(JdbcTemplate.class).update("UPDATE profile SET name='배우' WHERE id=1");
            var exports=context.getBean(PortfolioExportService.class);var export=exports.create();
            var json=context.getBean(ObjectMapper.class).readTree(exports.resource(export.id(),"portfolio.json").toFile());
            assertThat(json.at("/films/0/category").asText()).isEqualTo("DIRECTING");
            assertThat(json.at("/films/1/category").asText()).isEqualTo("MINOR");
        }
        try(var context=start()) {
            var films=context.getBean(FilmographyController.class);
            assertThat(films.get().items()).extracting(FilmographyController.Item::category).containsExactly("DIRECTING","MINOR");
            assertThat(films.get().items().get(0).castType()).isEqualTo("CAMEO");
            films.update(new FilmographyController.Update(3,List.of(item(id,"ACTING"))));
            assertThat(films.get().items().get(0).category()).isEqualTo("ACTING");
        }
    }
}
