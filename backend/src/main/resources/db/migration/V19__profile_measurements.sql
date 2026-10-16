ALTER TABLE profile ADD height_cm DECIMAL(4,1) CHECK (height_cm > 0 AND height_cm <= 300);
ALTER TABLE profile ADD weight_kg DECIMAL(4,1) CHECK (weight_kg > 0 AND weight_kg <= 500);
