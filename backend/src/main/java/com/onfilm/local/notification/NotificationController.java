package com.onfilm.local.notification;

import java.time.Instant;
import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final JdbcTemplate jdbc;
    public NotificationController(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public record Notice(long id,String message,Instant createdAt,boolean read){}
    public record Inbox(List<Notice> items,long unread){}
    public record ReadRequest(@PositiveOrZero long throughId){}
    @GetMapping public Inbox list(){
        var items=jdbc.query("SELECT * FROM app_notification ORDER BY id DESC LIMIT 100",
            (r,n)->new Notice(r.getLong("id"),r.getString("message"),r.getTimestamp("created_at").toInstant(),r.getTimestamp("read_at")!=null));
        return new Inbox(items,jdbc.queryForObject("SELECT COUNT(*) FROM app_notification WHERE read_at IS NULL",Long.class));
    }
    @PostMapping("/read")
    public void read(@Valid @RequestBody ReadRequest request){
        jdbc.update("UPDATE app_notification SET read_at=CURRENT_TIMESTAMP WHERE id<=? AND read_at IS NULL",request.throughId());
    }
    @PostMapping("/{id}/read") public void readOne(@PathVariable long id){
        jdbc.update("UPDATE app_notification SET read_at=CURRENT_TIMESTAMP WHERE id=? AND read_at IS NULL",id);
    }
    @DeleteMapping public void clear(){jdbc.update("DELETE FROM app_notification");}
}
