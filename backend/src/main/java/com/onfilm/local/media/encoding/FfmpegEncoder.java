package com.onfilm.local.media.encoding;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class FfmpegEncoder {
    private final String ffmpeg,ffprobe;
    private final ObjectMapper json;
    private Process active;
    private volatile boolean closing;
    public FfmpegEncoder(@Value("${onfilm.ffmpeg}") String ffmpeg,@Value("${onfilm.ffprobe}") String ffprobe,ObjectMapper json){this.ffmpeg=ffmpeg;this.ffprobe=ffprobe;this.json=json;}
    public static class Failure extends Exception { public Failure(String message){super(message);} }
    String run(List<String> command,Duration timeout) throws Exception {
        Process process;
        synchronized(this){
            if(closing)throw new InterruptedException();
            try{process=new ProcessBuilder(command).redirectErrorStream(true).start();}
            catch(IOException e){throw new Failure("FFmpeg/ffprobe를 실행할 수 없습니다. 설치 또는 실행 경로를 확인해 주세요.");}
            active=process;
        }
        process.getOutputStream().close();
        // Drain continuously but keep only a bounded diagnostic/probe response in memory.
        var output=new CompletableFuture<String>();
        Thread.ofVirtual().start(()->{
            try(var input=process.getInputStream();var bytes=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int n;
                while((n=input.read(buffer))!=-1){if(bytes.size()<131072)bytes.write(buffer,0,Math.min(n,131072-bytes.size()));}
                output.complete(bytes.toString(StandardCharsets.UTF_8));
            }catch(Exception e){output.completeExceptionally(e);}
        });
        try {
            if(!process.waitFor(timeout.toMillis(),TimeUnit.MILLISECONDS))throw new Failure("변환 제한 시간을 초과했습니다. 영상 길이와 파일 상태를 확인해 주세요.");
            if(closing)throw new InterruptedException();
            String result=output.get(5,TimeUnit.SECONDS);
            if(process.exitValue()!=0)throw new Failure("영상 분석 또는 변환에 실패했습니다. 손상된 파일·지원하지 않는 코덱·저장 공간을 확인해 주세요.");
            return result;
        } finally {
            process.destroy();if(!process.waitFor(2,TimeUnit.SECONDS)){process.destroyForcibly();process.waitFor(2,TimeUnit.SECONDS);}
            synchronized(this){if(active==process)active=null;}
        }
    }
    public void encode(Path source,Path output) throws Exception {
        if(!Files.isRegularFile(source,LinkOption.NOFOLLOW_LINKS))throw new Failure("원본 영상 파일을 찾을 수 없습니다.");
        String probe=run(List.of(ffprobe,"-v","error","-protocol_whitelist","file,pipe","-enable_drefs","0","-use_absolute_path","0","-select_streams","v:0","-show_entries","stream=width,height:format=duration","-of","json",source.toString()),Duration.ofSeconds(30));
        var info=json.readTree(probe);var streams=info.path("streams");
        int width=streams.path(0).path("width").asInt(),height=streams.path(0).path("height").asInt();
        double seconds=info.path("format").path("duration").asDouble();
        if(width<2||height<2||(long)width*height>40_000_000||!Double.isFinite(seconds)||seconds<=0||seconds>6*3600)throw new Failure("지원 범위를 벗어난 영상입니다. 영상 트랙·해상도(4천만 화소 이하)·길이(6시간 이하)를 확인해 주세요.");
        Files.createDirectories(output);
        if(Files.getFileStore(output).getUsableSpace()<Math.max(256L*1024*1024,Files.size(source)*2))throw new Failure("인코딩을 시작할 저장 공간이 부족합니다.");
        run(List.of(ffmpeg,"-hide_banner","-nostdin","-v","error","-xerror","-protocol_whitelist","file,pipe","-enable_drefs","0","-use_absolute_path","0","-threads","2","-i",source.toString(),
            "-map","0:v:0","-map","0:a:0?","-map_metadata","-1","-map_chapters","-1","-sn","-dn",
            "-filter_threads","1","-vf","scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
            "-c:v","libx264","-threads","2","-preset","veryfast","-crf","23","-pix_fmt","yuv420p","-force_key_frames","expr:gte(t,n_forced*4)",
            "-c:a","aac","-b:a","128k","-ac","2","-f","hls","-hls_time","4","-hls_playlist_type","vod","-hls_flags","independent_segments",
            "-hls_segment_filename",output.resolve("segment-%05d.ts").toString(),output.resolve("index.m3u8").toString()),Duration.ofHours(6));
        validateOutput(output);
    }
    void validateOutput(Path output) throws Exception {
        Path manifest=output.resolve("index.m3u8");
        if(!Files.isRegularFile(manifest)||Files.size(manifest)>2*1024*1024)throw new Failure("변환 결과 목록을 확인할 수 없습니다.");
        var lines=Files.readAllLines(manifest);int segments=0;
        if(!lines.contains("#EXT-X-ENDLIST"))throw new Failure("변환이 완료되지 않았습니다.");
        for(String line:lines){if(line.isBlank()||line.startsWith("#"))continue;
            if(!line.matches("segment-[0-9]+\\.ts")||!Files.isRegularFile(output.resolve(line))||Files.size(output.resolve(line))==0)throw new Failure("변환된 영상 조각을 확인할 수 없습니다.");segments++;
        }
        if(segments==0)throw new Failure("변환된 영상이 없습니다.");
    }
    public synchronized void stop(){closing=true;if(active!=null){active.destroy();if(active.isAlive())active.destroyForcibly();}}
}
