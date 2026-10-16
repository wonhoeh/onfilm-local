CREATE TABLE trailer_edit (
    id VARCHAR(36) PRIMARY KEY,
    draft_id VARCHAR(36) UNIQUE REFERENCES filmography_media_draft(id) ON DELETE SET NULL,
    source_id VARCHAR(36) NOT NULL,
    film_id VARCHAR(36),
    phase VARCHAR(16) NOT NULL DEFAULT 'PROBE',
    status VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    duration_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    preview_ready BOOLEAN NOT NULL DEFAULT FALSE,
    start_seconds DOUBLE PRECISION,
    end_seconds DOUBLE PRECISION,
    result_id VARCHAR(36),
    encode_id VARCHAR(36),
    expected_trailer_id VARCHAR(36),
    expected_trailer_changed BOOLEAN NOT NULL DEFAULT FALSE,
    progress INTEGER NOT NULL DEFAULT 0,
    message VARCHAR(300) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
