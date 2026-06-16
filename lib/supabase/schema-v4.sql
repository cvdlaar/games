-- Territorium schema v4 — spelfases + regio's

-- Fases opgeslagen in game.config (JSONB, geen aparte tabel nodig)
-- Huidige fase index
ALTER TABLE games ADD COLUMN IF NOT EXISTS current_phase INTEGER DEFAULT 0;

-- Regio-groepering voor locaties
ALTER TABLE locations ADD COLUMN IF NOT EXISTS region_id VARCHAR(30);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS region_name VARCHAR(60);
