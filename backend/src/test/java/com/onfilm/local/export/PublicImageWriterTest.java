package com.onfilm.local.export;

import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class PublicImageWriterTest {
    @TempDir Path directory;
    @Test void opaquePngIsCompressedResizedAndDeterministic() throws Exception {
        var image = new BufferedImage(2048, 1024, BufferedImage.TYPE_INT_ARGB);
        var random = new java.util.Random(42);
        for(int y=0;y<1024;y++)for(int x=0;x<2048;x++)image.setRGB(x,y,0xff000000|random.nextInt(0x1000000));
        var buffer = new ByteArrayOutputStream();ImageIO.write(image,"png",buffer);
        byte[] source=buffer.toByteArray(),unchanged=source.clone();
        String name=PublicImageWriter.write(directory,"portrait",source,960);
        assertThat(name).isEqualTo("media/portrait.jpg");
        byte[] first=Files.readAllBytes(directory.resolve(name));
        var result=ImageIO.read(directory.resolve(name).toFile());
        assertThat(result.getWidth()).isEqualTo(960);assertThat(result.getHeight()).isEqualTo(480);
        assertThat(first.length).isLessThan(source.length/2);
        PublicImageWriter.write(directory,"portrait",source,960);
        assertThat(Files.readAllBytes(directory.resolve(name))).isEqualTo(first);
        assertThat(source).isEqualTo(unchanged);
    }
    @Test void transparencyAndSmallDimensionsArePreserved() throws Exception {
        var image=new BufferedImage(40,20,BufferedImage.TYPE_INT_ARGB);
        image.setRGB(0,0,0x80ff0000);
        var buffer=new ByteArrayOutputStream();ImageIO.write(image,"png",buffer);
        String name=PublicImageWriter.write(directory,"photo-0",buffer.toByteArray(),1600);
        assertThat(name).endsWith(".png");
        var result=ImageIO.read(directory.resolve(name).toFile());
        assertThat(result.getWidth()).isEqualTo(40);assertThat(result.getHeight()).isEqualTo(20);
        assertThat(result.getRGB(0,0)>>>24).isEqualTo(128);
        assertThatThrownBy(()->PublicImageWriter.write(directory,"bad",new byte[]{1,2},960)).isInstanceOf(IOException.class);
    }
}
