import json
import random
import httpx
import asyncio
from database import get_conn
from move_service import extract_zh_name, get_pokemon_moves

ISLANDS = {
    "meadow": {
        "id": "meadow",
        "name": "晨光牧場鎮",
        "desc": "溫暖的陽光草甸與木橋河流，草、一般與蟲屬性夥伴的樂園。",
        "types": ["grass", "normal", "bug"],
        "min_lv": 3,
        "max_lv": 15,
        "gym_leader": "牧場守護者・莉莉",
        "gym_badge": "🌱 嫩葉徽章",
        "require_fly": False
    },
    "bay": {
        "id": "bay",
        "name": "碧藍珊瑚灣",
        "desc": "海風輕拂的淺水白沙灘，水、冰與妖精屬性寶可夢在此嬉戲。",
        "types": ["water", "ice", "fairy"],
        "min_lv": 15,
        "max_lv": 30,
        "gym_leader": "潮汐守望者・海斗",
        "gym_badge": "💧 珊瑚徽章",
        "require_fly": True
    },
    "volcano": {
        "id": "volcano",
        "name": "赤陶溫泉谷",
        "desc": "冒著暖呼呼白煙的露天溫泉與紅土丘陵，火、地面與岩石系棲息地。",
        "types": ["fire", "ground", "rock"],
        "min_lv": 28,
        "max_lv": 45,
        "gym_leader": "溫泉匠人・炎司",
        "gym_badge": "🔥 暖爐徽章",
        "require_fly": True
    },
    "forest": {
        "id": "forest",
        "name": "靜謐苔原森林",
        "desc": "螢火蟲與古老石碑交織的療癒秘境，超能力、幽靈與毒屬性聚集地。",
        "types": ["psychic", "ghost", "poison"],
        "min_lv": 40,
        "max_lv": 55,
        "gym_leader": "星語占卜師・月見",
        "gym_badge": "🔮 靈光徽章",
        "require_fly": True
    },
    "sky": {
        "id": "sky",
        "name": "天空浮島聖殿",
        "desc": "漂浮於雲海之上的最終聖殿，龍、鋼、電與飛行系強者雲集。",
        "types": ["dragon", "steel", "electric", "flying"],
        "min_lv": 52,
        "max_lv": 70,
        "gym_leader": "蒼穹冠軍・風間",
        "gym_badge": "👑 天空徽章",
        "require_fly": True
    }
}

LEGENDARY_POOL = [
    144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251,
    377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
    480, 481, 482, 483, 484, 485, 486, 487, 488, 491, 492, 493,
    638, 639, 640, 641, 642, 643, 644, 645, 646,
    716, 717, 718, 785, 786, 787, 788, 791, 792, 800,
    888, 889, 890, 898, 1007, 1008, 1024
]

INFINITE_BAG = [
    {"id": "poke-ball", "category": "ball", "name": "精靈球", "desc": "基礎捕捉球 1.0x（無限供應）", "ball_mult": 1.0},
    {"id": "normal-ball", "category": "ball", "name": "普通球", "desc": "標準改良球 1.35x（無限供應）", "ball_mult": 1.35},
    {"id": "ultra-ball", "category": "ball", "name": "高級球", "desc": "高性能捕捉球 1.85x（無限供應）", "ball_mult": 1.85},
    {"id": "safari-ball", "category": "ball", "name": "狩獵球", "desc": "生態園區專用球 2.4x（無限供應）", "ball_mult": 2.4},
    {"id": "master-ball", "category": "ball", "name": "大師球", "desc": "100% 必中捕捉，無需削血（無限供應）", "ball_mult": 999.0},
    {"id": "potion", "category": "heal", "name": "全滿傷藥", "desc": "完全恢復寶可夢體力與精神（無限供應）", "heal_pct": 1.0},
    {"id": "max-revive", "category": "heal", "name": "活力塊", "desc": "喚醒瀕死夥伴並恢復全部體力（無限供應）", "heal_pct": 1.0},
    {"id": "berry-picnic", "category": "picnic", "name": "文柚果野餐籃", "desc": "舉辦野餐提升全隊親密度與心情值（無限供應）", "mood_boost": 25},
    {"id": "tm-dragon", "category": "tm", "name": "技能機：流星群", "desc": "教導夥伴強力龍系奧義（無限供應）", "move": {"id": 434, "name": "流星群", "type": "dragon", "power": 130, "accuracy": 90, "damage_class": "special"}},
    {"id": "tm-thunder", "category": "tm", "name": "技能機：十萬伏特", "desc": "教導夥伴高壓電擊招式（無限供應）", "move": {"id": 85, "name": "十萬伏特", "type": "electric", "power": 90, "accuracy": 100, "damage_class": "special"}},
    {"id": "tm-flare", "category": "tm", "name": "技能機：閃焰衝鋒", "desc": "教導夥伴烈焰猛衝招式（無限供應）", "move": {"id": 394, "name": "閃焰衝鋒", "type": "fire", "power": 120, "accuracy": 100, "damage_class": "physical"}}
]

