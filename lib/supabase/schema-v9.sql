-- Territorium schema v9 — veilige regio-migratie
-- Voer dit uit in de Supabase SQL editor

-- 1. Maak regions tabel aan als die nog niet bestaat
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Verwijder de oude VARCHAR region_id kolom als die bestaat (van schema-v4)
ALTER TABLE locations DROP COLUMN IF EXISTS region_id;

-- 3. Voeg de correcte UUID region_id kolom toe met foreign key
ALTER TABLE locations ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE SET NULL;

-- 4. Realtime voor regio's
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE regions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SELECT 'schema-v9: regions tabel + region_id UUID kolom op locations' AS info;
