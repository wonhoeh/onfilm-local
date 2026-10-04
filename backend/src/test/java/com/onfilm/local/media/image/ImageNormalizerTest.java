package com.onfilm.local.media.image;

import java.awt.image.BufferedImage;
import java.io.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class ImageNormalizerTest {
    private MockMultipartFile image(int width, int height, String format, boolean alpha) throws IOException {
        var image = new BufferedImage(width,height,alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        image.setRGB(0,0,0x80402010);
        var output = new ByteArrayOutputStream(); ImageIO.write(image,format,output); image.flush();
        return new MockMultipartFile("file","photo."+format,"image/"+format,output.toByteArray());
    }
    @ParameterizedTest
    @CsvSource({"4032,3024,jpeg,2048,1536", "3024,4032,png,1536,2048", "6000,4000,jpeg,2048,1365", "800,600,png,800,600", "2048,1024,png,2048,1024"})
    void largePhotosScaleProportionallyAndSmallOnesDoNotGrow(int width,int height,String format,int expectedWidth,int expectedHeight) throws Exception {
        var file=image(width,height,format,false); byte[] original=file.getBytes().clone();
        var decoded=ImageIO.read(new ByteArrayInputStream(ImageNormalizer.normalize(file)));
        assertThat(decoded.getWidth()).isEqualTo(expectedWidth);
        assertThat(decoded.getHeight()).isEqualTo(expectedHeight);
        assertThat(file.getBytes()).isEqualTo(original);
    }
    @Test
    void transparentPngStaysTransparentAfterResize() throws Exception {
        var file=image(3000,1000,"png",true);
        var result=ImageIO.read(new ByteArrayInputStream(ImageNormalizer.normalize(file)));
        assertThat(result.getColorModel().hasAlpha()).isTrue();
        assertThat(result.getRGB(100,100) >>> 24).isZero();
    }
    @Test
    void invalidFilesHaveDistinctSafeErrorsAndDoNotBlockNextImage() throws Exception {
        assertThatThrownBy(()->ImageNormalizer.normalize(new MockMultipartFile("file",new byte[0])))
            .isInstanceOfSatisfying(ImageNormalizer.UploadError.class,error->assertThat(error.code).isEqualTo("EMPTY_IMAGE"));
        assertThatThrownBy(()->ImageNormalizer.normalize(new MockMultipartFile("file",new byte[5*1024*1024+1])))
            .isInstanceOfSatisfying(ImageNormalizer.UploadError.class,error->assertThat(error.code).isEqualTo("IMAGE_TOO_LARGE"));
        assertThatThrownBy(()->ImageNormalizer.normalize(new MockMultipartFile("file","bad.png","image/png",new byte[]{1,2,3})))
            .isInstanceOfSatisfying(ImageNormalizer.UploadError.class,error->assertThat(error.code).isEqualTo("UNSUPPORTED_IMAGE"));
        var abnormal=image(30001,1,"png",false);
        assertThatThrownBy(()->ImageNormalizer.normalize(abnormal))
            .isInstanceOfSatisfying(ImageNormalizer.UploadError.class,error->assertThat(error.code).isEqualTo("UNSAFE_IMAGE_DIMENSIONS"));
        assertThat(ImageNormalizer.normalize(image(2,2,"png",false))).isNotEmpty();
    }
}
