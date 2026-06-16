-- Territorium schema v3 — run in Supabase SQL editor after schema-v2.sql

-- Avatar emoji per speler
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar VARCHAR(10) DEFAULT '🧭';

-- Target player voor admin berichten (NULL = iedereen)
ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS target_player_id UUID REFERENCES players(id);
