import json
import asyncio
import httpx
from database import get_conn

def extract_zh_name(names_list: list, fallback: str) -> str:
    if not names_list:
        return fallback
    zh_hant = next((n["name"] for n in names_list if n["language"]["name"].lower() in ("zh-hant", "zh-tw")), None)
    if zh_hant:
        return zh_hant
    zh_hans = next((n["name"] for n in names_list if n["language"]["name"].lower() in ("zh-hans", "zh-cn", "zh")), None)
    return zh_hans or fallback

async def get_pokemon_zh_name(pokemon_id: int, fallback: str = "") -> str:
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"https://pokeapi.co/api/v2/pokemon-species/{pokemon_id}", timeout=8.0)
            if res.status_code == 200:
                return extract_zh_name(res.json().get("names", []), fallback)
        except Exception:
            pass
    return fallback

async def fetch_move_detail(client: httpx.AsyncClient, url: str):
    try:
        res = await client.get(url, timeout=8.0)
        if res.status_code != 200:
            return None
        data = res.json()
        if not data.get("power"):
            return None
        zh_name = extract_zh_name(data.get("names", []), data["name"])
        return {
            "id": data["id"],
            "name": zh_name,
            "name_en": data["name"],
            "type": data["type"]["name"],
            "power": data["power"],
            "accuracy": data.get("accuracy") or 100,
            "damage_class": data["damage_class"]["name"]
        }
    except Exception:
        return None

async def get_pokemon_moves(pokemon_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT moves_json FROM move_cache WHERE pokemon_id = ?", (pokemon_id,)).fetchone()
        if row:
            cached = json.loads(row["moves_json"])
            if cached and any(not m["name"].isascii() for m in cached):
                return cached

    async with httpx.AsyncClient() as client:
        res = await client.get(f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}", timeout=10.0)
        res.raise_for_status()
        raw_moves = res.json().get("moves", [])[:60]
        tasks = [fetch_move_detail(client, m["move"]["url"]) for m in raw_moves]
        results = await asyncio.gather(*tasks)

    valid_moves = [m for m in results if m is not None]
    valid_moves.sort(key=lambda x: x["power"], reverse=True)

    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO move_cache (pokemon_id, moves_json) VALUES (?, ?)",
            (pokemon_id, json.dumps(valid_moves, ensure_ascii=False))
        )
    return valid_moves
