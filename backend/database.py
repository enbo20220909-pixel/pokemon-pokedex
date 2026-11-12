import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "pokedex.db"

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trainer_id TEXT NOT NULL,
                pokemon_id INTEGER NOT NULL,
                pokemon_name TEXT NOT NULL,
                sprite_url TEXT NOT NULL,
                types_json TEXT NOT NULL,
                moves_json TEXT NOT NULL,
                note TEXT DEFAULT ''
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS move_cache (
                pokemon_id INTEGER PRIMARY KEY,
                moves_json TEXT NOT NULL
            )
        """)

def get_trainer_team(trainer_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM teams WHERE trainer_id = ? ORDER BY id ASC",
            (trainer_id,)
        ).fetchall()
        return [
            {
                "slot_id": r["id"],
                "pokemon_id": r["pokemon_id"],
                "pokemon_name": r["pokemon_name"],
                "sprite_url": r["sprite_url"],
                "types": json.loads(r["types_json"]),
                "moves": json.loads(r["moves_json"]),
                "note": r["note"]
            }
            for r in rows
        ]

def add_pokemon_to_team(trainer_id: str, pokemon_id: int, pokemon_name: str, sprite_url: str, types: list, moves: list, note: str = ""):
    current = get_trainer_team(trainer_id)
    if len(current) >= 6:
        raise ValueError("隊伍已達 6 隻上限，請先移出成員再加入。")
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO teams (trainer_id, pokemon_id, pokemon_name, sprite_url, types_json, moves_json, note)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (trainer_id, pokemon_id, pokemon_name, sprite_url, json.dumps(types), json.dumps(moves, ensure_ascii=False), note)
        )
        return cur.lastrowid

def update_slot_moves(slot_id: int, trainer_id: str, moves: list, note: str):
    if len(moves) > 4:
        raise ValueError("每隻寶可夢最多只能配置 4 個招式。")
    with get_conn() as conn:
        conn.execute(
            "UPDATE teams SET moves_json = ?, note = ? WHERE id = ? AND trainer_id = ?",
            (json.dumps(moves, ensure_ascii=False), note, slot_id, trainer_id)
        )

def remove_pokemon_from_team(slot_id: int, trainer_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM teams WHERE id = ? AND trainer_id = ?", (slot_id, trainer_id))
