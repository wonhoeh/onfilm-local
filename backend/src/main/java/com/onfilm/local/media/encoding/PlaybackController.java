package com.onfilm.local.media.encoding;

import java.io.IOException;
import java.nio.file.*;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Only the completed attempt of a currently connected video can be served. */
@RestController
@RequestMapping("/api/videos/{videoId}")
public class PlaybackController {
    public record Playback(String title, String manifestUrl) { }
    private record Completed(String title, Path directory) { }
    private final JdbcTemplate jdbc;
    private final EncodingService jobs;

    public PlaybackController(JdbcTemplate jdbc, EncodingService jobs) {
        this.jdbc = jdbc;
        this.jobs = jobs;
    }

    private Completed completed(String videoId) {
        if (!videoId.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) throw missing();
        var rows = jdbc.query("""
                SELECT f.title, j.id, j.attempts FROM encode_job j
                JOIN local_video v ON v.id=j.video_id
                LEFT JOIN filmography_trailer t ON t.video_id=v.id
                JOIN filmography_item f ON f.id=COALESCE(v.film_id,t.film_id)
                WHERE v.id=? AND v.status='READY' AND j.status='DONE'
                """, (r, n) -> new Completed(r.getString("title"), jobs.output(r.getString("id"), r.getInt("attempts"))), videoId);
        if (rows.size() != 1) throw missing();
        return rows.get(0);
    }

    private Path file(Completed completed, String name) {
        if (!name.equals("index.m3u8") && !name.matches("segment-[0-9]{5,10}\\.ts")) throw missing();
        Path file = completed.directory().resolve(name);
        try {
            // Reject symlinks in the file and its managed parent directories as well.
            Path root = completed.directory().getParent().getParent().getParent().getParent();
            Path expected = root.toRealPath().resolve(root.relativize(file));
            if (!file.toRealPath().equals(expected) || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)
                    || Files.size(file) == 0) throw missing();
        } catch (IOException error) { throw missing(); }
        return file;
    }

    @GetMapping("/playback")
    public Playback playback(@PathVariable String videoId) {
        Completed completed = completed(videoId);
        file(completed, "index.m3u8");
        return new Playback(completed.title(), "/api/videos/" + videoId + "/hls/index.m3u8");
    }

    @GetMapping("/hls/{name}")
    public ResponseEntity<Resource> content(@PathVariable String videoId, @PathVariable String name) {
        Path file = file(completed(videoId), name);
        String type = name.equals("index.m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";
        // Stream Resource instead of loading the whole segment into memory. MVC supports Range.
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(type)).body(new FileSystemResource(file));
    }

    private ResponseStatusException missing() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "재생 가능한 영상이 없습니다. 인코딩 상태와 파일을 확인해 주세요.");
    }
}
