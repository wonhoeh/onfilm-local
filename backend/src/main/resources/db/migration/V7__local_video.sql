CREATE TABLE local_video (
    id VARCHAR(36) PRIMARY KEY,
    film_id VARCHAR(36) REFERENCES filmography_item(id) ON DELETE SET NULL,
    original_name VARCHAR(200) NOT NULL,
    size_bytes BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
