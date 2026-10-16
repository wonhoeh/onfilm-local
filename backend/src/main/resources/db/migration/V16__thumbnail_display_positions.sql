ALTER TABLE filmography_thumbnail ADD display_x INT NOT NULL DEFAULT 50 CHECK (display_x BETWEEN 0 AND 100);
ALTER TABLE filmography_thumbnail ADD display_y INT NOT NULL DEFAULT 50 CHECK (display_y BETWEEN 0 AND 100);
