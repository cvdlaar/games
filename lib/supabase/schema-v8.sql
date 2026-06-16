-- v8: player strategy system
ALTER TABLE players ADD COLUMN IF NOT EXISTS strategy VARCHAR(20) DEFAULT NULL;