BALL_MULTIPLIERS = {
    "poke-ball": 1.0,
    "normal-ball": 1.35,
    "ultra-ball": 1.85,
    "safari-ball": 2.4,
    "master-ball": 999.0
}

def attempt_capture_pokemon(trainer_id: str, pokemon: dict, ball_id: str, current_hp: int, max_hp: int):
    mult = BALL_MULTIPLIERS.get(ball_id, 1.0)
    # 大師球：無需戰鬥削血，100% 必定捕獲
    if ball_id == "master-ball" or mult >= 999.0:
        box_id = add_to_pc_box(trainer_id, pokemon)
        return {
            "caught": True,
            "catch_chance": 100,
            "box_id": box_id,
            "state": get_rpg_state(trainer_id)
        }

    # 階梯機率計算：精靈球(1.0) < 普通球(1.35) < 高級球(1.85) < 狩獵球(2.4)
    hp_ratio = max(0.01, min(1.0, current_hp / max(1, max_hp)))
    hp_factor = 1.0 + (1.0 - hp_ratio) * 1.6  # 殘血最高帶來 2.6 倍加成
    legendary_penalty = 0.55 if pokemon.get("is_legendary") else 1.0
    base_prob = 0.24 * mult * hp_factor * legendary_penalty
    final_prob = max(0.08, min(0.95, base_prob))

    if random.random() <= final_prob:
        box_id = add_to_pc_box(trainer_id, pokemon)
        return {
            "caught": True,
            "catch_chance": round(final_prob * 100, 1),
            "box_id": box_id,
            "state": get_rpg_state(trainer_id)
        }
    return {
        "caught": False,
        "catch_chance": round(final_prob * 100, 1),
        "state": None
    }

TYPE_CACHE = {}

def calc_next_level_exp(level: int) -> int:
    return level * 100

def init_rpg_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS rpg_pc_box (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trainer_id TEXT NOT NULL,
                pokemon_id INTEGER NOT NULL,
                pokemon_name TEXT NOT NULL,
                sprite_url TEXT NOT NULL,
                types_json TEXT NOT NULL,
                speed_stat INTEGER DEFAULT 60,
                is_quadruped INTEGER DEFAULT 0,
                is_legendary INTEGER DEFAULT 0,
                mood INTEGER DEFAULT 80,
                level INTEGER DEFAULT 5,
                exp INTEGER DEFAULT 0,
                moves_json TEXT NOT NULL
            )
        """)
        # 兼容舊資料庫自動補齊 level 與 exp 欄位
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(rpg_pc_box)").fetchall()]
        if "level" not in cols:
            conn.execute("ALTER TABLE rpg_pc_box ADD COLUMN level INTEGER DEFAULT 5")
        if "exp" not in cols:
            conn.execute("ALTER TABLE rpg_pc_box ADD COLUMN exp INTEGER DEFAULT 0")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS rpg_progress (
                trainer_id TEXT PRIMARY KEY,
                current_island TEXT DEFAULT 'meadow',
                mounted_box_id INTEGER DEFAULT NULL,
                badges_json TEXT DEFAULT '[]',
                picnic_count INTEGER DEFAULT 0
            )
        """)

init_rpg_db()

async def fetch_pokemon_rpg_meta(pokemon_id: int, level: int = 5):
    async with httpx.AsyncClient() as client:
        res, sp_res = await asyncio.gather(
            client.get(f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}", timeout=10.0),
            client.get(f"https://pokeapi.co/api/v2/pokemon-species/{pokemon_id}", timeout=10.0)
        )
        data = res.json()
        sp = sp_res.json() if sp_res.status_code == 200 else {}
        zh_name = extract_zh_name(sp.get("names", []), data["name"])
        types = [t["type"]["name"] for t in data["types"]]
        stats = {s["stat"]["name"]: s["base_stat"] for s in data["stats"]}
        speed = stats.get("speed", 60)
        shape_name = (sp.get("shape") or {}).get("name", "")
        is_quadruped = 1 if shape_name == "quadruped" else 0
        is_legendary = 1 if (sp.get("is_legendary") or sp.get("is_mythical") or pokemon_id in LEGENDARY_POOL) else 0
        anim = data.get("sprites", {}).get("versions", {}).get("generation-v", {}).get("black-white", {}).get("animated", {})
        sprite = (
            anim.get("front_default")
            or data["sprites"]["other"]["official-artwork"]["front_default"]
            or data["sprites"]["front_default"]
        )
        back_sprite = anim.get("back_default") or data["sprites"].get("back_default") or sprite
        moves = (await get_pokemon_moves(pokemon_id))[:4]
        return {
            "pokemon_id": pokemon_id,
            "name": zh_name,
            "sprite": sprite,
            "back_sprite": back_sprite,
            "types": types,
            "speed": speed,
            "is_quadruped": is_quadruped,
            "is_legendary": is_legendary,
            "level": level,
            "moves": moves
        }

