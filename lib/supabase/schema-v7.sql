-- Territorium schema v7 — regio's + region_id op locaties
-- Voer dit uit in de Supabase SQL editor

-- 1. Regio's tabel
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Regio-kolom op locaties
ALTER TABLE locations ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE SET NULL;

-- 3. Realtime voor regio's (optioneel maar handig)
ALTER PUBLICATION supabase_realtime ADD TABLE regions;

SELECT 'schema-v7: regions + region_id op locations toegevoegd' AS info;
