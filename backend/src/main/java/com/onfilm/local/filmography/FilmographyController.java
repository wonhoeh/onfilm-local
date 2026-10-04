package com.onfilm.local.filmography;

import com.onfilm.local.media.video.LocalVideoService;

import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/filmography")
public class FilmographyController {
    private final JdbcTemplate jdbc;
    private final Validator validator;
    private final LocalVideoService videos;
    public FilmographyController(JdbcTemplate jdbc, Validator validator,LocalVideoService videos) { this.jdbc=jdbc; this.validator=validator;this.videos=videos; }
    public record Item(
        @Size(max=36) String id, @NotBlank @Size(max=200) String title,
        @Min(1888) @Max(2100) Integer year, @Min(1) @Max(1440) Integer runtime,
        @NotNull @Pattern(regexp="|ALL|AGE_12|AGE_15|AGE_18") String ageRating,
        @NotNull @Size(max=3) List<@NotNull @Pattern(regexp="ACTOR|DIRECTOR|WRITER") String> roles,
        @NotNull @Size(max=10) List<@NotBlank @Size(max=30) String> genres,
        @NotNull @Pattern(regexp="|LEAD|SUPPORTING|CAMEO") String castType,
        @NotNull @Size(max=100) String characterName) { }
    public record Films(long version, List<Item> items, List<String> thumbnailIds,List<LocalVideoService.Video> videos) { }
    public record Update(@Min(0) long version, @NotNull @Size(max=50) List<@NotNull @Valid Item> items) { }
    private static List<String> split(String value) { return value.isEmpty() ? List.of() : List.of(value.split("\n")); }
    @GetMapping
    @Transactional(readOnly=true, isolation=Isolation.REPEATABLE_READ)
    public Films get() {
        long version=jdbc.queryForObject("SELECT version FROM filmography_state WHERE id=1", Long.class);
        var items=jdbc.query("SELECT * FROM filmography_item ORDER BY position, id", (r,n)->new Item(
            r.getString("id"),r.getString("title"),r.getObject("release_year",Integer.class),
            r.getObject("runtime_minutes",Integer.class),r.getString("age_rating"),split(r.getString("roles")),
            split(r.getString("genres")),r.getString("cast_type"),r.getString("character_name")));
        return new Films(version,items,jdbc.queryForList("SELECT film_id FROM filmography_thumbnail ORDER BY film_id",String.class),videos.list());
    }
    @PutMapping
    @Transactional
    public Films update(@Valid @RequestBody Update request) {
        if (!validator.validate(request).isEmpty()) throw badRequest();
        if (jdbc.update("UPDATE filmography_state SET version=version+1 WHERE id=1 AND version=?",request.version())!=1)
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        var existing=new HashSet<>(jdbc.queryForList("SELECT id FROM filmography_item",String.class));
        var retained=new HashSet<String>();
        int position=0;
        for (var item:request.items()) {
            String id=item.id()==null ? UUID.randomUUID().toString() : item.id();
            if ((item.id()!=null && !existing.contains(id)) || !retained.add(id)) throw badRequest();
            var genres=new LinkedHashSet<String>();
            for (String genre:item.genres()) {
                if (genre.indexOf('\n')>=0 || genre.indexOf('\r')>=0) throw badRequest();
                genres.add(genre.strip());
            }
            if (!item.roles().contains("ACTOR") && (!item.castType().isEmpty() || !item.characterName().isBlank())) throw badRequest();
            String roles=String.join("\n",new LinkedHashSet<>(item.roles()));
            if (item.id()==null) jdbc.update("INSERT INTO filmography_item (id,position,title,age_rating,roles,genres,cast_type,character_name) VALUES (?,?,?,'','','','','')",id,position,item.title().strip());
            jdbc.update("UPDATE filmography_item SET position=?,title=?,release_year=?,runtime_minutes=?,age_rating=?,roles=?,genres=?,cast_type=?,character_name=? WHERE id=?",
                position++,item.title().strip(),item.year(),item.runtime(),item.ageRating(),roles,String.join("\n",genres),item.castType(),item.characterName().strip(),id);
        }
        existing.removeAll(retained);
        for(String id:existing) jdbc.update("DELETE FROM filmography_item WHERE id=?",id);
        return get();
    }
    private static ResponseStatusException badRequest() { return new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid filmography"); }
}