async def ensure_starter_if_empty(trainer_id: str):
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) as c FROM rpg_pc_box WHERE trainer_id = ?", (trainer_id,)).fetchone()["c"]
        prog = conn.execute("SELECT * FROM rpg_progress WHERE trainer_id = ?", (trainer_id,)).fetchone()
        if not prog:
            conn.execute("INSERT INTO rpg_progress (trainer_id) VALUES (?)", (trainer_id,))
    if count == 0:
        for pid in [25, 58]:
            meta = await fetch_pokemon_rpg_meta(pid, level=5)
            add_to_pc_box(trainer_id, meta)

def add_to_pc_box(trainer_id: str, meta: dict):
    lv = meta.get("level", 5)
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO rpg_pc_box
               (trainer_id, pokemon_id, pokemon_name, sprite_url, types_json, speed_stat, is_quadruped, is_legendary, level, exp, moves_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
            (
                trainer_id, meta["pokemon_id"], meta["name"], meta["sprite"],
                json.dumps(meta["types"]), meta["speed"], meta["is_quadruped"],
                meta["is_legendary"], lv, json.dumps(meta["moves"], ensure_ascii=False)
            )
        )
        return cur.lastrowid

def get_rpg_state(trainer_id: str):
    with get_conn() as conn:
        prog = conn.execute("SELECT * FROM rpg_progress WHERE trainer_id = ?", (trainer_id,)).fetchone()
        rows = conn.execute("SELECT * FROM rpg_pc_box WHERE trainer_id = ? ORDER BY id ASC", (trainer_id,)).fetchall()

    box = []
    has_flyer = False
    mounted_pokemon = None

    for r in rows:
        types = json.loads(r["types_json"])
        if "flying" in types:
            has_flyer = True
        lv = r["level"] or 5
        exp = r["exp"] or 0
        next_exp = calc_next_level_exp(lv)
        item = {
            "box_id": r["id"],
            "pokemon_id": r["pokemon_id"],
            "name": r["pokemon_name"],
            "sprite": r["sprite_url"],
            "types": types,
            "speed": r["speed_stat"],
            "is_quadruped": bool(r["is_quadruped"]),
            "is_legendary": bool(r["is_legendary"]),
            "mood": r["mood"],
            "level": lv,
            "exp": exp,
            "next_exp": next_exp,
            "max_hp": 110 + lv * 14,
            "moves": json.loads(r["moves_json"])
        }
        if prog and prog["mounted_box_id"] == r["id"]:
            mounted_pokemon = item
        box.append(item)

    speed_multiplier = 1.0
    if mounted_pokemon:
        spd = mounted_pokemon["speed"]
        speed_multiplier = round(1.0 + (spd / 100.0), 2)

    return {
        "trainer_id": trainer_id,
        "current_island": ISLANDS.get(prog["current_island"] if prog else "meadow", ISLANDS["meadow"]),
        "islands": list(ISLANDS.values()),
        "badges": json.loads(prog["badges_json"]) if prog else [],
        "picnic_count": prog["picnic_count"] if prog else 0,
        "pc_box": box,
        "total_caught": len(box),
        "has_flyer": has_flyer,
        "mounted": mounted_pokemon,
        "speed_multiplier": speed_multiplier,
        "bag": INFINITE_BAG
    }

def grant_battle_exp(trainer_id: str, box_id: int, enemy_level: int, is_legendary: bool = False):
    mult = 1.8 if is_legendary else 1.0
    gained_exp = max(25, int(enemy_level * 32 * mult))
    leveled_up = False

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM rpg_pc_box WHERE id = ? AND trainer_id = ?", (box_id, trainer_id)).fetchone()
        if not row:
            raise ValueError("找不到該寶可夢")
        lv = row["level"] or 5
        exp = (row["exp"] or 0) + gained_exp
        old_lv = lv

        while exp >= calc_next_level_exp(lv) and lv < 100:
            exp -= calc_next_level_exp(lv)
            lv += 1
            leveled_up = True

        conn.execute("UPDATE rpg_pc_box SET level = ?, exp = ? WHERE id = ?", (lv, exp, box_id))

    return {
        "gained_exp": gained_exp,
        "leveled_up": leveled_up,
        "old_level": old_lv,
        "new_level": lv,
        "state": get_rpg_state(trainer_id)
    }

