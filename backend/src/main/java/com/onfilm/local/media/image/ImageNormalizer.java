package com.onfilm.local.media.image;

import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.concurrent.Semaphore;
import javax.imageio.ImageIO;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;

/** Decode a bounded preview, then scale it; never modify the selected source file. */
public final class ImageNormalizer {
    static final int MAX_EDGE = 2048;
    static final long MAX_BYTES = 5L * 1024 * 1024;
    // A corruption/CPU guard, not the normal photo-size policy (supports e.g. 48MP).
    static final long MAX_SOURCE_PIXELS = 200_000_000L;
    static final int MAX_SOURCE_EDGE = 30_000;
    private static final Semaphore DECODER = new Semaphore(1);

    public static byte[] normalize(MultipartFile file) {
        if (file.isEmpty()) throw error("EMPTY_IMAGE", "빈 파일은 추가할 수 없습니다.");
        if (file.getSize() > MAX_BYTES) throw new UploadError(HttpStatus.PAYLOAD_TOO_LARGE, "IMAGE_TOO_LARGE", "파일 용량은 5MB 이하여야 합니다.");
        if (!DECODER.tryAcquire()) throw new UploadError(HttpStatus.TOO_MANY_REQUESTS, "IMAGE_BUSY", "다른 사진을 처리 중입니다. 잠시 후 다시 시도해 주세요.");
        try (var input = file.getInputStream(); var stream = ImageIO.createImageInputStream(input)) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw error("UNSUPPORTED_IMAGE", "JPEG 또는 PNG 사진을 선택해 주세요. HEIC·WebP는 아직 지원하지 않습니다.");
            var reader = readers.next();
            try {
                String format = reader.getFormatName();
                if (!format.equalsIgnoreCase("jpeg") && !format.equalsIgnoreCase("png"))
                    throw error("UNSUPPORTED_IMAGE", "JPEG 또는 PNG 사진만 지원합니다.");
                reader.setInput(stream, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0) throw error("INVALID_IMAGE", "사진 크기를 읽을 수 없습니다.");
                if (width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE || (long) width * height > MAX_SOURCE_PIXELS)
                    throw error("UNSAFE_IMAGE_DIMENSIONS", "사진 크기가 안전하게 처리할 수 있는 범위를 넘었습니다. 더 작은 사본을 선택해 주세요.");
                var parameters = reader.getDefaultReadParam();
                // floor yields at most 4095 pixels/edge before final resampling.
                int sample = Math.max(1, Math.max(width, height) / MAX_EDGE);
                parameters.setSourceSubsampling(sample, sample, 0, 0);
                var decoded = reader.read(0, parameters);
                if (decoded == null) throw error("INVALID_IMAGE", "사진 내용을 읽을 수 없습니다.");
                double scale = Math.min(1.0, (double) MAX_EDGE / Math.max(width, height));
                int targetWidth = Math.max(1, (int) Math.round(width * scale));
                int targetHeight = Math.max(1, (int) Math.round(height * scale));
                BufferedImage result = decoded;
                if (decoded.getWidth() != targetWidth || decoded.getHeight() != targetHeight) {
                    result = new BufferedImage(targetWidth, targetHeight, decoded.getColorModel().hasAlpha() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
                    var graphics = result.createGraphics();
                    try {
                        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                        graphics.drawImage(decoded, 0, 0, targetWidth, targetHeight, null);
                    } finally { graphics.dispose(); decoded.flush(); }
                }
                try {
                    var output = new ByteArrayOutputStream();
                    if (!ImageIO.write(result, "png", output)) throw new IOException("No PNG writer");
                    return output.toByteArray();
                } finally { result.flush(); }
            } finally { reader.dispose(); }
        } catch (IOException | IllegalArgumentException exception) {
            throw error("INVALID_IMAGE", "사진을 읽거나 변환하지 못했습니다. 파일 손상 여부를 확인해 주세요.");
        } finally { DECODER.release(); }
    }
    private static UploadError error(String code, String message) { return new UploadError(HttpStatus.BAD_REQUEST, code, message); }
    static final class UploadError extends org.springframework.web.server.ResponseStatusException {
        final HttpStatus status;
        final String code;
        UploadError(HttpStatus status, String code, String message) { super(status, message); this.status=status; this.code=code; }
    }
}
