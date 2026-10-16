ALTER TABLE filmography_item ADD category VARCHAR(16) NOT NULL DEFAULT 'ACTING'
    CHECK (category IN ('ACTING', 'DIRECTING', 'MINOR'));
