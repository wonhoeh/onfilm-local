CREATE TABLE filmography_media_draft (
    id VARCHAR(36) PRIMARY KEY,
    thumbnail_changed BOOLEAN NOT NULL DEFAULT FALSE,
    image BLOB,
    video_changed BOOLEAN NOT NULL DEFAULT FALSE,
    video_id VARCHAR(36) REFERENCES local_video(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
