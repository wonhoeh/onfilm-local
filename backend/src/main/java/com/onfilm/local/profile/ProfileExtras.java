package com.onfilm.local.profile;

import java.net.URI;
import java.text.Normalizer;
import java.util.*;
import jakarta.validation.constraints.*;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class ProfileExtras {
    private final JdbcTemplate jdbc;
    public ProfileExtras(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Sns(@NotBlank @Pattern(regexp="INSTAGRAM|YOUTUBE|TIKTOK|ETC") String type,
                      @NotBlank @Size(max=2048) String url) { }
    List<Sns> sns() { return jdbc.query("SELECT type,url FROM profile_sns ORDER BY position", (r,i)->new Sns(r.getString(1),r.getString(2))); }
    List<String> tags() { return jdbc.queryForList("SELECT label FROM profile_tag ORDER BY position", String.class); }
    void replace(List<Sns> sns, List<String> tags) {
        if (sns != null) {
            jdbc.update("DELETE FROM profile_sns");
            for (int i=0;i<sns.size();i++) {
                var entry=sns.get(i); String url=entry.url().strip();
                if (!url.contains(":")) url="https://"+url;
                try {
                    var uri=URI.create(url);
                    if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) || uri.getHost()==null || uri.getUserInfo()!=null || url.length()>2048) throw new IllegalArgumentException();
                } catch (IllegalArgumentException error) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Use an HTTP(S) SNS URL"); }
                jdbc.update("INSERT INTO profile_sns VALUES (?,?,?)",i,entry.type(),url);
            }
        }
        if (tags != null) {
            jdbc.update("DELETE FROM profile_tag"); var seen=new HashSet<String>();
            for(int i=0;i<tags.size();i++) {
                String tag=Normalizer.normalize(tags.get(i).strip(),Normalizer.Form.NFKC).replaceFirst("^#+", "").strip().replaceAll("\\s+", " ");
                if(tag.isBlank() || tag.length()>30 || !seen.add(tag.toLowerCase(Locale.ROOT))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid or duplicate tag");
                jdbc.update("INSERT INTO profile_tag VALUES (?,?)",i,tag);
            }
        }
    }
}
