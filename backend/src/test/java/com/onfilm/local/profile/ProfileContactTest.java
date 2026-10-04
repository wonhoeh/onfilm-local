package com.onfilm.local.profile;

import com.onfilm.local.export.PortfolioExportService;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class ProfileContactTest extends LocalPersistenceTest {
    @Test void migrationPreservesExistingProfile()throws Exception{
        String url="jdbc:h2:file:"+temporary.resolve("upgrade").toAbsolutePath();
        org.flywaydb.core.Flyway.configure().dataSource(url,"sa","").target("8").load().migrate();
        try(var c=java.sql.DriverManager.getConnection(url,"sa","");var s=c.createStatement()){
            s.executeUpdate("UPDATE profile SET name='기존 배우',version=7,portrait=X'0102' WHERE id=1");
        }
        org.flywaydb.core.Flyway.configure().dataSource(url,"sa","").load().migrate();
        try(var c=java.sql.DriverManager.getConnection(url,"sa","");var s=c.createStatement();var r=s.executeQuery("SELECT * FROM profile WHERE id=1")){
            assertThat(r.next()).isTrue();assertThat(r.getString("name")).isEqualTo("기존 배우");
            assertThat(r.getLong("version")).isEqualTo(7);assertThat(r.getBytes("portrait")).containsExactly(1,2);
            assertThat(r.getString("contact_email")).isEmpty();
        }
    }
    @Test void emailOnlyPersistsAndLegacyPhoneNeverReachesExport()throws Exception{
        String old;
        try(var ctx=start()){
            var profiles=ctx.getBean(ProfileController.class);
            ctx.getBean(JdbcTemplate.class).update("UPDATE profile SET contact_phone='01012345678',public_phone=TRUE,public_email=FALSE WHERE id=1");
            profiles.update(new ProfileController.Update("배우","",0L,null,"",null,null,new ProfileContact(" actor@example.com ")));
            var exports=ctx.getBean(PortfolioExportService.class);old=exports.create().id();
            assertThat(Files.readString(exports.resource(old,"portfolio.json"))).contains("actor@example.com").doesNotContain("01012345678","publicEmail","phone");
            assertThat(ctx.getBean(com.fasterxml.jackson.databind.ObjectMapper.class).writeValueAsString(profiles.get().contact())).isEqualTo("{\"email\":\"actor@example.com\"}");
            try(var zip=new java.util.zip.ZipFile(exports.archive(old).toFile());var in=zip.getInputStream(zip.getEntry("portfolio.json"))){
                assertThat(new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8)).doesNotContain("01012345678");
            }
            assertThatThrownBy(()->profiles.update(new ProfileController.Update("충돌","",0L,null,"",null,null,new ProfileContact("")))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
        try(var ctx=start()){
            var profiles=ctx.getBean(ProfileController.class);
            assertThat(profiles.get().contact().email()).isEqualTo("actor@example.com");
            profiles.update(new ProfileController.Update("배우","수정",1L));
            assertThat(profiles.get().contact().email()).isEqualTo("actor@example.com");
            profiles.update(new ProfileController.Update("배우","",2L,null,"",null,null,new ProfileContact("  ")));
            var exports=ctx.getBean(PortfolioExportService.class);
            assertThat(Files.readString(exports.resource(exports.create().id(),"portfolio.json"))).contains("\"contact\":{}").doesNotContain("actor@example.com","01012345678");
            assertThat(Files.readString(exports.resource(old,"portfolio.json"))).contains("actor@example.com");
            assertThat(ctx.getBean(JdbcTemplate.class).queryForObject("SELECT contact_phone FROM profile WHERE id=1",String.class)).isEqualTo("01012345678");
        }
    }
    @Test void invalidEmailRejected(){
        assertThatThrownBy(()->new ProfileContact("invalid")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(()->new ProfileContact("a@example.com\r\nBcc:x@example.com")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
