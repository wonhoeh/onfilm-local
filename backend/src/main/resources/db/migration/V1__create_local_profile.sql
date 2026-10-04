CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name VARCHAR(60) NOT NULL,
    one_line_intro VARCHAR(120) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

-- Empty singleton, not a demo user. Later migrations must never overwrite edits.
INSERT INTO profile (id, name, one_line_intro, version) VALUES (1, '', '', 0);
