package com.onfilm.local.export;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/exports")
public class PortfolioExportController {
    private final PortfolioExportService exports;
    public PortfolioExportController(PortfolioExportService exports){this.exports=exports;}
    public record Listing(boolean busy,String directory,List<PortfolioExportService.Result> items) { }
    public record Confirmation(boolean includeVisibleProfile) { }
    public record Error(String message) { }
    @GetMapping public Listing list()throws IOException{return new Listing(exports.busy(),exports.directory().toString(),exports.list());}
    @PostMapping public PortfolioExportService.Result create(@RequestBody Confirmation confirmation)throws IOException{
        if(!confirmation.includeVisibleProfile())throw new IllegalStateException("현재 프로필의 공개 정보 포함을 확인해 주세요.");
        return exports.create();
    }
    @PostMapping("/{id}/archive") public ResponseEntity<?> archive(@PathVariable String id)throws IOException{
        Path file=exports.archive(id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip"))
            .contentLength(Files.size(file)).header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"onfilm-portfolio.zip\"")
            .body(new FileSystemResource(file));
    }
    @GetMapping("/{id}/site/{*path}") public ResponseEntity<?> preview(@PathVariable String id,@PathVariable String path)throws IOException{
        String name=path.startsWith("/")?path.substring(1):path;
        if(name.isEmpty())name="index.html";
        Path file;
        try{file=exports.resource(id,name);}catch(IOException e){return ResponseEntity.notFound().build();}
        String type=name.endsWith(".m3u8")?"application/vnd.apple.mpegurl":name.endsWith(".ts")?"video/mp2t":
            name.endsWith(".js")?"text/javascript":name.endsWith(".css")?"text/css":name.endsWith(".json")?"application/json":
            name.endsWith(".html")?"text/html":name.endsWith(".png")?"image/png":name.endsWith(".svg")?"image/svg+xml":"text/plain";
        if(name.equals("index.html"))return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(Files.readString(file).replace("<body>","<body><a class=\"local-preview-exit\" href=\"/export.html\">로컬 미리보기 종료</a>"));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(type)).body(new FileSystemResource(file));
    }
    @ExceptionHandler(IllegalStateException.class) ResponseEntity<Error> invalid(IllegalStateException e){return ResponseEntity.status(409).body(new Error(e.getMessage()));}
    @ExceptionHandler(IOException.class) ResponseEntity<Error> failed(IOException e){return ResponseEntity.status(500).body(new Error("공개본을 만들거나 읽지 못했습니다. 저장 공간·파일 권한을 확인한 후 다시 읽어 주세요. 기존 공개본은 그대로 보관됩니다."));}
}
