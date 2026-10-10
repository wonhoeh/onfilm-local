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
    public record Draft(String id) { }
    public record Photo(String id, String draftId, @Min(0) @Max(3) int turns) { }
    public record Edit(@Min(0) long version, @NotNull @Size(max=12) List<@NotNull @Valid Photo> photos) { }
    @PostMapping("/drafts")
    Draft stage(@RequestParam MultipartFile file) {
        byte[] image=ImageNormalizer.normalize(file);
        String id=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO gallery_photo_draft(id,image) VALUES (?,?)",id,image);
        return new Draft(id);
    }
    @GetMapping("/drafts/{id}/image")
    ResponseEntity<byte[]> draftImage(@PathVariable String id) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(bytes(id,true));
    }
    private byte[] bytes(String id,boolean draft) {
        var found=jdbc.query(draft?"SELECT image FROM gallery_photo_draft WHERE id=?":"SELECT image FROM gallery_photo WHERE id=?",(r,n)->r.getBytes(1),id);
        if(found.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"사진을 다시 선택해 주세요.");
        return found.get(0);
    }
    @PutMapping("/edit")
    @Transactional(rollbackFor=IOException.class)
    Gallery save(@Valid @RequestBody Edit edit)throws IOException {
        if(edit.photos()==null||edit.photos().size()>12)throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        claim(edit.version());
        Set<String> sources=new HashSet<>(),retained=new HashSet<>();
        int position=0;
        for(Photo photo:edit.photos()){
            if(photo==null||(photo.id()==null)==(photo.draftId()==null)||photo.turns()<0||photo.turns()>3)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            boolean draft=photo.draftId()!=null;String source=draft?photo.draftId():photo.id();
            if(!sources.add((draft?"draft:":"saved:")+source))throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            if(draft && jdbc.queryForList("SELECT id FROM gallery_photo_draft WHERE id=? FOR UPDATE",String.class,source).isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT);
            byte[] image=rotate(bytes(source,draft),photo.turns());
            String id=draft?UUID.randomUUID().toString():source;
            if(draft){
                jdbc.update("INSERT INTO gallery_photo(id,position,image) VALUES (?,?,?)",id,position,image);
                jdbc.update("DELETE FROM gallery_photo_draft WHERE id=?",source);
            }else jdbc.update("UPDATE gallery_photo SET position=?,image=? WHERE id=?",position,image,id);
            retained.add(id);position++;
        }
        for(String id:ids())if(!retained.contains(id))jdbc.update("DELETE FROM gallery_photo WHERE id=?",id);
        return get();
    }
    private static byte[] rotate(byte[] bytes,int turns)throws IOException {
        if(turns==0)return bytes;
        var source=javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(bytes));
        if(source==null)throw new IOException("Invalid stored image");
        int w=source.getWidth(),h=source.getHeight();
        var target=new java.awt.image.BufferedImage(turns%2==0?w:h,turns%2==0?h:w,java.awt.image.BufferedImage.TYPE_INT_ARGB);
        var graphics=target.createGraphics();
        try{
            if(turns==1)graphics.translate(h,0);else if(turns==2)graphics.translate(w,h);else graphics.translate(0,w);
            graphics.rotate(turns*Math.PI/2);graphics.drawImage(source,0,0,null);
            var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(target,"png",out);return out.toByteArray();
        }finally{graphics.dispose();source.flush();target.flush();}
    }
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
