import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Crown, Home, LogOut, Plus, RotateCcw, Swords, Trophy, UserRound, X } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '/api';
const COLORS = ['#f2d35e', '#73c2a6', '#ef8f7d', '#8aa7e8', '#c295d8', '#91c96f', '#e9a94f', '#7fc7d9'];

function request(path, options = {}) {
  const token = localStorage.getItem('queensToken');
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Coś poszło nie tak.');
    return data;
  });
}

function formatTime(seconds) {
  if (seconds == null) return '-';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function QueensGame() {
  const [token, setToken] = useState(localStorage.getItem('queensToken'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('queensUser') || 'null'));
  const [puzzles, setPuzzles] = useState([]);
  const [puzzle, setPuzzle] = useState(null);
  const [queens, setQueens] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [message, setMessage] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    request('/leaderboard').then((data) => setLeaderboard(data.leaderboard)).catch(() => {});
    if (!token) return;
    Promise.all([request('/puzzles'), request('/stats')])
      .then(([puzzleData, statsData]) => {
        setPuzzles(puzzleData.puzzles);
        setPuzzle(puzzleData.puzzles[0] || null);
        setStats(statsData.stats);
      })
      .catch((error) => setMessage(error.message));
  }, [token]);

  const queenSet = useMemo(() => new Set(queens.map(([row, col]) => `${row}-${col}`)), [queens]);
  const blockedSet = useMemo(() => new Set(blocked.map(([row, col]) => `${row}-${col}`)), [blocked]);
  const autoBlockedSet = useMemo(() => {
    if (!puzzle) return new Set();
    const result = new Set();
    queens.forEach(([queenRow, queenCol]) => {
      const queenRegion = puzzle.regions[queenRow][queenCol];
      for (let row = 0; row < puzzle.size; row += 1) {
        for (let col = 0; col < puzzle.size; col += 1) {
          const sameRow = row === queenRow;
          const sameCol = col === queenCol;
          const sameRegion = puzzle.regions[row][col] === queenRegion;
          const touching = Math.abs(row - queenRow) <= 1 && Math.abs(col - queenCol) <= 1;
          if ((sameRow || sameCol || sameRegion || touching) && (row !== queenRow || col !== queenCol)) {
            result.add(`${row}-${col}`);
          }
        }
      }
    });
    return result;
  }, [puzzle, queens]);

  useEffect(() => {
    if (puzzle && queens.length === puzzle.size) {
      submit();
    }
  }, [queens, puzzle]);

  function acceptAuth(data) {
    localStorage.setItem('queensToken', data.token);
    localStorage.setItem('queensUser', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setMessage('');
  }

  function logout() {
    localStorage.removeItem('queensToken');
    localStorage.removeItem('queensUser');
    setToken(null);
    setUser(null);
    setPuzzle(null);
    setPuzzles([]);
    setQueens([]);
    setBlocked([]);
  }

  function choosePuzzle(nextPuzzle) {
    setPuzzle(nextPuzzle);
    setQueens([]);
    setBlocked([]);
    setMistakes(0);
    setStartedAt(Date.now());
    setMessage('');
  }

  function toggleCell(row, col) {
    const key = `${row}-${col}`;
    if (queenSet.has(key)) {
      setQueens((current) => current.filter(([qRow, qCol]) => qRow !== row || qCol !== col));
      return;
    }
    if (autoBlockedSet.has(key) && !blockedSet.has(key)) {
      setMessage('To pole jest wykluczone przez ustawioną królową.');
      return;
    }
    if (blockedSet.has(key)) {
      setBlocked((current) => current.filter(([bRow, bCol]) => bRow !== row || bCol !== col));
      setQueens((current) => [...current.filter(([qRow]) => qRow !== row), [row, col]]);
      return;
    }
    setBlocked((current) => [...current, [row, col]]);
  }

  function resetBoard() {
    setQueens([]);
    setBlocked([]);
    setMistakes(0);
    setStartedAt(Date.now());
    setMessage('');
  }

  async function generatePuzzle() {
    try {
      const data = await request('/puzzles/generate', { method: 'POST' });
      setPuzzles((current) => [data.puzzle, ...current]);
      choosePuzzle(data.puzzle);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function submit() {
    if (!puzzle) return;
    try {
      const data = await request('/attempts', {
        method: 'POST',
        body: JSON.stringify({ puzzle_id: puzzle.id, queens, seconds: elapsed, mistakes }),
      });
      setMessage(data.message);
      const [leaderboardData, statsData] = await Promise.all([request('/leaderboard'), request('/stats')]);
      setLeaderboard(leaderboardData.leaderboard);
      setStats(statsData.stats);
    } catch (error) {
      setMistakes((value) => value + 1);
      setMessage(error.message);
    }
  }

  if (!token || !user) return <AuthScreen onAuth={acceptAuth} />;

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="kicker">Malinka</p>
          <h1>Queens</h1>
        </div>
        <div className="userbar">
          <a className="back-link" href="/"><Home size={17} /> Gry</a>
          <span><UserRound size={18} /> {user.username}</span>
          <button className="icon-button" onClick={logout} title="Wyloguj"><LogOut size={19} /></button>
        </div>
      </section>

      <section className="workspace">
        <aside className="side-panel">
          <div className="stat-grid">
            <Metric label="Czas" value={formatTime(elapsed)} />
            <Metric label="Błędy" value={mistakes} />
            <Metric label="Ukończone" value={stats?.completed || 0} />
            <Metric label="Rekord" value={formatTime(stats?.best_seconds)} />
          </div>

          <div className="panel-block">
            <div className="panel-title">
              <span>Plansze</span>
              <button className="icon-button" onClick={generatePuzzle} title="Nowa plansza"><Plus size={18} /></button>
            </div>
            <div className="puzzle-list">
              {puzzles.map((item) => (
                <button
                  key={item.id}
                  className={item.id === puzzle?.id ? 'selected' : ''}
                  onClick={() => choosePuzzle(item)}
                >
                  #{item.id}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-block">
            <div className="panel-title"><span>Ranking</span><Trophy size={18} /></div>
            <ol className="leaderboard">
              {leaderboard.map((row) => (
                <li key={row.username}>
                  <span>{row.username}</span>
                  <strong>{row.completed} / {formatTime(row.best_seconds)}</strong>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <section className="game-area">
          {puzzle && (
            <div className="board" style={{ '--size': puzzle.size }}>
              {puzzle.regions.flatMap((line, row) =>
                line.map((region, col) => {
                  const hasQueen = queenSet.has(`${row}-${col}`);
                  const isBlocked = blockedSet.has(`${row}-${col}`) || autoBlockedSet.has(`${row}-${col}`);
                  return (
                    <button
                      key={`${row}-${col}`}
                      className={hasQueen ? 'cell queen' : isBlocked ? 'cell blocked' : 'cell'}
                      style={{ backgroundColor: COLORS[region % COLORS.length] }}
                      onClick={() => toggleCell(row, col)}
                      aria-label={`Wiersz ${row + 1}, kolumna ${col + 1}`}
                    >
                      {hasQueen && <Crown size={28} strokeWidth={2.4} />}
                      {isBlocked && <X size={24} strokeWidth={2.8} />}
                    </button>
                  );
                })
              )}
            </div>
          )}

          <div className="actions">
            <button onClick={resetBoard}><RotateCcw size={18} /> Reset</button>
            <button className="primary" onClick={submit}><Crown size={18} /> Sprawdź</button>
          </div>
          {message && <p className="message">{message}</p>}
        </section>
      </section>
    </main>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    try {
      const data = await request(mode === 'login' ? '/login' : '/register', {
        method: 'POST',
        body: JSON.stringify({ username, pin }),
      });
      onAuth(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-panel" onSubmit={submit}>
        <a className="back-link auth-back-link" href="/"><Home size={17} /> Wszystkie gry</a>
        <p className="kicker">Malinka</p>
        <h1>Queens</h1>
        <div className="segmented">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Nowe konto</button>
        </div>
        <label>
          Nazwa
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          PIN
          <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="current-password" />
        </label>
        <button className="primary" type="submit">{mode === 'login' ? 'Wejdź do gry' : 'Utwórz gracza'}</button>
        {message && <p className="message">{message}</p>}
      </form>
    </main>
  );
}

function GamePicker() {
  return (
    <main className="game-picker">
      <div className="game-picker-inner">
        <header className="picker-hero">
          <p className="kicker">Satanisz.pl</p>
          <h1>Wybierz grę</h1>
          <p>Trochę główkowania albo szybka walka — wybór należy do Ciebie.</p>
        </header>

        <section className="game-grid" aria-label="Dostępne gry">
          <a className="game-card queens-card" href="/queens/">
            <span className="card-icon"><Crown size={40} strokeWidth={1.8} /></span>
            <span className="card-copy">
              <small>Gra logiczna</small>
              <strong>Queens</strong>
              <span>Ustaw królowe, omijaj pola i pobij swój rekord.</span>
            </span>
            <span className="card-action">Graj <ArrowRight size={20} /></span>
          </a>

          <a className="game-card aikido-card" href="/aikido/">
            <span className="card-icon"><Swords size={40} strokeWidth={1.8} /></span>
            <span className="card-copy">
              <small>Gra zręcznościowa</small>
              <strong>Aikido</strong>
              <span>Staś kontra zły Sensei — walcz także na telefonie.</span>
            </span>
            <span className="card-action">Graj <ArrowRight size={20} /></span>
          </a>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const path = window.location.pathname.replace(/\/+$/, '') || '/';
if (path === '/aikido') {
  window.location.replace('/aikido/index.html');
} else {
  createRoot(document.getElementById('root')).render(path === '/queens' ? <QueensGame /> : <GamePicker />);
}
