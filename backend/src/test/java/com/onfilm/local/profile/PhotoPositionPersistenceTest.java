package com.onfilm.local.profile;

import com.onfilm.local.media.image.ImagePosition;
import com.onfilm.local.export.PortfolioExportService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class PhotoPositionPersistenceTest extends LocalPersistenceTest {
    @Test void portraitPositionPreservesBytesPersistsAndExports()throws Exception {
        var image=new java.awt.image.BufferedImage(800,400,java.awt.image.BufferedImage.TYPE_INT_RGB);
        var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(image,"png",out);
        var file=new MockMultipartFile("file","portrait.png","image/png",out.toByteArray());
        byte[] stored;
        try(var context=start()) {
            var portraits=context.getBean(PortraitController.class);var profiles=context.getBean(ProfileController.class);
            assertThat(profiles.get().portraitPosition()).isEqualTo(ImagePosition.center());
            portraits.upload(file,0);stored=portraits.get().getBody();
            var update=new ProfileController.Update("배우","",1L,null,"",null,null,null,new ImagePosition(100,20));
            assertThat(profiles.update(update).portraitPosition()).isEqualTo(new ImagePosition(100,20));
            assertThatThrownBy(()->profiles.update(update)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(portraits.get().getBody()).isEqualTo(stored);
            var jdbc=context.getBean(JdbcTemplate.class);
            jdbc.update("INSERT INTO gallery_photo(id,position,image,display_x,display_y) VALUES ('first',0,?,80,10)",stored);
            jdbc.update("INSERT INTO gallery_photo(id,position,image,display_x,display_y) VALUES ('second',1,?,0,100)",stored);
            var exports=context.getBean(PortfolioExportService.class);var result=exports.create();
            var data=context.getBean(com.fasterxml.jackson.databind.ObjectMapper.class).readTree(exports.resource(result.id(),"portfolio.json").toFile());
            assertThat(data.at("/profile/portraitPosition/x").asInt()).isEqualTo(100);
            assertThat(data.at("/profile/portraitPosition/y").asInt()).isEqualTo(20);
            assertThat(data.at("/photoPositions/0/x").asInt()).isEqualTo(80);
            assertThat(data.at("/photoPositions/1/y").asInt()).isEqualTo(100);
            assertThat(data.get("photos")).hasSize(2);
        }
        try(var context=start()) {
            var portraits=context.getBean(PortraitController.class);var profiles=context.getBean(ProfileController.class);
            assertThat(profiles.get().portraitPosition()).isEqualTo(new ImagePosition(100,20));
            assertThat(portraits.get().getBody()).isEqualTo(stored);
            profiles.update(new ProfileController.Update("배우","수정",2L));
            assertThat(profiles.get().portraitPosition()).isEqualTo(new ImagePosition(100,20));
            portraits.upload(file,3);assertThat(profiles.get().portraitPosition()).isEqualTo(ImagePosition.center());
            portraits.delete(4);assertThat(profiles.get().portraitPosition()).isEqualTo(ImagePosition.center());
        }
    }
    @Test void positionValidatesBoundsAndClockwiseRotation(){
        assertThatThrownBy(()->new ImagePosition(-1,50)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new ImagePosition(50,101)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new ImagePosition(null,50)).isInstanceOf(IllegalArgumentException.class);
        assertThat(new ImagePosition(80,20).rotate(1)).isEqualTo(new ImagePosition(80,80));
        assertThat(new ImagePosition(80,20).rotate(4)).isEqualTo(new ImagePosition(80,20));
    }
}
