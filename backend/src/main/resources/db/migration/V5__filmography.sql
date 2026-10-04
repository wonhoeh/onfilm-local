CREATE TABLE filmography_state (id INTEGER PRIMARY KEY CHECK (id = 1), version BIGINT NOT NULL);
INSERT INTO filmography_state VALUES (1, 0);
CREATE TABLE filmography_item (
    id VARCHAR(36) PRIMARY KEY,
    position INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    release_year INTEGER,
    runtime_minutes INTEGER,
    age_rating VARCHAR(10) NOT NULL,
    roles VARCHAR(100) NOT NULL,
    genres VARCHAR(1000) NOT NULL,
    cast_type VARCHAR(20) NOT NULL,
    character_name VARCHAR(100) NOT NULL
);
