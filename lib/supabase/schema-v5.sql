-- Territorium schema v5 — spelstatistieken

CREATE TABLE IF NOT EXISTS player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  distance_meters DOUBLE PRECISION DEFAULT 0,
  locations_claimed INTEGER DEFAULT 0,
  locations_lost INTEGER DEFAULT 0,
  encounters_won INTEGER DEFAULT 0,
  encounters_lost INTEGER DEFAULT 0,
  powerups_found INTEGER DEFAULT 0,
  crowns_earned INTEGER DEFAULT 0,
  crowns_lost INTEGER DEFAULT 0,
  peak_crowns INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, game_id)
);

ALTER TABLE player_stats DISABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE player_stats;
