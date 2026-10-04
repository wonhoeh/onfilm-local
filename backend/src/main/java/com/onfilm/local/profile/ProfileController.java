package com.onfilm.local.profile;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.PastOrPresent;
import java.time.LocalDate;
import com.onfilm.local.profile.ProfileExtras.Sns;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ProfileController {
    private final JdbcTemplate jdbc;
    private final String instance;
    private final ProfileExtras extras;

    public ProfileController(JdbcTemplate jdbc, @Value("${onfilm.instance-id}") String instance, ProfileExtras extras) {
        this.jdbc = jdbc;
        this.instance = instance;
        this.extras = extras;
    }

    public record Health(String service, String instanceId) { }
    public record Profile(String name, String oneLineIntro, long version, LocalDate birthDate, String birthPlace, boolean hasPortrait, java.util.List<ProfileExtras.Sns> snsList, java.util.List<String> rawTags, ProfileContact contact) { }
    public record Update(@NotBlank @Size(max = 60) String name,
                         @NotNull @Size(max = 120) String oneLineIntro,
                         @NotNull @Min(0) Long version,
                         @PastOrPresent LocalDate birthDate, @Size(max = 100) String birthPlace,
                         @Size(max=10) java.util.List<@NotNull @Valid Sns> snsList,
                         @Size(max=20) java.util.List<@NotBlank @Size(max=30) String> rawTags, ProfileContact contact) {
        public Update(String name,String intro,Long version,LocalDate birthDate,String birthPlace,java.util.List<Sns> snsList,java.util.List<String> rawTags) {this(name,intro,version,birthDate,birthPlace,snsList,rawTags,null);}
        public Update(String name, String intro, Long version) { this(name, intro, version, null, "", null, null); }
    }

    @GetMapping("/health/desktop")
    Health health() { return new Health("onfilm-local", instance); }

    @GetMapping("/api/profile")
    @Transactional(readOnly=true, isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    Profile get() {
        return jdbc.queryForObject("SELECT name, one_line_intro, version, birth_date, birth_place, portrait IS NOT NULL, contact_email FROM profile WHERE id = 1",
                (row, index) -> new Profile(row.getString(1), row.getString(2), row.getLong(3), row.getObject(4, LocalDate.class), row.getString(5), row.getBoolean(6), extras.sns(), extras.tags(),new ProfileContact(row.getString(7))));
    }

    @PutMapping("/api/profile")
    @Transactional
    Profile update(@Valid @RequestBody Update request) {
        int count = jdbc.update("UPDATE profile SET name = ?, one_line_intro = ?, birth_date = ?, birth_place = ?, version = version + 1 WHERE id = 1 AND version = ?",
                request.name().strip(), request.oneLineIntro().strip(), request.birthDate(), request.birthPlace() == null ? "" : request.birthPlace().strip(), request.version());
        if (count != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "Profile was changed. Reload before saving.");
        if(request.contact()!=null)jdbc.update("UPDATE profile SET contact_email=? WHERE id=1",request.contact().email());
        extras.replace(request.snsList(), request.rawTags());
        return get();
    }
}
