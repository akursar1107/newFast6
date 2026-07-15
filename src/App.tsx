import { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  Calendar, 
  Settings as SettingsIcon, 
  Users, 
  Search, 
  Lock, 
  Unlock, 
  Download, 
  CheckCircle, 
  X, 
  Crown, 
  Sparkles, 
  Shuffle, 
  AlertTriangle,
  Edit3
} from 'lucide-react';
import './App.css';

// NFL Team Color Palette mapping
const TEAM_COLORS: Record<string, { bg: string; text: string }> = {
  KC: { bg: '#E31837', text: '#FFB81C' },
  BAL: { bg: '#241773', text: '#9E7C0C' },
  BUF: { bg: '#00338D', text: '#FFFFFF' },
  DAL: { bg: '#003594', text: '#869397' },
  PHI: { bg: '#004C54', text: '#A5ACAF' },
  SF: { bg: '#AA0000', text: '#B3995D' },
  MIA: { bg: '#008E97', text: '#FC4C02' },
  DET: { bg: '#0076B6', text: '#B0B7BC' },
  GB: { bg: '#203731', text: '#FFB612' },
  MIN: { bg: '#4F2683', text: '#FFC62F' },
  CHI: { bg: '#0B2265', text: '#C83803' },
  LAC: { bg: '#0080C6', text: '#FFC20E' },
  LV: { bg: '#000000', text: '#A5ACAF' },
  DEN: { bg: '#FB4F14', text: '#0A2343' },
  SEA: { bg: '#002244', text: '#69BE28' },
  ARI: { bg: '#97233F', text: '#FFB612' },
  PIT: { bg: '#101820', text: '#FFB612' },
  NYJ: { bg: '#125740', text: '#FFFFFF' },
  HOU: { bg: '#03202F', text: '#A71930' },
  IND: { bg: '#002C5F', text: '#FFFFFF' },
  JAX: { bg: '#006778', text: '#D7A22A' },
  TEN: { bg: '#4B92DB', text: '#0C2340' },
  CLE: { bg: '#311D00', text: '#FF3C00' },
  CIN: { bg: '#000000', text: '#FB4F14' },
  CAR: { bg: '#0085CA', text: '#101820' },
  TB: { bg: '#34302B', text: '#D50A0A' },
  ATL: { bg: '#000000', text: '#A71930' },
  NE: { bg: '#002244', text: '#C60C30' },
  NYG: { bg: '#0B2265', text: '#A71930' },
  WAS: { bg: '#5A1414', text: '#FFB612' },
  NO: { bg: '#D3BC8D', text: '#101820' },
  LAR: { bg: '#003594', text: '#FFA300' }
};

interface Game {
  game_id: string;
  gameday: string;
  gametime: string;
  away_team: string;
  home_team: string;
  week: number;
  weekday: string;
  picker: string;
  game_status: 'PRE' | 'POST' | string;
}

interface Pick {
  player_id: string;
  player_name: string;
  points: number;
  graded: boolean;
}

interface Result {
  first_td_id: string | null;
  first_td_name: string | null;
  anytime_td_ids: string[];
}

interface Standings {
  points: number;
  correct_first: number;
  correct_anytime: number;
  picks_made: number;
}

interface GameData {
  settings: {
    season: number;
    participants: string[];
    locked: boolean;
  };
  picks: Record<string, Pick>;
  results: Record<string, Result>;
  standings: Record<string, Standings>;
  eligible_games?: Game[];
}

interface Player {
  id: string;
  name: string;
  team: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE' | 'DEF' | 'OLINE' | string;
}

interface PlayersData {
  players: Player[];
}

