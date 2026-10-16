-- Replace the unnamed V17 check without depending on H2-generated constraint names.
-- ACTING is retained as the legacy storage code for the displayed category 단편.
ALTER TABLE filmography_item ADD category_v20 VARCHAR(16) NOT NULL DEFAULT 'ACTING'
    CONSTRAINT ck_filmography_category_v20 CHECK (category_v20 IN ('ACTING', 'DIRECTING', 'LEAD', 'SUPPORTING', 'MINOR'));
UPDATE filmography_item SET category_v20 = category;
ALTER TABLE filmography_item DROP COLUMN category;
ALTER TABLE filmography_item ALTER COLUMN category_v20 RENAME TO category;
