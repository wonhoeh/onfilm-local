package com.onfilm.local.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
public class DatabaseConfig {
    @Bean
    DataSource dataSource(@Value("${onfilm.data-dir}") String directory) throws IOException {
        Path root = Path.of(directory);
        if (!root.isAbsolute() || directory.contains(";") || directory.contains("\n") || directory.contains("\r")) {
            throw new IllegalArgumentException("Use an absolute data directory without semicolons or newlines");
        }
        Path database = root.normalize().resolve("database");
        Files.createDirectories(database);
        HikariDataSource source = new HikariDataSource();
        source.setJdbcUrl("jdbc:h2:file:" + database.resolve("onfilm").toString().replace('\\', '/')
                + ";DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0");
        source.setUsername("sa");
        source.setPassword("");
        source.setMaximumPoolSize(3);
        return source;
    }
}
