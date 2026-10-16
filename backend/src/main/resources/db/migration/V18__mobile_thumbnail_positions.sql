ALTER TABLE filmography_thumbnail ADD mobile_x INT NOT NULL DEFAULT 50 CHECK (mobile_x BETWEEN 0 AND 100);
ALTER TABLE filmography_thumbnail ADD mobile_y INT NOT NULL DEFAULT 50 CHECK (mobile_y BETWEEN 0 AND 100);
