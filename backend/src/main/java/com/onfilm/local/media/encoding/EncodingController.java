package com.onfilm.local.media.encoding;

import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
public class EncodingController {
    private final EncodingService service;
    public EncodingController(EncodingService service){this.service=service;}
    @GetMapping("/api/encoding")
    public List<EncodingService.Job> list(){return service.list();}
    @PostMapping("/api/videos/{videoId}/encoding")
    public EncodingService.Job request(@PathVariable String videoId){return service.request(videoId);}
}
