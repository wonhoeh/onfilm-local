package com.onfilm.local.filmography;

import com.onfilm.local.media.image.ImageNormalizer;

import java.io.IOException;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/filmography/{id}/thumbnail")
public class FilmographyThumbnailController {
    private final JdbcTemplate jdbc;
    public FilmographyThumbnailController(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Result(long version) { }
    @GetMapping
    ResponseEntity<byte[]> get(@PathVariable String id) {
        var found=jdbc.query("SELECT image FROM filmography_thumbnail WHERE film_id=?",(r,n)->r.getBytes(1),id);
        if(found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(found.get(0));
    }
    private void claim(String id,long version) {
        if(jdbc.update("UPDATE filmography_state SET version=version+1 WHERE id=1 AND version=?",version)!=1)
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        if(jdbc.queryForObject("SELECT COUNT(*) FROM filmography_item WHERE id=?",Integer.class,id)!=1)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }
    @PostMapping
    @Transactional(rollbackFor=IOException.class)
    Result upload(@PathVariable String id,@RequestParam MultipartFile file,@RequestParam long version) throws IOException {
        byte[] image=ImageNormalizer.normalize(file);
        claim(id,version);
        jdbc.update("MERGE INTO filmography_thumbnail (film_id,image,display_x,display_y,mobile_x,mobile_y) KEY(film_id) VALUES (?,?,50,50,50,50)",id,image);
        return new Result(version+1);
    }
    @DeleteMapping
    @Transactional
    Result delete(@PathVariable String id,@RequestParam long version) {
        claim(id,version);
        jdbc.update("DELETE FROM filmography_thumbnail WHERE film_id=?",id);
        return new Result(version+1);
    }
}
