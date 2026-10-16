package com.onfilm.local.media.encoding;

import java.io.IOException;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TrailerEditingController {
    private final TrailerEditingService service;
    public TrailerEditingController(TrailerEditingService service){this.service=service;}
    public record Open(String sourceId,String filmId){}
    public record Cut(double start,double end){}
    @PostMapping("/api/filmography-drafts/{draftId}/trailer-editor")
    public TrailerEditingService.Edit open(@PathVariable String draftId,@RequestBody Open request){return service.open(draftId,request.sourceId(),request.filmId());}
    @GetMapping("/api/trailer-edits/{id}") public TrailerEditingService.Edit get(@PathVariable String id){return service.get(id);}
    @PostMapping("/api/trailer-edits/{id}/retry") public TrailerEditingService.Edit retry(@PathVariable String id){return service.retryProbe(id);}
    @PostMapping("/api/trailer-edits/{id}/reset") public TrailerEditingService.Edit reset(@PathVariable String id){return service.reset(id);}
    @PostMapping("/api/trailer-edits/{id}/cut") public TrailerEditingService.Edit cut(@PathVariable String id,@RequestBody Cut request){return service.cut(id,request.start(),request.end());}
    @PostMapping("/api/trailer-edits/{id}/accept") public void accept(@PathVariable String id){service.accept(id);}
    @DeleteMapping("/api/trailer-edits/{id}") public void cancel(@PathVariable String id){service.cancel(id);}
    @GetMapping("/api/trailer-edits/{id}/content/{kind}") public ResponseEntity<Resource> content(@PathVariable String id,@PathVariable String kind)throws IOException{
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.valueOf("video/mp4")).body(new FileSystemResource(service.content(id,kind)));
    }
    public record Error(String message){}
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<Error> rejected(ResponseStatusException e){return ResponseEntity.status(e.getStatusCode()).body(new Error(e.getReason()));}
    @ExceptionHandler(IOException.class) public ResponseEntity<Error> failed(){return ResponseEntity.internalServerError().body(new Error("미리보기 파일을 읽지 못했습니다."));}
}
