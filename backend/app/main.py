from __future__ import annotations

import hashlib
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .db import get_connection, init_db
from .game import generate_puzzle, public_puzzle, puzzle_to_json, validate_solution


app = FastAPI(title="Malinka Queens")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Credentials(BaseModel):
    username: str = Field(min_length=2, max_length=24, pattern=r"^[a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]+$")
    pin: str = Field(pattern=r"^\d{4}$")


class SubmitAttempt(BaseModel):
    puzzle_id: int
    queens: list[tuple[int, int]]
    seconds: int = Field(ge=0, le=86_400)
    mistakes: int = Field(ge=0, le=999, default=0)


def hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{pin}".encode("utf-8")).hexdigest()


def current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Brak sesji.")
    token = authorization.removeprefix("Bearer ").strip()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT users.id, users.username
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Sesja wygasła albo jest niepoprawna.")
    return {"id": int(row["id"]), "username": row["username"]}


@app.on_event("startup")
def startup() -> None:
    init_db()
    ensure_seed_puzzles()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/register")
def register(credentials: Credentials) -> dict:
    salt = secrets.token_hex(12)
    pin_hash = hash_pin(credentials.pin, salt)
    try:
        with get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO users (username, pin_salt, pin_hash) VALUES (?, ?, ?)",
                (credentials.username.strip(), salt, pin_hash),
            )
            user_id = int(cursor.lastrowid)
            token = secrets.token_urlsafe(32)
            conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="Ten użytkownik już istnieje.") from exc
        raise
    return {"token": token, "user": {"id": user_id, "username": credentials.username.strip()}}


@app.post("/api/login")
def login(credentials: Credentials) -> dict:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (credentials.username.strip(),)).fetchone()
        if not row or row["pin_hash"] != hash_pin(credentials.pin, row["pin_salt"]):
            raise HTTPException(status_code=401, detail="Niepoprawny użytkownik albo PIN.")
        token = secrets.token_urlsafe(32)
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, int(row["id"])))
    return {"token": token, "user": {"id": int(row["id"]), "username": row["username"]}}


@app.get("/api/me")
def me(user: Annotated[dict, Depends(current_user)]) -> dict:
    return {"user": user}


@app.get("/api/puzzles")
def list_puzzles(user: Annotated[dict, Depends(current_user)]) -> dict:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM puzzles ORDER BY id LIMIT 20").fetchall()
    return {"puzzles": [public_puzzle(row) for row in rows]}


@app.post("/api/puzzles/generate")
def create_puzzle(user: Annotated[dict, Depends(current_user)]) -> dict:
    puzzle = generate_unique_puzzle(secrets.token_hex(8))
    regions_json, solution_json = puzzle_to_json(puzzle)
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO puzzles (size, regions_json, solution_json, seed) VALUES (?, ?, ?, ?)",
            (puzzle.size, regions_json, solution_json, puzzle.seed),
        )
        row = conn.execute("SELECT * FROM puzzles WHERE id = ?", (int(cursor.lastrowid),)).fetchone()
    return {"puzzle": public_puzzle(row)}


@app.post("/api/attempts")
def submit_attempt(payload: SubmitAttempt, user: Annotated[dict, Depends(current_user)]) -> dict:
    with get_connection() as conn:
        puzzle = conn.execute("SELECT * FROM puzzles WHERE id = ?", (payload.puzzle_id,)).fetchone()
        if not puzzle:
            raise HTTPException(status_code=404, detail="Nie znaleziono planszy.")
        ok, message = validate_solution(
            int(puzzle["size"]),
            __import__("json").loads(puzzle["regions_json"]),
            payload.queens,
        )
        if not ok:
            raise HTTPException(status_code=400, detail=message)
        conn.execute(
            "INSERT INTO attempts (user_id, puzzle_id, seconds, mistakes) VALUES (?, ?, ?, ?)",
            (user["id"], payload.puzzle_id, payload.seconds, payload.mistakes),
        )
    return {"ok": True, "message": "Ukończono planszę."}


@app.get("/api/leaderboard")
def leaderboard() -> dict:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                users.username,
                COUNT(attempts.id) AS completed,
                MIN(attempts.seconds) AS best_seconds,
                ROUND(AVG(attempts.seconds), 1) AS avg_seconds,
                SUM(attempts.mistakes) AS mistakes
            FROM users
            JOIN attempts ON attempts.user_id = users.id
            GROUP BY users.id
            ORDER BY completed DESC, best_seconds ASC, mistakes ASC
            LIMIT 20
            """
        ).fetchall()
    return {"leaderboard": [dict(row) for row in rows]}


@app.get("/api/stats")
def stats(user: Annotated[dict, Depends(current_user)]) -> dict:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                COUNT(id) AS completed,
                MIN(seconds) AS best_seconds,
                ROUND(AVG(seconds), 1) AS avg_seconds,
                SUM(mistakes) AS mistakes
            FROM attempts
            WHERE user_id = ?
            """,
            (user["id"],),
        ).fetchone()
    return {"stats": dict(row)}


def ensure_seed_puzzles() -> None:
    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) AS count FROM puzzles").fetchone()["count"]
        for index in range(int(count), 10):
            puzzle = generate_unique_puzzle(f"malinka-start-{index + 1}")
            regions_json, solution_json = puzzle_to_json(puzzle)
            conn.execute(
                "INSERT OR IGNORE INTO puzzles (size, regions_json, solution_json, seed) VALUES (?, ?, ?, ?)",
                (puzzle.size, regions_json, solution_json, puzzle.seed),
            )


def generate_unique_puzzle(seed: str):
    for variant in range(1, 25):
        try:
            return generate_puzzle(f"{seed}-v{variant}")
        except RuntimeError:
            continue
    raise HTTPException(status_code=503, detail="Nie udało się teraz wygenerować planszy. Spróbuj ponownie.")
