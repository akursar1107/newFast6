-- SQL Schema for Fast6 Supabase Database Setup
-- Copy and run this script in the Supabase SQL Editor (found in your Supabase Dashboard)

-- Drop existing tables if they exist
DROP TABLE IF EXISTS fast6_picks CASCADE;
DROP TABLE IF EXISTS fast6_results CASCADE;
DROP TABLE IF EXISTS fast6_settings CASCADE;

-- 1. Create Settings Table
CREATE TABLE fast6_settings (
    id integer PRIMARY KEY DEFAULT 1,
    season integer NOT NULL DEFAULT 2025,
    participants text[] NOT NULL DEFAULT '{}',
    locked boolean NOT NULL DEFAULT false,
    CONSTRAINT single_row CHECK (id = 1) -- Ensures only one settings row exists
);

-- Initialize settings row
INSERT INTO fast6_settings (id, season, participants, locked)
VALUES (1, 2025, '{}', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Create Picks Table
CREATE TABLE fast6_picks (
    game_id text PRIMARY KEY,
    player_id text NOT NULL,
    player_name text NOT NULL,
    points integer NOT NULL DEFAULT 0,
    graded boolean NOT NULL DEFAULT false,
    picker text NOT NULL
);

-- 3. Create Results Table
CREATE TABLE fast6_results (
    game_id text PRIMARY KEY,
    first_td_id text,
    first_td_name text,
    anytime_td_ids text[] NOT NULL DEFAULT '{}'
);

-- Enable Row Level Security (RLS)
-- For a private group game, we can create simple public read/write access using the Anon Key
ALTER TABLE fast6_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast6_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast6_results ENABLE ROW LEVEL SECURITY;

-- Create policies allowing read/write access via Anon Key
CREATE POLICY "Allow public read settings" ON fast6_settings FOR SELECT USING (true);
CREATE POLICY "Allow public write settings" ON fast6_settings FOR ALL USING (true);

CREATE POLICY "Allow public read picks" ON fast6_picks FOR SELECT USING (true);
CREATE POLICY "Allow public write picks" ON fast6_picks FOR ALL USING (true);

CREATE POLICY "Allow public read results" ON fast6_results FOR SELECT USING (true);
CREATE POLICY "Allow public write results" ON fast6_results FOR ALL USING (true);
