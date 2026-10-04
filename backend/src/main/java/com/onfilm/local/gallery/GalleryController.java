package com.onfilm.local.gallery;

import com.onfilm.local.media.image.ImageNormalizer;

import java.io.IOException;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/gallery")
public class GalleryController {
    private final JdbcTemplate jdbc;
    public GalleryController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Gallery(long version, List<String> ids) { }
    public record Order(@Min(0) long version, @NotNull @Size(max=12) List<@NotNull String> ids) { }
    private List<String> ids() { return jdbc.queryForList("SELECT id FROM gallery_photo ORDER BY position, id", String.class); }
    @GetMapping
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ, readOnly=true)
    Gallery get() {
        long version = jdbc.queryForObject("SELECT version FROM gallery_state WHERE id=1", Long.class);
        return new Gallery(version, ids());
    }
    @GetMapping("/{id}/image")
    ResponseEntity<byte[]> image(@PathVariable String id) {
        var found = jdbc.query("SELECT image FROM gallery_photo WHERE id=?", (row, n) -> row.getBytes(1), id);
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(found.get(0));
    }
    private void claim(long version) {
        if (jdbc.update("UPDATE gallery_state SET version=version+1 WHERE id=1 AND version=?", version) != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT);
    }
    @PostMapping
    @Transactional(rollbackFor=IOException.class)
    Gallery add(@RequestParam MultipartFile file, @RequestParam long version) throws IOException {
        byte[] image = ImageNormalizer.normalize(file);
        claim(version);
        var ids = ids();
        if (ids.size() >= 12) throw new ResponseStatusException(HttpStatus.CONFLICT, "Maximum 12 photos");
        int position = jdbc.queryForObject("SELECT COALESCE(MAX(position), -1)+1 FROM gallery_photo", Integer.class);
        jdbc.update("INSERT INTO gallery_photo (id, position, image) VALUES (?,?,?)", UUID.randomUUID().toString(), position, image);
        return get();
    }
    @PutMapping("/order")
    @Transactional
    Gallery reorder(@Valid @RequestBody Order order) {
        claim(order.version());
        var current = ids();
        if (order.ids().size() != current.size() || !new HashSet<>(order.ids()).equals(new HashSet<>(current)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Send each current photo exactly once");
        for (int i=0; i<order.ids().size(); i++) jdbc.update("UPDATE gallery_photo SET position=? WHERE id=?", i, order.ids().get(i));
        return get();
    }
    @DeleteMapping("/{id}")
    @Transactional
    Gallery delete(@PathVariable String id, @RequestParam long version) {
        claim(version);
        if (jdbc.update("DELETE FROM gallery_photo WHERE id=?", id) != 1) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return get();
    }
}
