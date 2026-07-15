# Script to migrate local data.json state directly into your Supabase database instance.
import os
import json
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('VITE_SUPABASE_ANON_KEY')

# Load .env variables if not present in env
if not SUPABASE_URL or not SUPABASE_KEY:
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.strip() and not line.startswith('#') and '=' in line:
                    key, val = line.strip().split('=', 1)
                    if key == 'VITE_SUPABASE_URL':
                        SUPABASE_URL = val
                    elif key == 'VITE_SUPABASE_ANON_KEY':
                        SUPABASE_KEY = val

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Supabase URL and Key are not set in environment or .env file.")
    exit(1)

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

def supabase_post(table, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    req = urllib.request.Request(
        url,
        headers=HEADERS,
        data=json.dumps(data).encode('utf-8'),
        method='POST'
    )
    with urllib.request.urlopen(req) as res:
        return res.read()

# Load data.json
data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'public', 'data.json')
if not os.path.exists(data_path):
    print(f"Error: public/data.json does not exist. Cannot migrate.")
    exit(1)

with open(data_path, 'r') as f:
    data = json.load(f)

print("Starting migration to Supabase...")

# 1. Migrate settings
settings = data.get("settings", {})
settings_payload = {
    "id": 1,
    "season": settings.get("season", 2025),
    "participants": settings.get("participants", []),
    "locked": settings.get("locked", False)
}
print("Migrating settings...")
supabase_post("fast6_settings", settings_payload)

# 2. Migrate results
results = data.get("results", {})
results_payload = []
for game_id, res in results.items():
    results_payload.append({
        "game_id": game_id,
        "first_td_id": res.get("first_td_id"),
        "first_td_name": res.get("first_td_name"),
        "anytime_td_ids": res.get("anytime_td_ids", [])
    })
if results_payload:
    print(f"Migrating {len(results_payload)} results...")
    supabase_post("fast6_results", results_payload)

# 3. Migrate picks
picks = data.get("picks", {})
picks_payload = []
for game_id, p in picks.items():
    picks_payload.append({
        "game_id": game_id,
        "player_id": p.get("player_id"),
        "player_name": p.get("player_name"),
        "points": p.get("points", 0),
        "graded": p.get("graded", False),
        "picker": p.get("picker", "Unknown")
    })
if picks_payload:
    print(f"Migrating {len(picks_payload)} picks...")
    eligible_games = data.get("eligible_games", [])
    game_pickers = {g["game_id"]: g["picker"] for g in eligible_games}
    for item in picks_payload:
        item["picker"] = game_pickers.get(item["game_id"], "Unknown")
    supabase_post("fast6_picks", picks_payload)

print("Migration to Supabase completed successfully!")
