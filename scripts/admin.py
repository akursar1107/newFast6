#!/usr/bin/env python3
import json
import os
import random
import sys

DATA_JSON_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "data.json"))
PLAYERS_JSON_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "players.json"))

def load_json(path):
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def print_header(title):
    print("\n" + "=" * 50)
    print(f" {title} ".center(50, "="))
    print("=" * 50)

def manage_participants(data):
    print_header("Manage Participants")
    participants = data["settings"].get("participants", [])
    locked = data["settings"].get("locked", False)
    
    if locked:
        print("Season rotation is currently LOCKED.")
        print(f"Active order: {', '.join(participants)}")
        choice = input("Do you want to UNLOCK and reset participants? (y/N): ").strip().lower()
        if choice != 'y':
            return
        data["settings"]["locked"] = False
        print("Season rotation unlocked!")
        
    print("\nEnter participant names separated by commas (e.g. Alice, Bob, Charlie):")
    names_input = input("> ").strip()
    if not names_input:
        print("No participants entered. Keeping existing.")
        return
        
    names = [n.strip() for n in names_input.split(",") if n.strip()]
    if not names:
        print("Invalid input.")
        return
        
    # Shuffle and lock
    random.shuffle(names)
    data["settings"]["participants"] = names
    data["settings"]["locked"] = True
    print("\nRandomized and LOCKED order for the season:")
    for i, name in enumerate(names, 1):
        print(f"  {i}. {name}")
        
    # Reset picks and standings for clean start
    data["picks"] = {}
    data["results"] = {}
    data["standings"] = {name: {"points": 0, "correct_first": 0, "correct_anytime": 0, "picks_made": 0} for name in names}
    
    save_json(DATA_JSON_PATH, data)
    print("\nDatabase initialized! Run `./scripts/grade.py` to regenerate game assignments.")

def enter_picks(data, players_data):
    if not players_data:
        print("Error: players.json not found. Run `./scripts/grade.py` once to build the player roster.")
        return
        
    print_header("Enter Weekly Picks")
    participants = data["settings"].get("participants", [])
    locked = data["settings"].get("locked", False)
    
    if not locked or not participants:
        print("Season must be locked with participants before entering picks.")
        return
        
    eligible_games = data.get("eligible_games", [])
    if not eligible_games:
        print("No eligible games found in database. Run `./scripts/grade.py` to load schedule.")
        return
        
    # Filter games that are not played yet (game_status == 'PRE')
    upcoming_games = [g for g in eligible_games if g.get("game_status") == "PRE"]
    if not upcoming_games:
        print("All eligible games for this season are completed! No picks to enter.")
        return
        
    # Sort upcoming games chronologically
    upcoming_games.sort(key=lambda g: (g.get('gameday', ''), g.get('gametime', ''), g.get('game_id', '')))
    
    print("Upcoming games:")
    for idx, game in enumerate(upcoming_games[:10], 1):
        game_id = game["game_id"]
        picker = game["picker"]
        existing_pick = data["picks"].get(game_id, {})
        pick_display = f"-> Pick: {existing_pick.get('player_name')} ({existing_pick.get('player_id')})" if existing_pick else "(No pick entered)"
        print(f"  [{idx}] Week {game['week']} - {game['away_team']} @ {game['home_team']} ({game['gameday']} {game['gametime']})")
        print(f"      Picker: {picker} {pick_display}")
        
    try:
        selection = input("\nSelect game index to enter/edit pick (or press Enter to cancel): ").strip()
        if not selection:
            return
        idx = int(selection) - 1
        if idx < 0 or idx >= len(upcoming_games):
            print("Invalid index.")
            return
    except ValueError:
        print("Invalid input.")
        return
        
    game = upcoming_games[idx]
    game_id = game["game_id"]
    picker = game["picker"]
    away_team = game["away_team"]
    home_team = game["home_team"]
    
    print_header(f"Pick for {picker} - {away_team} @ {home_team}")
    
    # Filter players list to only players on away or home team
    game_players = [p for p in players_data.get("players", []) if p["team"] in (away_team, home_team)]
    
    if not game_players:
        print(f"No rosters found for {away_team} or {home_team}. Type player name manually.")
    
    search_query = input("Search player name (e.g. 'Henry' or team name like 'KC'): ").strip().lower()
    
    matches = []
    for p in game_players:
        if search_query in p["name"].lower() or search_query in p["team"].lower():
            matches.append(p)
            
    if not matches:
        print("No players matched search. Showing all available for these teams:")
        matches = game_players[:40]
        
    print("\nMatching players:")
    for p_idx, p in enumerate(matches, 1):
        print(f"  [{p_idx}] {p['name']} ({p['pos']} - {p['team']})")
        
    try:
        player_selection = input("\nSelect player index: ").strip()
        p_idx = int(player_selection) - 1
        if p_idx < 0 or p_idx >= len(matches):
            print("Invalid selection.")
            return
    except ValueError:
        print("Invalid input.")
        return
        
    selected_player = matches[p_idx]
    
    # Save pick
    data["picks"][game_id] = {
        "player_id": selected_player["id"],
        "player_name": selected_player["name"],
        "points": 0,
        "graded": False
    }
    
    save_json(DATA_JSON_PATH, data)
    print(f"\nSuccessfully saved pick: {picker} selects {selected_player['name']}!")

def main():
    data = load_or_init_data()
    players_data = load_json(PLAYERS_JSON_PATH)
    
    # Initialize basic data.json if empty
    if not data:
        data = {
            "settings": {"season": 2025, "participants": [], "locked": False},
            "picks": {},
            "results": {},
            "standings": {}
        }
        
    while True:
        print_header("NFL First TD Scorer Tracker - CLI Admin Portal")
        print(f"Active Season: {data['settings'].get('season')}")
        print(f"Locked Participants: {len(data['settings'].get('participants', []))} players")
        print("\nWhat would you like to do?")
        print("  [1] Manage / Initialize Participants (Shuffle & Lock Rotation)")
        print("  [2] Enter / Edit Picks for Upcoming Games")
        print("  [3] Run Grader Script (Sync Results from nflverse)")
        print("  [4] Exit")
        
        choice = input("\nSelect option [1-4]: ").strip()
        
        if choice == '1':
            manage_participants(data)
            data = load_or_init_data() # reload
        elif choice == '2':
            enter_picks(data, players_data)
            data = load_or_init_data() # reload
        elif choice == '3':
            print("\nRunning grader script...")
            os.system(f"{sys.executable} {os.path.join(os.path.dirname(__file__), 'grade.py')}")
            data = load_or_init_data() # reload
            players_data = load_json(PLAYERS_JSON_PATH)
        elif choice == '4' or not choice:
            print("Goodbye!")
            break
        else:
            print("Invalid choice.")

def load_or_init_data():
    if os.path.exists(DATA_JSON_PATH):
        try:
            with open(DATA_JSON_PATH, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            pass
    return None

if __name__ == "__main__":
    main()
