package com.onfilm.local.media.encoding;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@ConditionalOnProperty(name="onfilm.encoding-worker",havingValue="true",matchIfMissing=true)
public class EncodingWorker {
    private final EncodingService service;
    public EncodingWorker(EncodingService service){this.service=service;}
    @Scheduled(fixedDelay=2000,initialDelay=2000)
    public void tick(){service.runNext();}
}
