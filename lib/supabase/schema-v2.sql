-- Territorium schema v2 — run in Supabase SQL editor

-- QR Powerups (aangemaakt door host, gescand door spelers)
CREATE TABLE powerups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  token VARCHAR(32) UNIQUE NOT NULL,
  type VARCHAR(30) NOT NULL,  -- crowns_bonus | double_income | shield | reveal_all | secret_location | steal
  value JSONB DEFAULT '{}',   -- type-specific payload
  label VARCHAR(100) NOT NULL,
  emoji VARCHAR(10) DEFAULT '⚡',
  lat DOUBLE PRECISION,       -- physical location (optioneel)
  lng DOUBLE PRECISION,
  claimed_by UUID REFERENCES players(id),
  claimed_at TIMESTAMPTZ,
  is_secret_location BOOLEAN DEFAULT false,  -- verschijnt pas op kaart na scannen
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actieve buffs per speler
CREATE TABLE player_buffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  value JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  source_powerup_id UUID REFERENCES powerups(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin events (game master acties)
CREATE TABLE admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,  -- announcement | double_crowns | storm | bonus_mission | crown_rain | location_boost
  title VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  value JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE powerups DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_buffs DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_events DISABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE player_buffs;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_events;
ALTER PUBLICATION supabase_realtime ADD TABLE powerups;