def set_mount(trainer_id: str, box_id: int = None):
    with get_conn() as conn:
        if box_id is not None:
            row = conn.execute("SELECT * FROM rpg_pc_box WHERE id = ? AND trainer_id = ?", (box_id, trainer_id)).fetchone()
            if not row:
                raise ValueError("找不到該寶可夢")
            if not row["is_quadruped"]:
                raise ValueError(f"「{row['pokemon_name']}」不是四足行走型寶可夢，無法騎乘！請選擇四隻腳的夥伴（如卡蒂狗、伊布、風速狗等）。")
        conn.execute("UPDATE rpg_progress SET mounted_box_id = ? WHERE trainer_id = ?", (box_id, trainer_id))
    return get_rpg_state(trainer_id)

def travel_island(trainer_id: str, target_island_id: str):
    target = ISLANDS.get(target_island_id)
    if not target:
        raise ValueError("未知的島嶼")
    state = get_rpg_state(trainer_id)
    if target["require_fly"] and not state["has_flyer"]:
        raise ValueError(f"前往「{target['name']}」需要跨越海洋！請先在草叢捕捉一隻【飛行屬性】寶可夢（例如波波、比比鳥、傲骨燕）才能使用秘傳飛行跨區。")
    with get_conn() as conn:
        conn.execute("UPDATE rpg_progress SET current_island = ? WHERE trainer_id = ?", (target_island_id, trainer_id))
    return get_rpg_state(trainer_id)

async def trigger_grass_encounter(trainer_id: str, island_id: str):
    island = ISLANDS.get(island_id, ISLANDS["meadow"])
    if random.random() < 0.14:
        chosen_id = random.choice(LEGENDARY_POOL)
        wild_lv = random.randint(max(45, island["max_lv"]), 70)
        meta = await fetch_pokemon_rpg_meta(chosen_id, level=wild_lv)
        meta["is_legendary"] = 1
        return {"encounter_type": "legendary", "pokemon": meta}

    chosen_type = random.choice(island["types"])
    if chosen_type not in TYPE_CACHE:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"https://pokeapi.co/api/v2/type/{chosen_type}", timeout=10.0)
            p_list = [
                int(p["pokemon"]["url"].rstrip("/").split("/")[-1])
                for p in res.json().get("pokemon", [])
            ]
            TYPE_CACHE[chosen_type] = [pid for pid in p_list if 1 <= pid <= 1025 and pid not in LEGENDARY_POOL]

    pool = TYPE_CACHE.get(chosen_type) or [1, 4, 7, 25, 133]
    chosen_id = random.choice(pool)
    wild_lv = random.randint(island["min_lv"], island["max_lv"])
    meta = await fetch_pokemon_rpg_meta(chosen_id, level=wild_lv)
    return {"encounter_type": "wild", "pokemon": meta}

def hold_picnic(trainer_id: str):
    with get_conn() as conn:
        conn.execute("UPDATE rpg_pc_box SET mood = MIN(100, mood + 15) WHERE trainer_id = ?", (trainer_id,))
        conn.execute("UPDATE rpg_progress SET picnic_count = picnic_count + 1 WHERE trainer_id = ?", (trainer_id,))
    return get_rpg_state(trainer_id)

def teach_tm_move(trainer_id: str, box_id: int, move_obj: dict):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM rpg_pc_box WHERE id = ? AND trainer_id = ?", (box_id, trainer_id)).fetchone()
        if not row:
            raise ValueError("找不到該寶可夢")
        moves = json.loads(row["moves_json"])
        if any(m["name"] == move_obj["name"] for m in moves):
            raise ValueError("已經學會這個招式了！")
        if len(moves) >= 4:
            moves.pop(0)
        moves.append(move_obj)
        conn.execute("UPDATE rpg_pc_box SET moves_json = ? WHERE id = ?", (json.dumps(moves, ensure_ascii=False), box_id))
    return get_rpg_state(trainer_id)

def claim_gym_badge(trainer_id: str, badge_name: str):
    with get_conn() as conn:
        prog = conn.execute("SELECT badges_json FROM rpg_progress WHERE trainer_id = ?", (trainer_id,)).fetchone()
        badges = json.loads(prog["badges_json"]) if prog else []
        if badge_name not in badges:
            badges.append(badge_name)
            conn.execute("UPDATE rpg_progress SET badges_json = ? WHERE trainer_id = ?", (json.dumps(badges, ensure_ascii=False), trainer_id))
    return get_rpg_state(trainer_id)
