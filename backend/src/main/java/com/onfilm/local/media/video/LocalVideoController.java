package com.onfilm.local.media.video;

import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/filmography/{id}/video")
public class LocalVideoController {
    private final LocalVideoService videos;
    public LocalVideoController(LocalVideoService videos){this.videos=videos;}
    @PostMapping(consumes=MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public void upload(@PathVariable String id,@RequestParam long version,@RequestParam String name,HttpServletRequest request) throws IOException {
        videos.upload(id,version,name,request.getContentLengthLong(),request.getInputStream());
    }
    @DeleteMapping
    public void unlink(@PathVariable String id,@RequestParam long version){videos.unlink(id,version);}
    public record Error(String message){}
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Error> rejected(ResponseStatusException error){return ResponseEntity.status(error.getStatusCode()).body(new Error(error.getReason()));}
    @ExceptionHandler(IOException.class)
    ResponseEntity<Error> failed(IOException error){return ResponseEntity.status(500).body(new Error("파일 복사에 실패했습니다. 저장 공간·파일 접근 권한을 확인하고 다시 읽기를 눌러 주세요."));}
}
