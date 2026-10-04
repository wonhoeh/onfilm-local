package com.onfilm.local.media.image;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class ImageUploadErrorHandler {
    public record Error(String code, String message) { }
    @ExceptionHandler(ImageNormalizer.UploadError.class)
    ResponseEntity<Error> image(ImageNormalizer.UploadError error) {
        return ResponseEntity.status(error.status).body(new Error(error.code, error.getReason()));
    }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Error> tooLarge(MaxUploadSizeExceededException error) {
        return ResponseEntity.status(413).body(new Error("IMAGE_TOO_LARGE", "파일 용량은 5MB 이하여야 합니다."));
    }
}