function App() {
  const [data, setData] = useState<GameData | null>(null);
  const [playersData, setPlayersData] = useState<PlayersData | null>(null);
  
  // Navigation & Filter states
  const [activeTab, setActiveTab] = useState<'picks' | 'leaderboard' | 'settings'>('picks');
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [adminMode, setAdminMode] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  
  // Pick modal states
  const [showPickerModal, setShowPickerModal] = useState<boolean>(false);
  const [activeModalGame, setActiveModalGame] = useState<Game | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Instructions modal states
  const [showInstructionsModal, setShowInstructionsModal] = useState<boolean>(false);
  
  // Settings Form States
  const [editedParticipants, setEditedParticipants] = useState<string>('');
  const [editedSeason, setEditedSeason] = useState<number>(2025);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const useSupabase = !!(supabaseUrl && supabaseKey);

  const loadStaticData = () => {
    fetch(`${import.meta.env.BASE_URL}data.json`)
      .then(res => res.json())
      .then((jsonData: GameData) => {
        setData(jsonData);
        setEditedSeason(jsonData.settings.season || 2025);
        setEditedParticipants(jsonData.settings.participants?.join(', ') || '');
        
        // Auto-select week that has incomplete games, or fall back to week 1
        const eligible = jsonData.eligible_games || [];
        const incomplete = eligible.find(g => g.game_status === 'PRE');
        if (incomplete) {
          setSelectedWeek(incomplete.week);
        } else if (eligible.length > 0) {
          const maxWeek = Math.max(...eligible.map(g => g.week));
          setSelectedWeek(maxWeek);
        }
      })
      .catch(err => {
        console.error("Failed to load /data.json", err);
      });
  };

  const fetchFromSupabase = async () => {
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    };
    try {
      const settingsRes = await fetch(`${supabaseUrl}/rest/v1/fast6_settings?select=*&id=eq.1`, { headers });
      const settingsData = await settingsRes.json();
      const settings = settingsData[0] || { season: 2025, participants: [], locked: false };

      const picksRes = await fetch(`${supabaseUrl}/rest/v1/fast6_picks?select=*`, { headers });
      const picksList = await picksRes.json();
      const picks: Record<string, Pick> = {};
      picksList.forEach((p: any) => {
        picks[p.game_id] = {
          player_id: p.player_id,
          player_name: p.player_name,
          points: p.points,
          graded: p.graded
        };
      });

      const resultsRes = await fetch(`${supabaseUrl}/rest/v1/fast6_results?select=*`, { headers });
      const resultsList = await resultsRes.json();
      const results: Record<string, Result> = {};
      resultsList.forEach((r: any) => {
        results[r.game_id] = {
          first_td_id: r.first_td_id,
          first_td_name: r.first_td_name,
          anytime_td_ids: r.anytime_td_ids || []
        };
      });

      const staticRes = await fetch(`${import.meta.env.BASE_URL}data.json`);
      const staticData = await staticRes.json();
      const eligible_games = staticData.eligible_games || [];

      const participants = settings.participants || [];
      const game_assignments = eligible_games.map((game: any, i: number) => {
        const picker = participants[i % participants.length] || 'TBD';
        return { ...game, picker };
      });

      const standings: Record<string, Standings> = {};
      participants.forEach((name: string) => {
        standings[name] = { points: 0, correct_first: 0, correct_anytime: 0, picks_made: 0 };
      });

      Object.entries(picks).forEach(([game_id, p]) => {
        const game = game_assignments.find((g: any) => g.game_id === game_id);
        if (!game) return;
        const picker = game.picker;
        if (!standings[picker]) {
          standings[picker] = { points: 0, correct_first: 0, correct_anytime: 0, picks_made: 0 };
        }
        standings[picker].picks_made += 1;

        const res = results[game_id];
        if (res) {
          if (p.player_id === res.first_td_id) {
            p.points = 3;
            standings[picker].points += 3;
            standings[picker].correct_first += 1;
          } else if (res.anytime_td_ids.includes(p.player_id)) {
            p.points = 1;
            standings[picker].points += 1;
            standings[picker].correct_anytime += 1;
          } else {
            p.points = 0;
          }
        }
      });

      const combinedData: GameData = {
        settings: {
          season: settings.season,
          participants: settings.participants,
          locked: settings.locked
        },
        picks,
        results,
        standings,
        eligible_games: game_assignments
      };

      setData(combinedData);
      setEditedSeason(settings.season);
      setEditedParticipants(settings.participants.join(', '));

      const incomplete = game_assignments.find((g: any) => g.game_status === 'PRE');
      if (incomplete) {
        setSelectedWeek(incomplete.week);
      } else if (game_assignments.length > 0) {
        const maxWeek = Math.max(...game_assignments.map((g: any) => g.week));
        setSelectedWeek(maxWeek);
      }
    } catch (err) {
      console.error("Failed to load from Supabase, using static local backup", err);
      loadStaticData();
    }
  };

  useEffect(() => {
    if (useSupabase) {
      fetchFromSupabase();
    } else {
      loadStaticData();
    }

    fetch(`${import.meta.env.BASE_URL}players.json`)
      .then(res => res.json())
      .then((jsonPlayers: PlayersData) => {
        setPlayersData(jsonPlayers);
      })
      .catch(err => {
        console.error("Failed to load /players.json. Run grade.py once to compile players list.", err);
      });
  }, []);

  // Filter eligible games for the selected week
  const filteredGames = useMemo(() => {
    if (!data?.eligible_games) return [];
    return data.eligible_games.filter(g => g.week === selectedWeek);
  }, [data, selectedWeek]);

  // List of all unique weeks
  const availableWeeks = useMemo(() => {
    if (!data?.eligible_games) return [];
    const weeks = data.eligible_games.map(g => g.week);
    return Array.from(new Set(weeks)).sort((a, b) => a - b);
  }, [data]);

  // Standing rankings sorted by points
  const sortedStandings = useMemo(() => {
    if (!data?.standings) return [];
    return Object.entries(data.standings)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.correct_first !== a.correct_first) return b.correct_first - a.correct_first;
        return b.correct_anytime - a.correct_anytime;
      });
  }, [data]);

  // Filter players list for the active modal matchup
  const filteredPlayers = useMemo(() => {
    if (!activeModalGame || !playersData?.players) return [];
    const query = searchQuery.trim().toLowerCase();
    
    // Filter to only include players playing in this game
    const teamPlayers = playersData.players.filter(p => 
      p.team === activeModalGame.away_team || p.team === activeModalGame.home_team
    );
    
    if (!query) return teamPlayers;
    
    return teamPlayers.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.pos.toLowerCase().includes(query) || 
      p.team.toLowerCase().includes(query)
    );
  }, [activeModalGame, playersData, searchQuery]);

  // Team Badge Component helper
  const renderTeamBadge = (teamCode: string) => {
    const style = TEAM_COLORS[teamCode] || { bg: '#1e293b', text: '#f8fafc' };
    return (
      <div 
        className="team-badge" 
        style={{ backgroundColor: style.bg, color: style.text }}
      >
        {teamCode}
      </div>
    );
  };

  // Open modal to select player pick
  const handleOpenPicker = (game: Game) => {
    if (!adminMode) return;
    setActiveModalGame(game);
    setSearchQuery('');
    setShowPickerModal(true);
  };

  // Select player in modal
  const handleSelectPlayer = (player: Player) => {
    if (!data || !activeModalGame) return;
    
    const updatedPicks = { ...data.picks };
    updatedPicks[activeModalGame.game_id] = {
      player_id: player.id,
      player_name: player.name,
      points: 0,
      graded: false
    };

    setData({
      ...data,
      picks: updatedPicks
    });
    
    setHasUnsavedChanges(true);
    setShowPickerModal(false);
    setActiveModalGame(null);
  };

  // Save edits and download updated config file
  const handleSaveAndDownload = () => {
    if (!data) return;

    if (useSupabase) {
      // Save settings to Supabase
      const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      };

      const settingsBody = {
        id: 1,
        season: data.settings.season,
        participants: data.settings.participants,
        locked: data.settings.locked
      };

      // Prepare picks for upsert
      const picksList = Object.entries(data.picks).map(([game_id, p]) => {
        const game = data.eligible_games?.find(g => g.game_id === game_id);
        const picker = game ? game.picker : 'Unknown';
        return {
          game_id,
          player_id: p.player_id,
          player_name: p.player_name,
          points: p.points,
          graded: p.graded,
          picker
        };
      });

      Promise.all([
        fetch(`${supabaseUrl}/rest/v1/fast6_settings`, {
          method: 'POST',
          headers,
          body: JSON.stringify(settingsBody)
        }),
        picksList.length > 0 ? fetch(`${supabaseUrl}/rest/v1/fast6_picks`, {
          method: 'POST',
          headers,
          body: JSON.stringify(picksList)
        }) : Promise.resolve(null)
      ])
        .then(([settingsRes, picksRes]) => {
          if (!settingsRes.ok || (picksRes && !picksRes.ok)) {
            throw new Error("Supabase write failed");
          }
          setHasUnsavedChanges(false);
          alert("Success: Saved all changes directly to Supabase!");
        })
        .catch(err => {
          console.error("Supabase save failed:", err);
          alert("Error: Supabase write failed. Triggering backup file download.");
          triggerDownloadFallback();
        });
      return;
    }

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocal) {
      fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 2)
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.success) {
            setHasUnsavedChanges(false);
            alert("Success: Saved directly to public/data.json on your local disk!");
          } else {
            throw new Error(resData.error || "Failed to save file.");
          }
        })
        .catch(err => {
          console.error("Local save failed, falling back to download flow:", err);
          triggerDownloadFallback();
        });
    } else {
      triggerDownloadFallback();
    }
  };

  const triggerDownloadFallback = () => {
    if (!data) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(data, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', 'data.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setHasUnsavedChanges(false);
    setShowInstructionsModal(true);
  };

  // Settings Actions: Lock Season / Randomize
  const handleRandomizeAndLock = () => {
    if (!data) return;
    if (!window.confirm("This will shuffle participants, lock the order, and reset all current picks/scores. Are you sure?")) {
      return;
    }

    const players = editedParticipants
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (players.length < 2) {
      alert("Please enter at least 2 participants.");
      return;
    }

    // Fisher-Yates shuffle
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const emptyStandings: Record<string, Standings> = {};
    shuffled.forEach(name => {
      emptyStandings[name] = { points: 0, correct_first: 0, correct_anytime: 0, picks_made: 0 };
    });

    const updatedData: GameData = {
      ...data,
      settings: {
        season: editedSeason,
        participants: shuffled,
        locked: true
      },
      picks: {},
      results: {},
      standings: emptyStandings
    };

    setData(updatedData);
    setEditedParticipants(shuffled.join(', '));
    setHasUnsavedChanges(true);
    alert("Season Locked! Please save/download data.json and run the grader script to map rotation schedules.");
  };

  // Settings Actions: Unlock settings
  const handleUnlockSeason = () => {
    if (!data) return;
    if (!window.confirm("Unlocking the season order lets you edit participants but could break active rotation mappings. Proceed?")) {
      return;
    }

    setData({
      ...data,
      settings: {
        ...data.settings,
        locked: false
      }
    });
    setHasUnsavedChanges(true);
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="logo-container">
          <Trophy size={40} className="logo-icon" />
          <div>
            <h1 className="app-title">Fast6</h1>
            <p className="app-subtitle">Prime Time NFL First TD Tracker</p>
          </div>
        </div>

        <div className="header-actions">
          {data?.settings?.locked && (
            <button 
              className={`btn ${adminMode ? 'btn-admin-active' : 'btn-secondary'}`}
              onClick={() => {
                setAdminMode(!adminMode);
                if (adminMode && hasUnsavedChanges) {
                  alert("Warning: You have unsaved picks! Click the 'Save Picks & Download' banner at the bottom before leaving.");
                }
              }}
            >
              <SettingsIcon size={16} />
              {adminMode ? 'Exit Admin Mode' : 'Admin Portal'}
            </button>
          )}
          {hasUnsavedChanges && (
            <button className="btn btn-primary" onClick={handleSaveAndDownload}>
              <Download size={16} />
              {useSupabase ? 'Save to Supabase' : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'Save Changes' : 'Save & Download')}
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs-container">
        <button 
          className={`tab-btn ${activeTab === 'picks' ? 'active' : ''}`}
          onClick={() => setActiveTab('picks')}
        >
          <Calendar size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Picks & Schedule
        </button>
        <button 
          className={`tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          <Trophy size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Standings
        </button>
        <button 
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Users size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Season settings
        </button>
      </nav>

      {/* Main Tab Content */}
      <div className="tab-content">
        
        {/* TAB 1: PICKS & SCHEDULE */}
        {activeTab === 'picks' && (
          <div className="dashboard-grid">
            
            {/* Quick Leaderboard Sidebar */}
            <div className="glass-card">
              <h2 className="glass-card-title">
                <Crown size={20} color="var(--accent-gold)" />
                Leaderboard
              </h2>
              <div className="leaderboard-list">
                {sortedStandings.slice(0, 5).map((player, idx) => (
                  <div 
                    key={player.name} 
                    className={`leader-item rank-${idx + 1}`}
                  >
                    <div className="leader-left">
                      <span className="rank-badge">{idx + 1}</span>
                      <span className="leader-name">{player.name}</span>
                    </div>
                    <div className="leader-stats">
                      <span className="leader-points">{player.points} pts</span>
                      <span className="leader-breakdown">
                        {player.correct_first} F | {player.correct_anytime} A
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {sortedStandings.length > 5 && (
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', marginTop: '16px' }}
                  onClick={() => setActiveTab('leaderboard')}
                >
                  View Full Standings
                </button>
              )}
            </div>

            {/* Slate View */}
            <div className="glass-card" style={{ flex: 1 }}>
              <div className="slate-header-container">
                <h2 className="glass-card-title" style={{ margin: 0 }}>
                  <Calendar size={20} color="var(--accent-cyan)" />
                  NFL Week {selectedWeek} Slate
                </h2>
                
                {/* Weeks Dropdown */}
                {availableWeeks.length > 0 && (
                  <select 
                    className="week-select"
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                  >
                    {availableWeeks.map(w => (
                      <option key={w} value={w}>Week {w}</option>
                    ))}
                  </select>
                )}
              </div>
              
              {/* Admin Mode Banner */}
              {adminMode && (
                <div style={{
                  background: 'rgba(6, 182, 212, 0.08)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '13px',
                  color: 'var(--accent-cyan)',
                  fontWeight: '600',
                  marginBottom: '20px'
                }}>
                  <Sparkles size={16} />
                  <span>Admin Mode Active: Click the pick box on any game below to set/override the player pick.</span>
                </div>
              )}

              {filteredGames.length === 0 ? (
                <div className="empty-state">
                  <Calendar size={48} className="empty-icon" />
                  <p>No eligible prime-time games scheduled for Week {selectedWeek}.</p>
                </div>
              ) : (
                <div className="games-grid">
                  {filteredGames.map(game => {
                    const pick = data?.picks[game.game_id];
                    const result = data?.results[game.game_id];
                    const isFinished = game.game_status === 'POST';
                    
                    let cardClass = "glass-card game-card";
                    if (isFinished) cardClass += " finished";
                    if (adminMode && game.game_status === 'PRE') cardClass += " active-picker";
                    
                    return (
                      <div key={game.game_id} className={cardClass}>
                        {/* Game Header */}
                        <div className="game-header">
                          <span className="game-week">{game.weekday}</span>
                          <span className="game-time">{game.gameday} at {game.gametime} EST</span>
                          
                          {/* Live/Final/Scheduled Indicator */}
                          <div className="game-status-badge">
                            {isFinished ? (
                              <span className="status-final">Final</span>
                            ) : (
                              <span className="status-pre">Scheduled</span>
                            )}
                          </div>
                        </div>

                        {/* Matchup Teams */}
                        <div className="game-matchup">
                          <div className="team-info away">
                            {renderTeamBadge(game.away_team)}
                            <span className="team-name">{game.away_team}</span>
                          </div>
                          
                          <span className="matchup-vs">at</span>
                          
                          <div className="team-info home">
                            {renderTeamBadge(game.home_team)}
                            <span className="team-name">{game.home_team}</span>
                          </div>
                        </div>

                        {/* Pick Info */}
                        <div 
                          className={`game-pick-box ${adminMode ? 'picker-btn-click' : ''}`}
                          onClick={() => handleOpenPicker(game)}
                        >
                          <div className="game-pick-header">
                            <span className="picker-label">Picker in Rotation:</span>
                            <span className="picker-name">{game.picker}</span>
                          </div>
                          
                          {pick ? (
                            <div className="pick-value">
                              {adminMode ? (
                                <Edit3 size={15} color="var(--accent-rose)" style={{ marginRight: '6px', flexShrink: 0 }} />
                              ) : (
                                <Sparkles size={16} color="var(--accent-cyan)" />
                              )}
                              {pick.player_name}
                            </div>
                          ) : (
                            <div className="pick-empty">
                              {adminMode ? 'Click to select pick...' : 'No pick submitted'}
                            </div>
                          )}

                          {/* Points Display for Finished Games */}
                          {isFinished && pick && (
                            <div className={`score-badge score-${pick.points}`}>
                              {pick.points > 0 ? `+${pick.points}` : '0'} pts
                            </div>
                          )}
                        </div>

                        {/* Results / Scoring Info */}
                        {isFinished && result && (
                          <div className="game-result-box">
                            <div className="result-row">
                              <span>1st TD Scorer:</span>
                              <span className="result-val">{result.first_td_name || 'None'}</span>
                            </div>
                            <div className="result-row">
                              <span>Anytime Scorers:</span>
                              <span className="result-val" style={{ textAlign: 'right' }}>
                                {result.anytime_td_ids.length > 0 ? `${result.anytime_td_ids.length} players` : 'None'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: STANDINGS */}
        {activeTab === 'leaderboard' && (
          <div className="glass-card">
            <h2 className="glass-card-title">
              <Trophy size={22} color="var(--accent-gold)" />
              Seasonal Leaderboard standings
            </h2>
            
            {sortedStandings.length === 0 ? (
              <div className="empty-state">
                <Users size={48} className="empty-icon" />
                <p>No standings data available. Initialize participants in settings to begin!</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '16px' }}>Rank</th>
                      <th style={{ padding: '16px' }}>Participant</th>
                      <th style={{ padding: '16px', textAlign: 'center' }}>Total Points</th>
                      <th style={{ padding: '16px', textAlign: 'center' }}>Correct 1st TD (3 pts)</th>
                      <th style={{ padding: '16px', textAlign: 'center' }}>Correct Anytime (1 pt)</th>
                      <th style={{ padding: '16px', textAlign: 'center' }}>Total Picks Made</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStandings.map((player, idx) => (
                      <tr 
                        key={player.name} 
                        style={{ 
                          borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                          backgroundColor: idx === 0 ? 'rgba(245, 158, 11, 0.02)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '16px', fontWeight: 'bold' }}>
                          {idx === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Crown size={16} color="var(--accent-gold)" />
                              <span>1</span>
                            </div>
                          ) : idx + 1}
                        </td>
                        <td style={{ padding: '16px', fontWeight: '600' }}>{player.name}</td>
                        <td style={{ 
                          padding: '16px', 
                          textAlign: 'center', 
                          fontWeight: '800', 
                          fontSize: '18px',
                          color: idx === 0 ? 'var(--accent-gold)' : 'var(--text-primary)'
                        }}>
                          {player.points}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center', color: 'var(--accent-emerald)', fontWeight: '600' }}>
                          {player.correct_first}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center', color: 'var(--accent-cyan)', fontWeight: '600' }}>
                          {player.correct_anytime}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          {player.picks_made}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SEASON SETTINGS */}
        {activeTab === 'settings' && (
          <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2 className="glass-card-title">
              <SettingsIcon size={22} color="var(--accent-violet)" />
              Game Setup & Settings
            </h2>
            
            <div className="settings-section">
              <div className="form-group">
                <label className="form-label">Active Season Year</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={editedSeason}
                  disabled={data?.settings?.locked}
                  onChange={(e) => setEditedSeason(parseInt(e.target.value) || 2025)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Participants (Comma Separated)</label>
                <textarea 
                  className="form-input" 
                  rows={4}
                  value={editedParticipants}
                  disabled={data?.settings?.locked}
                  placeholder="Charlie, Alice, Frank, Grace, David, Eve, Bob"
                  onChange={(e) => setEditedParticipants(e.target.value)}
                />
              </div>

              {data?.settings?.locked ? (
                <div className="participants-lock-box">
                  <div className="lock-box-title">
                    <Lock size={16} />
                    Rotation Order is LOCKED
                  </div>
                  <p className="lock-box-desc">
                    The participant list is locked and randomized for the season. Shuffling matches game order index.
                  </p>
                  <button className="btn btn-secondary" onClick={handleUnlockSeason}>
                    <Unlock size={14} />
                    Unlock Settings
                  </button>
                </div>
              ) : (
                <div className="participants-lock-box" style={{ backgroundColor: 'rgba(6, 182, 212, 0.03)', borderColor: 'rgba(6, 182, 212, 0.1)' }}>
                  <div className="lock-box-title" style={{ color: 'var(--accent-cyan)' }}>
                    <Unlock size={16} />
                    Rotation Settings Open
                  </div>
                  <p className="lock-box-desc">
                    Pressing Lock will shuffle participants and generate the draft rotation sequence for the entire season.
                  </p>
                  <button className="btn btn-primary" onClick={handleRandomizeAndLock}>
                    <Shuffle size={14} />
                    Randomize & Lock Order
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Admin Mode Save Banner */}
      {adminMode && hasUnsavedChanges && (
        <div className="admin-save-banner">
          <div className="admin-banner-text">
            <AlertTriangle size={18} color="var(--accent-rose)" style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
            {useSupabase 
              ? 'Picks edited! Save changes directly to Supabase.'
              : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                  ? 'Picks edited! Save changes directly to your local database.' 
                  : 'Picks edited! Download the config database to save.')}
          </div>
          <button className="btn btn-primary" onClick={handleSaveAndDownload}>
            <Download size={14} />
            {useSupabase 
              ? 'Save to Supabase'
              : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                  ? 'Save Changes' 
                  : 'Save & Download data.json')}
          </button>
        </div>
      )}

      {/* Searchable Player Picker Modal */}
      {showPickerModal && activeModalGame && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Select Pick for {activeModalGame.picker}</h3>
              <button className="modal-close" onClick={() => setShowPickerModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Matchup: {activeModalGame.away_team} at {activeModalGame.home_team} (Week {activeModalGame.week})
              </p>
              
              <div style={{ position: 'relative' }}>
                <Search 
                  size={18} 
                  color="var(--text-muted)" 
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <input 
                  type="text" 
                  className="search-input"
                  style={{ paddingLeft: '38px' }}
                  placeholder="Search player name, position, or team..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="players-list">
                {filteredPlayers.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '16px' }}>
                    No matching skill players found for these teams.
                  </p>
                ) : (
                  filteredPlayers.map(p => (
                    <div 
                      key={p.id} 
                      className="player-item-row"
                      onClick={() => handleSelectPlayer(p)}
                    >
                      <div className="player-item-details">
                        <span className="player-name-val">{p.name}</span>
                        <span className="player-pos-team">{p.pos} • {p.team}</span>
                      </div>
                      <span className="select-indicator">Select</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Commit Instructions Modal */}
      {showInstructionsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={22} color="var(--accent-emerald)" />
                <h3 style={{ margin: 0 }}>data.json Downloaded!</h3>
              </div>
              <button className="modal-close" onClick={() => setShowInstructionsModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body" style={{ gap: '20px' }}>
              <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
                You have downloaded the updated <code>data.json</code> database. To complete the pick entry, you must update the file in your repository:
              </p>
              
              <div className="instructions-box">
                <ol>
                  <li>Move the downloaded <code>data.json</code> file into your project's <code>public/</code> folder, replacing the existing one.</li>
                  <li>Commit and push the changes to your GitHub repository:
                    <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '6px', overflowX: 'auto', marginTop: '8px', fontSize: '12px' }}>
                      git add public/data.json<br />
                      git commit -m "Update weekly picks"<br />
                      git push origin main
                    </pre>
                  </li>
                  <li>Once pushed, your GitHub Pages site will show the new picks! If games have finished, the automated GitHub Action will run soon to calculate results, grade picks, and update standings.</li>
                </ol>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowInstructionsModal(false)}
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
