package com.onfilm.local.export;

import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import javax.imageio.*;

/** Export-only derivatives; never writes back to the local photo or database. */
final class PublicImageWriter {
    private PublicImageWriter() { }

    static String write(Path site, String name, byte[] source, int maxEdge) throws IOException {
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(source));
        if (image == null) throw new IOException("Invalid public image");
        boolean transparent = false;
        if (image.getColorModel().hasAlpha()) {
            outer: for (int y = 0; y < image.getHeight(); y++) {
                for (int x = 0; x < image.getWidth(); x++) {
                    if ((image.getRGB(x, y) >>> 24) != 255) { transparent = true; break outer; }
                }
            }
        }
        double scale = Math.min(1.0, (double) maxEdge / Math.max(image.getWidth(), image.getHeight()));
        BufferedImage output = new BufferedImage(Math.max(1, (int)Math.round(image.getWidth() * scale)),
            Math.max(1, (int)Math.round(image.getHeight() * scale)),
            transparent ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        var graphics = output.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.drawImage(image, 0, 0, output.getWidth(), output.getHeight(), null);
        } finally { graphics.dispose(); }
        String relative = "media/" + name + (transparent ? ".png" : ".jpg");
        Path target = site.resolve(relative);
        Files.createDirectories(target.getParent());
        if (transparent) {
            if (!ImageIO.write(output, "png", target.toFile())) throw new IOException("PNG writer unavailable");
        } else {
            var writers = ImageIO.getImageWritersByFormatName("jpeg");
            if (!writers.hasNext()) throw new IOException("JPEG writer unavailable");
            var writer = writers.next();
            try (var stream = ImageIO.createImageOutputStream(target.toFile())) {
                writer.setOutput(stream);
                var parameters = writer.getDefaultWriteParam();
                parameters.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                parameters.setCompressionQuality(0.85f);
                writer.write(null, new IIOImage(output, null, null), parameters);
            } finally { writer.dispose(); }
        }
        return relative;
    }
}
