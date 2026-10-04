package com.onfilm.local.profile;

import com.onfilm.local.media.image.ImageNormalizer;

import java.io.IOException;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** One small portrait is stored atomically with profile state in the local DB. */
@RestController
@RequestMapping("/api/profile/portrait")
public class PortraitController {
    private final JdbcTemplate jdbc;
    public PortraitController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @GetMapping
    ResponseEntity<byte[]> get() {
        byte[] bytes = jdbc.queryForObject("SELECT portrait FROM profile WHERE id=1", byte[].class);
        if (bytes == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(bytes);
    }
    @PostMapping
    @Transactional
    void upload(@RequestParam MultipartFile file, @RequestParam long version) throws IOException {
        byte[] normalized = ImageNormalizer.normalize(file);
        changed(jdbc.update("UPDATE profile SET portrait=?, version=version+1 WHERE id=1 AND version=?", normalized, version));
    }
    @DeleteMapping
    @Transactional
    void delete(@RequestParam long version) {
        changed(jdbc.update("UPDATE profile SET portrait=NULL, version=version+1 WHERE id=1 AND version=?", version));
    }
    private static void changed(int count) { if (count != 1) throw new ResponseStatusException(HttpStatus.CONFLICT); }
}
