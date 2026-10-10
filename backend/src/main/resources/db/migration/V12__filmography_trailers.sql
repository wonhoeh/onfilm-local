CREATE TABLE filmography_trailer (
    film_id VARCHAR(36) PRIMARY KEY REFERENCES filmography_item(id) ON DELETE CASCADE,
    video_id VARCHAR(36) NOT NULL UNIQUE REFERENCES local_video(id)
);
ALTER TABLE filmography_media_draft ADD trailer_changed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE filmography_media_draft ADD trailer_id VARCHAR(36) REFERENCES local_video(id);
