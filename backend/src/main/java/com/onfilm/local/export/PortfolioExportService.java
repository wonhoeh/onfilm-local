package com.onfilm.local.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.onfilm.local.media.encoding.PlaybackController;
import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class PortfolioExportService {
    public record Entry(String path,long bytes) { }
    public record Result(String id,String createdAt,long bytes,int fileCount,List<Entry> files) { }
    private record Copy(Path source,Path target,long bytes) { }
    private final Path root;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final PlaybackController playback;
    private final TransactionTemplate snapshot;
    private final AtomicBoolean busy=new AtomicBoolean();
    private static final List<String> ASSETS=List.of("css/common.css","css/actor-detail.css","css/local-detail.css",
        "css/video-player.css","css/local-player.css","video-player.js","timeline-preview.js",
        "vendor/hls.js/hls.min.js","vendor/hls.js/LICENSE","images/profile-placeholder.png","images/film-placeholder.png",
        "icons/instagram.svg","icons/youtube.svg","icons/tiktok.svg","icons/link.svg","icons/simple-icons-LICENSE.txt","icons/bootstrap-icons-LICENSE.txt");

    public PortfolioExportService(JdbcTemplate jdbc,ObjectMapper json,PlaybackController playback,PlatformTransactionManager manager,@Value("${onfilm.data-dir}") String directory) {
        this.jdbc=jdbc;this.json=json;this.playback=playback;root=Path.of(directory).toAbsolutePath().normalize().resolve("exports");
        snapshot=new TransactionTemplate(manager);snapshot.setReadOnly(true);snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    public boolean busy(){return busy.get();}
    public Path directory(){return root;}
    /** Build fully before responding, so a failed ZIP is never offered as a complete download. */
    public synchronized Path archive(String id)throws IOException{
        resource(id,"index.html");
        Path folder=root.resolve(id),archive=folder.resolve("portfolio.zip");
        if(Files.exists(archive,LinkOption.NOFOLLOW_LINKS)){
            if(!Files.isRegularFile(archive,LinkOption.NOFOLLOW_LINKS)||Files.size(archive)==0)throw new IOException("Invalid archive");
            return archive;
        }
        Result result=json.readValue(folder.resolve("result.json").toFile(),Result.class);
        Path partial=folder.resolve("archive-"+UUID.randomUUID()+".partial");
        try{
            try(var zip=new java.util.zip.ZipOutputStream(Files.newOutputStream(partial,StandardOpenOption.CREATE_NEW))){
                zip.setLevel(1);
                for(Entry entry:result.files()){
                    if(Thread.currentThread().isInterrupted())throw new IOException("Interrupted");
                    if(!entry.path().matches("[A-Za-z0-9_./-]+"))throw new IOException("Invalid ZIP entry");
                    Path input=resource(id,entry.path());
                    if(Files.size(input)!=entry.bytes())throw new IOException("Changed export file");
                    zip.putNextEntry(new java.util.zip.ZipEntry(entry.path()));
                    long copied;try(var in=Files.newInputStream(input)){copied=in.transferTo(zip);}
                    if(copied!=entry.bytes())throw new IOException("Changed export file");
                    zip.closeEntry();
                }
            }
            Files.move(partial,archive,StandardCopyOption.ATOMIC_MOVE);
            return archive;
        }finally{Files.deleteIfExists(partial);}
    }
    public List<Result> list() throws IOException {
        if(!Files.isDirectory(root))return List.of();
        List<Result> result=new ArrayList<>();
        try(var paths=Files.list(root)) {
            for(Path p:paths.toList()) {
                if(!validId(p.getFileName().toString())||Files.isSymbolicLink(p))continue;
                Path marker=p.resolve("result.json");
                if(!Files.isRegularFile(marker,LinkOption.NOFOLLOW_LINKS)||Files.size(marker)>8*1024*1024)continue;
                result.add(json.readValue(marker.toFile(),Result.class));
            }
        }
        result.sort(Comparator.comparing(Result::createdAt).reversed());return result;
    }
    public Result create() throws IOException {
        if(!busy.compareAndSet(false,true))throw new IllegalStateException("이미 공개본을 만들고 있습니다. 완료 후 다시 읽어 주세요.");
        String id=UUID.randomUUID().toString();Path stage=root.resolve(id+".partial"),site=stage.resolve("site");
        try {
            Files.createDirectories(site);List<Copy> copies=new ArrayList<>();
            Map<String,Object> data=snapshot.execute(status->{
                try{return snapshot(site,copies);}catch(IOException e){throw new UncheckedIOException(e);}
            });
            long required=32L*1024*1024;
            for(Copy copy:copies)required=Math.addExact(required,copy.bytes());
            if(Files.getFileStore(site).getUsableSpace()<required)throw new IOException("Insufficient space");
            // No DB transaction is held while copying large HLS files.
            for(Copy copy:copies){
                if(Thread.currentThread().isInterrupted())throw new IOException("Interrupted");
                Files.createDirectories(copy.target().getParent());Files.copy(copy.source(),copy.target());
                if(Files.size(copy.target())!=copy.bytes())throw new IOException("Changed source");
            }
            json.writeValue(site.resolve("portfolio.json").toFile(),data);
            for(String name:ASSETS)copyAsset(name,site);
            for(String name:List.of("index.html","public-profile.js","public.css")) {
                try(var in=new ClassPathResource("public-portfolio/"+name).getInputStream()){Files.copy(in,site.resolve(name));}
            }
            String player;
            try(var in=new ClassPathResource("static/video-player.html").getInputStream()){player=new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);}
            player=player
                .replace("<html lang=\"ko\">","<html lang=\"ko\" data-public-portfolio=\"true\">")
                .replace("href=\"/","href=\"").replace("src=\"/","src=\"");
            Files.writeString(site.resolve("video-player.html"),player);
            List<Entry> entries=new ArrayList<>();
            try(var paths=Files.walk(site)){for(Path p:paths.filter(Files::isRegularFile).sorted().toList())entries.add(new Entry(site.relativize(p).toString().replace('\\','/'),Files.size(p)));}
            Result result=new Result(id,Instant.now().toString(),entries.stream().mapToLong(Entry::bytes).sum(),entries.size(),entries);
            json.writeValue(stage.resolve("result.json").toFile(),result);
            if(Files.size(stage.resolve("result.json"))>8*1024*1024)throw new IOException("Too many output files");
            Files.move(stage,root.resolve(id),StandardCopyOption.ATOMIC_MOVE);
            return result;
        } catch(UncheckedIOException e){throw e.getCause();}
        finally {busy.set(false);}
        // Interrupted/failed .partial directories are retained, never listed as complete or served.
    }
    private Map<String,Object> snapshot(Path site,List<Copy> copies) throws IOException {
        var data=new LinkedHashMap<String,Object>();
        var profile=jdbc.queryForObject("SELECT name,one_line_intro,birth_date,birth_place,portrait FROM profile WHERE id=1",(r,n)->{
            var p=new LinkedHashMap<String,Object>();p.put("name",r.getString(1));p.put("intro",r.getString(2));p.put("birthDate",r.getString(3));p.put("birthPlace",r.getString(4));
            byte[] portrait=r.getBytes(5);p.put("portrait",portrait==null?"images/profile-placeholder.png":"media/portrait.png");
            if(portrait!=null)writeImage(site,"portrait.png",portrait);return p;
        });
        if(profile.get("name")==null||profile.get("name").toString().isBlank())throw new IllegalStateException("먼저 프로필을 저장해 주세요.");
        profile.put("sns",jdbc.query("SELECT type,url FROM profile_sns ORDER BY position",(r,n)->Map.of("type",r.getString(1),"url",r.getString(2))));
        profile.put("tags",jdbc.queryForList("SELECT label FROM profile_tag ORDER BY position",String.class));data.put("profile",profile);
        profile.put("contact",jdbc.queryForObject("SELECT contact_email FROM profile WHERE id=1",(r,n)->{
            var contact=new LinkedHashMap<String,String>();
            if(!r.getString(1).isBlank())contact.put("email",r.getString(1));
            return contact;
        }));
        data.put("photos",jdbc.query("SELECT image FROM gallery_photo ORDER BY position,id",(r,n)->{String name="photo-"+n+".png";writeImage(site,name,r.getBytes(1));return "media/"+name;}));
        data.put("films",jdbc.query("SELECT * FROM filmography_item ORDER BY position,id",(r,n)->{
            String filmId=r.getString("id"),publicId="film-"+n;
            var film=new LinkedHashMap<String,Object>();film.put("id",publicId);film.put("title",r.getString("title"));film.put("year",r.getObject("release_year"));
            film.put("runtime",r.getObject("runtime_minutes"));film.put("genres",split(r.getString("genres")));film.put("roles",split(r.getString("roles")));
            film.put("characterName",r.getString("character_name"));film.put("castType",r.getString("cast_type"));film.put("ageRating",r.getString("age_rating"));
            var thumbnails=jdbc.query("SELECT image FROM filmography_thumbnail WHERE film_id=?",(row,i)->row.getBytes(1),filmId);
            film.put("thumbnail","images/film-placeholder.png");
            if(!thumbnails.isEmpty()){writeImage(site,publicId+".png",thumbnails.get(0));film.put("thumbnail","media/"+publicId+".png");}
            var videos=jdbc.queryForList("SELECT id FROM local_video WHERE film_id=?",String.class,filmId);
            if(!videos.isEmpty()){
                try {
                    Path manifest=Objects.requireNonNull(playback.content(videos.get(0),"index.m3u8").getBody()).getFile().toPath();
                    if(Files.size(manifest)>2*1024*1024)throw new IOException("Invalid manifest");
                    List<String> lines=Files.readAllLines(manifest);
                    if(!lines.contains("#EXT-X-ENDLIST"))throw new IOException("Incomplete manifest");
                    Set<String> names=new LinkedHashSet<>();names.add("index.m3u8");
                    for(String line:lines){
                        if(line.startsWith("#")&&line.contains("URI="))throw new IOException("External resource");
                        if(line.isBlank()||line.startsWith("#"))continue;
                        if(!line.matches("segment-[0-9]{5,10}\\.ts"))throw new IOException("Invalid segment");names.add(line);
                    }
                    if(names.size()<2)throw new IOException("Empty manifest");
                    for(String name:names){Path path=Objects.requireNonNull(playback.content(videos.get(0),name).getBody()).getFile().toPath();copies.add(new Copy(path,site.resolve("media/"+publicId+"/"+name),Files.size(path)));}
                    film.put("manifestUrl","media/"+publicId+"/index.m3u8");
                } catch(Exception e){throw new IllegalStateException("연결된 영상의 인코딩이 완료되지 않았거나 결과 파일이 없습니다. 필모그래피에서 확인해 주세요.");}
            }
            return film;
        }));
        return data;
    }
    private static List<String> split(String value){return value.isEmpty()?List.of():List.of(value.split("\n"));}
    private void writeImage(Path site,String name,byte[] bytes){try{Files.createDirectories(site.resolve("media"));Files.write(site.resolve("media").resolve(name),bytes);}catch(IOException e){throw new UncheckedIOException(e);}}
    private void copyAsset(String name,Path site)throws IOException{
        Path target=site.resolve(name);Files.createDirectories(target.getParent());
        try(var in=new ClassPathResource("static/"+name).getInputStream()){
            if(name.endsWith(".css")){
                String css=new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).replace("url(\"/icons/","url(\"../icons/");
                css=css.replace("https://cdn.jsdelivr.net/npm/simple-icons/icons/","../icons/").replace("https://cdn.jsdelivr.net/npm/bootstrap-icons/icons/link-45deg.svg","../icons/link.svg");
                Files.writeString(target,css);
            }else Files.copy(in,target);
        }
    }
    private boolean validId(String id){return id!=null&&id.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}");}
    public Path resource(String id,String relative)throws IOException{
        if(!validId(id)||relative.contains("\\")||relative.startsWith("/")||relative.contains(".."))throw new FileNotFoundException();
        Path dir=root.resolve(id),marker=dir.resolve("result.json");
        if(!Files.isRegularFile(marker,LinkOption.NOFOLLOW_LINKS)||Files.size(marker)>8*1024*1024)throw new FileNotFoundException();
        Result result=json.readValue(marker.toFile(),Result.class);
        if(result.files().stream().noneMatch(entry->entry.path().equals(relative)))throw new FileNotFoundException();
        Path path=dir.resolve("site").resolve(relative);
        if(!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS)||!path.toRealPath().equals(root.toRealPath().resolve(root.relativize(path))))throw new FileNotFoundException();
        return path;
    }
}
