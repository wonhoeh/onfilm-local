package com.onfilm.local.filmography;

import com.onfilm.local.media.image.ImageNormalizer;
import com.onfilm.local.media.video.LocalVideoService;
import java.io.IOException;
import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Media staging never changes published filmography. Drafts are consumed by the final DB transaction. */
@RestController
@RequestMapping("/api/filmography-drafts")
public class FilmographyDraftController {
    private final JdbcTemplate jdbc;
    private final LocalVideoService videos;
    public FilmographyDraftController(JdbcTemplate jdbc,LocalVideoService videos){this.jdbc=jdbc;this.videos=videos;}
    public record Draft(String id,boolean thumbnailChanged,boolean thumbnailPresent,boolean videoChanged,LocalVideoService.Video video,boolean trailerChanged,LocalVideoService.Video trailer){}
    @PostMapping public Draft create(){
        String id=UUID.randomUUID().toString();jdbc.update("INSERT INTO filmography_media_draft(id) VALUES (?)",id);return get(id);
    }
    @GetMapping("/{id}") public Draft get(@PathVariable String id){
        var found=jdbc.query("SELECT * FROM filmography_media_draft WHERE id=?",(r,n)->new Draft(id,r.getBoolean("thumbnail_changed"),r.getBytes("image")!=null,r.getBoolean("video_changed"),videos.findReady(r.getString("video_id")),r.getBoolean("trailer_changed"),videos.findReady(r.getString("trailer_id"))),id);
        if(found.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);return found.get(0);
    }
    private void require(String id){if(jdbc.queryForList("SELECT id FROM filmography_media_draft WHERE id=? FOR UPDATE",String.class,id).isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"임시 작업이 이미 저장됐거나 없습니다. 다시 읽기로 확인해 주세요.");}
    @PostMapping("/{id}/thumbnail") @Transactional(rollbackFor=IOException.class)
    public Draft thumbnail(@PathVariable String id,@RequestParam MultipartFile file)throws IOException{
        byte[] image=ImageNormalizer.normalize(file);require(id);
        jdbc.update("UPDATE filmography_media_draft SET thumbnail_changed=TRUE,image=? WHERE id=?",image,id);return get(id);
    }
    @DeleteMapping("/{id}/thumbnail") @Transactional
    public Draft removeThumbnail(@PathVariable String id){require(id);jdbc.update("UPDATE filmography_media_draft SET thumbnail_changed=TRUE,image=NULL WHERE id=?",id);return get(id);}
    @GetMapping("/{id}/thumbnail") public ResponseEntity<byte[]> thumbnail(@PathVariable String id){
        var rows=jdbc.query("SELECT image FROM filmography_media_draft WHERE id=? AND image IS NOT NULL",(r,n)->r.getBytes(1),id);
        if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(rows.get(0));
    }
    @PostMapping(value="/{id}/video",consumes=MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public Draft video(@PathVariable String id,@RequestParam String name,HttpServletRequest request)throws IOException{
        videos.uploadDraft(id,name,request.getContentLengthLong(),request.getInputStream());return get(id);
    }
    @DeleteMapping("/{id}/video") @Transactional
    public Draft removeVideo(@PathVariable String id){require(id);jdbc.update("UPDATE filmography_media_draft SET video_changed=TRUE,video_id=NULL WHERE id=?",id);return get(id);}
    @PostMapping(value="/{id}/trailer",consumes=MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public Draft trailer(@PathVariable String id,@RequestParam String name,HttpServletRequest request)throws IOException{
        videos.uploadTrailerDraft(id,name,request.getContentLengthLong(),request.getInputStream());return get(id);
    }
    @DeleteMapping("/{id}/trailer") @Transactional
    public Draft removeTrailer(@PathVariable String id){require(id);jdbc.update("UPDATE filmography_media_draft SET trailer_changed=TRUE,trailer_id=NULL WHERE id=?",id);return get(id);}
    public record Error(String message){}
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Error> rejected(ResponseStatusException error){return ResponseEntity.status(error.getStatusCode()).body(new Error(error.getReason()));}
    @ExceptionHandler(IOException.class)
    ResponseEntity<Error> failed(IOException error){return ResponseEntity.status(500).body(new Error("파일 준비에 실패했습니다. 저장 공간·권한을 확인하고 다시 선택해 주세요."));}
}
