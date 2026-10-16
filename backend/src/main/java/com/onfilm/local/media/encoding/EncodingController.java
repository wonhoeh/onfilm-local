package com.onfilm.local.media.encoding;

import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
public class EncodingController {
    private final EncodingService service;
    private final TrailerEditingService editing;
    public EncodingController(EncodingService service,TrailerEditingService editing){this.service=service;this.editing=editing;}
    @GetMapping("/api/encoding")
    public List<EncodingService.Job> list(){return java.util.stream.Stream.concat(service.list().stream(),editing.activeJobs().stream()).toList();}
    @PostMapping("/api/videos/{videoId}/encoding")
    public EncodingService.Job request(@PathVariable String videoId){return service.request(videoId);}
}
