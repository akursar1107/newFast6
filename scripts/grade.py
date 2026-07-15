#!/usr/bin/env python3
import urllib.request
import gzip
import csv
import json
import os
import sys
import io

# URLs for nflverse data
GAMES_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"
ROSTER_URL_TEMPLATE = "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{year}.csv"
PBP_URL_TEMPLATE = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{year}.csv.gz"

DATA_JSON_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "data.json"))
PLAYERS_JSON_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "players.json"))

SKILL_POSITIONS = {"QB", "RB", "WR", "TE"}
OLINE_POSITIONS = {"C", "G", "T", "OT", "OG", "OL"}

def fetch_csv(url):
    print(f"Fetching CSV from {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        content = response.read()
        # Decode and parse CSV
        text = content.decode('utf-8')
        f = io.StringIO(text)
        reader = csv.DictReader(f)
        return list(reader)

def fetch_gzipped_csv(url):
    print(f"Fetching Gzipped CSV from {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        compressed_data = response.read()
        decompressed_data = gzip.decompress(compressed_data)
        text = decompressed_data.decode('utf-8')
        f = io.StringIO(text)
        reader = csv.DictReader(f)
        return list(reader)

def is_eligible_game(game):
    g_type = game.get('game_type')
    if g_type not in ('REG', 'WC', 'DIV', 'CON', 'SB'):
        return False
        
    weekday = game.get('weekday', '')
    gametime = game.get('gametime', '')
    if not gametime:
        return False
        
    # Include all playoff games regardless of time
    if g_type in ('WC', 'DIV', 'CON', 'SB'):
        return True
        
    try:
        hh, mm = map(int, gametime.split(':'))
    except ValueError:
        return False
        
    # For regular season, exclude Sunday games starting between 12:00 PM and 5:00 PM EST
    if weekday == 'Sunday' and 12 <= hh < 17:
        return False
        
    return True

def get_player_position_map(rosters):
    """
    Creates a lookup map for players to their positions.
    Key: gsis_id, Value: dict containing name, position, team
    """
    player_map = {}
    for row in rosters:
        gsis_id = row.get('gsis_id')
        if not gsis_id:
            continue
        
        # Keep track of the most recent week entry for position info
        pos = row.get('position', '')
        name = row.get('full_name', row.get('football_name', ''))
        team = row.get('team', '')
        
        # If position is empty or not in skill/oline, check if it's defensive
        player_map[gsis_id] = {
            'name': name,
            'position': pos,
            'team': team
        }
    return player_map

def map_scorer(player_id, team, player_map):
    """
    Maps a play-by-play scorer to their fantasy pick ID:
    - Skill players (QB/RB/WR/TE) map to their own gsis_id.
    - Offensive Linemen map to [TEAM]_OLINE.
    - Others (Defense/Special Teams, e.g. CB/LB/S/K/P) map to [TEAM]_DEF.
    """
    if not player_id:
        return f"{team}_DEF", f"{team} DEF/ST"
        
    player = player_map.get(player_id)
    if not player:
        # Default fallback to DEF/ST if not found in roster
        return f"{team}_DEF", f"{team} DEF/ST"
        
    pos = player.get('position', '')
    name = player.get('name', '')
    
    if pos in SKILL_POSITIONS:
        return player_id, name
    elif pos in OLINE_POSITIONS:
        return f"{team}_OLINE", f"{team} OLine"
    else:
        # Defensive or Special teams player
        return f"{team}_DEF", f"{team} DEF/ST"

def rebuild_players_json(season, rosters):
    """
    Compiles a lightweight players.json list for the active teams.
    This list is used by the frontend searchable dropdown.
    """
    players = []
    seen = set()
    
    # Add all skill position players
    for row in rosters:
        gsis_id = row.get('gsis_id')
        if not gsis_id or gsis_id in seen:
            continue
            
        pos = row.get('position', '')
        if pos not in SKILL_POSITIONS:
            continue
            
        name = row.get('full_name', row.get('football_name', ''))
        team = row.get('team', '')
        
        players.append({
            'id': gsis_id,
            'name': name,
            'team': team,
            'pos': pos
        })
        seen.add(gsis_id)
        
    # Get all unique teams in rosters to add DEF/ST and OLine options
    teams = sorted(list(set(row.get('team', '') for row in rosters if row.get('team'))))
    for team in teams:
        players.append({
            'id': f"{team}_DEF",
            'name': f"{team} DEF/ST",
            'team': team,
            'pos': "DEF"
        })
        players.append({
            'id': f"{team}_OLINE",
            'name': f"{team} OLine",
            'team': team,
            'pos': "OLINE"
        })
        
    os.makedirs(os.path.dirname(PLAYERS_JSON_PATH), exist_ok=True)
    with open(PLAYERS_JSON_PATH, 'w') as f:
        json.dump({'players': players}, f, indent=2)
    print(f"Saved {len(players)} players to {PLAYERS_JSON_PATH}")

def load_or_init_data():
    if os.path.exists(DATA_JSON_PATH):
        try:
            with open(DATA_JSON_PATH, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            pass
            
    return {
        "settings": {
            "season": 2025,
            "participants": [],
            "locked": False
        },
        "picks": {},
        "results": {},
        "standings": {}
    }

def save_data(data):
    os.makedirs(os.path.dirname(DATA_JSON_PATH), exist_ok=True)
    with open(DATA_JSON_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Saved data to {DATA_JSON_PATH}")

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('VITE_SUPABASE_ANON_KEY')
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)

if USE_SUPABASE:
    HEADERS = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }

def supabase_get(table, params=''):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

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

def run_grading(year=None):
    # 1. Load data
    if USE_SUPABASE:
        print("Using Supabase database for loading config...")
        try:
            settings_list = supabase_get('fast6_settings', 'id=eq.1')
            settings = settings_list[0] if settings_list else {"season": 2025, "participants": [], "locked": False}
        except Exception as e:
            print(f"Failed to query fast6_settings from Supabase: {e}. Falling back to default settings.")
            settings = {"season": 2025, "participants": [], "locked": False}
            
        try:
            picks_list = supabase_get('fast6_picks')
            picks = {p['game_id']: {
                "player_id": p.get("player_id"),
                "player_name": p.get("player_name"),
                "points": p.get("points", 0),
                "graded": p.get("graded", False),
                "picker": p.get("picker")
            } for p in picks_list}
        except Exception as e:
            print(f"Failed to query fast6_picks from Supabase: {e}")
            picks = {}
            
        try:
            results_list = supabase_get('fast6_results')
            results = {r['game_id']: {
                "first_td_id": r.get("first_td_id"),
                "first_td_name": r.get("first_td_name"),
                "anytime_td_ids": r.get("anytime_td_ids", [])
            } for r in results_list}
        except Exception as e:
            print(f"Failed to query fast6_results from Supabase: {e}")
            results = {}
            
        data = {
            "settings": settings,
            "picks": picks,
            "results": results,
            "standings": {}
        }
    else:
        print("Using local data.json file database...")
        data = load_or_init_data()
    
    # Determine season year
    season_year = year or data["settings"].get("season", 2025)
    data["settings"]["season"] = season_year
    print(f"Running grading for {season_year} season...")
    
    # 2. Fetch rosters & schedules
    try:
        rosters = fetch_csv(ROSTER_URL_TEMPLATE.format(year=season_year))
        rebuild_players_json(season_year, rosters)
        player_map = get_player_position_map(rosters)
    except Exception as e:
        print(f"Error fetching rosters: {e}. Standard grading will use fallback values.")
        player_map = {}
        
    try:
        schedule = fetch_csv(GAMES_URL)
    except Exception as e:
        print(f"Critical error fetching schedules: {e}")
        return
        
    # 3. Filter schedule for eligible games
    eligible_games = [g for g in schedule if int(g.get('season', 0)) == season_year and is_eligible_game(g)]
    
    # Sort eligible games chronologically to lock rotation assignments
    # Sort by gameday, gametime, game_id
    eligible_games.sort(key=lambda g: (g.get('gameday', ''), g.get('gametime', ''), g.get('game_id', '')))
    print(f"Found {len(eligible_games)} eligible games in the {season_year} schedule.")
    
    # 4. Check rotation pickers
    participants = data["settings"].get("participants", [])
    
    # Build dynamic game list with assigned picker (preserving manual pickers where possible)
    existing_game_pickers = {}
    if "eligible_games" in data:
        for eg in data["eligible_games"]:
            if eg.get("picker") and eg.get("picker") != "TBD":
                existing_game_pickers[eg["game_id"]] = eg["picker"]

    game_assignments = {}
    for i, game in enumerate(eligible_games):
        game_id = game['game_id']
        existing_pick = picks.get(game_id)
        picker = "TBD"
        if existing_pick and existing_pick.get("picker"):
            picker = existing_pick.get("picker")
        elif game_id in existing_game_pickers:
            picker = existing_game_pickers[game_id]
        elif participants:
            picker = participants[i % len(participants)]
            
        game_assignments[game_id] = {
            'game_id': game_id,
            'gameday': game.get('gameday'),
            'gametime': game.get('gametime'),
            'away_team': game.get('away_team'),
            'home_team': game.get('home_team'),
            'week': int(game.get('week', 0)),
            'weekday': game.get('weekday'),
            'picker': picker,
            'game_status': 'POST' if (game.get('home_score') is not None and game.get('home_score') != '') else 'PRE'
        }
        
    data["eligible_games"] = list(game_assignments.values())
    
    # 5. Fetch Play-by-play for finished games
    # Find finished eligible games that have picks and haven't been graded yet,
    # or that we simply need to check.
    finished_game_ids = [g['game_id'] for g in eligible_games if (g.get('home_score') is not None and g.get('home_score') != '')]
    print(f"Finished games count: {len(finished_game_ids)}")
    
    if finished_game_ids:
        try:
            pbp = fetch_gzipped_csv(PBP_URL_TEMPLATE.format(year=season_year))
        except Exception as e:
            print(f"Error fetching play-by-play: {e}")
            pbp = []
            
        if pbp:
            print(f"Processing play-by-play data ({len(pbp)} rows)...")
            # Group plays by finished game_id
            game_plays = {}
            for play in pbp:
                g_id = play.get('game_id')
                if g_id in finished_game_ids:
                    if g_id not in game_plays:
                        game_plays[g_id] = []
                    game_plays[g_id].append(play)
                    
            # Grade each finished game
            for g_id in finished_game_ids:
                plays = game_plays.get(g_id, [])
                # Find plays where touchdown == 1
                td_plays = []
                for p in plays:
                    # check touchdown col
                    td_flag = p.get('touchdown', '0')
                    # Could be "1" or "1.0"
                    if td_flag in ('1', '1.0', 1, 1.0):
                        td_player_id = p.get('td_player_id', '')
                        td_team = p.get('td_team', '')
                        play_id = int(p.get('play_id', 0) or 0)
                        if td_player_id and td_team:
                            td_plays.append({
                                'play_id': play_id,
                                'td_player_id': td_player_id,
                                'td_team': td_team
                            })
                            
                # Sort TD plays by play_id to get correct order
                td_plays.sort(key=lambda x: x['play_id'])
                
                # Resolve player details
                first_td_id = None
                first_td_name = None
                anytime_td_ids = []
                
                for idx, td in enumerate(td_plays):
                    mapped_id, mapped_name = map_scorer(td['td_player_id'], td['td_team'], player_map)
                    if idx == 0:
                        first_td_id = mapped_id
                        first_td_name = mapped_name
                    if mapped_id not in anytime_td_ids:
                        anytime_td_ids.append(mapped_id)
                        
                data["results"][g_id] = {
                    "first_td_id": first_td_id,
                    "first_td_name": first_td_name,
                    "anytime_td_ids": anytime_td_ids
                }
                print(f"Graded game {g_id}: First TD = {first_td_name} ({first_td_id}), Anytime TDs = {len(anytime_td_ids)}")
                
    # 6. Recalculate Points for Picks
    # Reset points in standings
    standings = {p: {"points": 0, "correct_first": 0, "correct_anytime": 0, "picks_made": 0} for p in participants}
    
    for game_id, pick in data["picks"].items():
        # Get assigned picker for this game from dynamically computed assignments
        assignment = game_assignments.get(game_id)
        if not assignment:
            continue
            
        picker = assignment['picker']
        if picker not in standings:
            standings[picker] = {"points": 0, "correct_first": 0, "correct_anytime": 0, "picks_made": 0}
            
        standings[picker]["picks_made"] += 1
        
        # Check if result is available
        result = data["results"].get(game_id)
        if result:
            pick_player_id = pick.get("player_id")
            
            # Grade
            if pick_player_id == result.get("first_td_id"):
                pick["points"] = 3
                pick["graded"] = True
                standings[picker]["points"] += 3
                standings[picker]["correct_first"] += 1
            elif pick_player_id in result.get("anytime_td_ids", []):
                pick["points"] = 1
                pick["graded"] = True
                standings[picker]["points"] += 1
                standings[picker]["correct_anytime"] += 1
            else:
                pick["points"] = 0
                pick["graded"] = True
                
    data["standings"] = standings
    
    # 7. Save results and updated picks
    if USE_SUPABASE:
        print("Upserting graded results and picks back to Supabase...")
        results_list = []
        for g_id, res in data["results"].items():
            results_list.append({
                "game_id": g_id,
                "first_td_id": res.get("first_td_id"),
                "first_td_name": res.get("first_td_name"),
                "anytime_td_ids": res.get("anytime_td_ids", [])
            })
        if results_list:
            supabase_post('fast6_results', results_list)
            
        picks_list = []
        for g_id, p in data["picks"].items():
            game_assignment = game_assignments.get(g_id)
            picker = game_assignment['picker'] if game_assignment else 'Unknown'
            picks_list.append({
                "game_id": g_id,
                "player_id": p.get("player_id"),
                "player_name": p.get("player_name"),
                "points": p.get("points", 0),
                "graded": p.get("graded", False),
                "picker": picker
            })
        if picks_list:
            supabase_post('fast6_picks', picks_list)
    else:
        save_data(data)
        
    print("Grading completed successfully!")

if __name__ == "__main__":
    # Allow year argument
    year_arg = None
    if len(sys.argv) > 1:
        try:
            year_arg = int(sys.argv[1])
        except ValueError:
            print("Year must be an integer.")
            sys.exit(1)
            
    run_grading(year_arg)
