-- Territorium schema v6 — verhaallijn & verteller
-- Geen nieuwe tabellen nodig: verhaal wordt opgeslagen in game.config (JSONB)
-- game_events tabel ondersteunt al het 'story' event type

-- Zorg dat game_events realtime aanstaat (is al gedaan in schema.sql)
-- ALTER PUBLICATION supabase_realtime ADD TABLE game_events;
SELECT 'schema-v6: geen wijzigingen nodig' AS info;
