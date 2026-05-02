from __future__ import annotations

import os
import sqlite3
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("QUEENS_DATA_DIR", APP_DIR / "data"))
DB_PATH = Path(os.getenv("QUEENS_DB_PATH", DATA_DIR / "queens.sqlite3"))


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                pin_salt TEXT NOT NULL,
                pin_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS puzzles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                size INTEGER NOT NULL,
                regions_json TEXT NOT NULL,
                solution_json TEXT NOT NULL,
                seed TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                puzzle_id INTEGER NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
                seconds INTEGER NOT NULL,
                mistakes INTEGER NOT NULL DEFAULT 0,
                completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
            CREATE INDEX IF NOT EXISTS idx_attempts_puzzle ON attempts(puzzle_id);
            """
        )
