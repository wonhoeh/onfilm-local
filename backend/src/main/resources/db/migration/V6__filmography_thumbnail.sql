CREATE TABLE filmography_thumbnail (
    film_id VARCHAR(36) PRIMARY KEY REFERENCES filmography_item(id) ON DELETE CASCADE,
    image BLOB NOT NULL
);
