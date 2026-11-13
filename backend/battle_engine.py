import random
import uuid
import httpx
import asyncio
from move_service import extract_zh_name, get_pokemon_moves

TYPE_CHART = {
    "normal": {"rock": 0.5, "ghost": 0.0, "steel": 0.5},
    "fire": {"fire": 0.5, "water": 0.5, "grass": 2.0, "ice": 2.0, "bug": 2.0, "rock": 0.5, "dragon": 0.5, "steel": 2.0},
    "water": {"fire": 2.0, "water": 0.5, "grass": 0.5, "ground": 2.0, "rock": 2.0, "dragon": 0.5},
    "electric": {"water": 2.0, "electric": 0.5, "grass": 0.5, "ground": 0.0, "flying": 2.0, "dragon": 0.5},
    "grass": {"fire": 0.5, "water": 2.0, "grass": 0.5, "poison": 0.5, "ground": 2.0, "flying": 0.5, "bug": 0.5, "rock": 2.0, "dragon": 0.5, "steel": 0.5},
    "ice": {"fire": 0.5, "water": 0.5, "grass": 2.0, "ice": 0.5, "ground": 2.0, "flying": 2.0, "dragon": 2.0, "steel": 0.5},
    "fighting": {"normal": 2.0, "ice": 2.0, "poison": 0.5, "flying": 0.5, "psychic": 0.5, "bug": 0.5, "rock": 2.0, "ghost": 0.0, "dark": 2.0, "steel": 2.0, "fairy": 0.5},
    "poison": {"grass": 2.0, "poison": 0.5, "ground": 0.5, "rock": 0.5, "ghost": 0.5, "steel": 0.0, "fairy": 2.0},
    "ground": {"fire": 2.0, "electric": 2.0, "grass": 0.5, "poison": 2.0, "flying": 0.0, "bug": 0.5, "rock": 2.0, "steel": 2.0},
    "flying": {"electric": 0.5, "grass": 2.0, "fighting": 2.0, "bug": 2.0, "rock": 0.5, "steel": 0.5},
    "psychic": {"fighting": 2.0, "poison": 2.0, "psychic": 0.5, "dark": 0.0, "steel": 0.5},
    "bug": {"fire": 0.5, "grass": 2.0, "fighting": 0.5, "poison": 0.5, "flying": 0.5, "psychic": 2.0, "ghost": 0.5, "dark": 2.0, "steel": 0.5, "fairy": 0.5},
    "rock": {"fire": 2.0, "ice": 2.0, "fighting": 0.5, "ground": 0.5, "flying": 2.0, "bug": 2.0, "steel": 0.5},
    "ghost": {"normal": 0.0, "psychic": 2.0, "ghost": 2.0, "dark": 0.5},
    "dragon": {"dragon": 2.0, "steel": 0.5, "fairy": 0.0},
    "dark": {"fighting": 0.5, "psychic": 2.0, "ghost": 2.0, "dark": 0.5, "fairy": 0.5},
    "steel": {"fire": 0.5, "water": 0.5, "electric": 0.5, "ice": 2.0, "rock": 2.0, "steel": 0.5, "fairy": 2.0},
    "fairy": {"fire": 0.5, "fighting": 2.0, "poison": 0.5, "dragon": 2.0, "dark": 2.0, "steel": 0.5}
}

TYPE_ZH = {
    "normal": "一般", "fire": "火", "water": "水", "grass": "草", "electric": "電",
    "ice": "冰", "fighting": "格鬥", "poison": "毒", "ground": "地面", "flying": "飛行",
    "psychic": "超能力", "bug": "蟲", "rock": "岩石", "ghost": "幽靈", "dragon": "龍",
    "steel": "鋼", "dark": "惡", "fairy": "妖精"
}

ACTIVE_BATTLES = {}

def calc_type_multiplier(move_type: str, defender_types: list) -> float:
    mult = 1.0
    chart = TYPE_CHART.get(move_type, {})
    for dt in defender_types:
        mult *= chart.get(dt, 1.0)
    return mult

async def ensure_zh_moves(client: httpx.AsyncClient, moves: list) -> list:
    if not moves:
        return []
    result = []
    for m in moves:
        if m.get("name") and not m["name"].isascii():
            result.append(m)
            continue
        try:
            res = await client.get(f"https://pokeapi.co/api/v2/move/{m['id']}", timeout=6.0)
            if res.status_code == 200:
                m_data = res.json()
                zh = extract_zh_name(m_data.get("names", []), m["name"])
                m_copy = dict(m)
                m_copy["name"] = zh
                m_copy["priority"] = m_data.get("priority", 0)
                result.append(m_copy)
                continue
        except Exception:
            pass
        result.append(m)
    return result

async def fetch_combatant(client: httpx.AsyncClient, pokemon_id: int, custom_name: str = None, custom_moves: list = None):
    res, sp_res = await asyncio.gather(
        client.get(f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}", timeout=10.0),
        client.get(f"https://pokeapi.co/api/v2/pokemon-species/{pokemon_id}", timeout=10.0)
    )
    data = res.json()
    sp = sp_res.json() if sp_res.status_code == 200 else {}
    zh_name = custom_name or extract_zh_name(sp.get("names", []), data["name"])
    stats = {s["stat"]["name"]: s["base_stat"] for s in data["stats"]}
    max_hp = stats.get("hp", 80) * 2 + 110

    raw_moves = custom_moves if custom_moves else (await get_pokemon_moves(pokemon_id))[:4]
    moves = await ensure_zh_moves(client, raw_moves)
    if not moves:
        moves = [{"id": 33, "name": "撞擊", "type": "normal", "power": 40, "accuracy": 100, "damage_class": "physical", "priority": 0}]

    anim_gen5 = data.get("sprites", {}).get("versions", {}).get("generation-v", {}).get("black-white", {}).get("animated", {})
    front_sprite = (
        anim_gen5.get("front_default")
        or data["sprites"]["other"]["official-artwork"]["front_default"]
        or data["sprites"]["front_default"]
    )
    back_sprite = (
        anim_gen5.get("back_default")
        or data["sprites"].get("back_default")
        or front_sprite
    )

    return {
        "pokemon_id": pokemon_id,
        "name": zh_name,
        "front_sprite": front_sprite,
        "back_sprite": back_sprite,
        "types": [t["type"]["name"] for t in data["types"]],
        "max_hp": max_hp,
        "hp": max_hp,
        "atk": stats.get("attack", 80),
        "def": stats.get("defense", 80),
        "spa": stats.get("special-attack", 80),
        "spd": stats.get("special-defense", 80),
        "spe": stats.get("speed", 80),
        "moves": moves,
        "stats_log": {
            "damage_dealt": 0,
            "damage_taken": 0,
            "kos": 0,
            "fatal_type": None,
            "move_usage": {m["name"]: {"uses": 0, "total_dmg": 0, "super_hits": 0, "type": m["type"]} for m in moves}
        }
    }

async def start_battle(trainer_id: str, player_team_records: list):
    if not player_team_records:
        raise ValueError("你的對戰隊伍目前是空的，請先加入至少 1 隻寶可夢！")

    enemy_ids = random.sample(range(1, 494), len(player_team_records))
    async with httpx.AsyncClient() as client:
        player_tasks = [
            fetch_combatant(client, m["pokemon_id"], m["pokemon_name"], m["moves"])
            for m in player_team_records
        ]
        enemy_tasks = [fetch_combatant(client, eid) for eid in enemy_ids]
        player_party, enemy_party = await asyncio.gather(
            asyncio.gather(*player_tasks),
            asyncio.gather(*enemy_tasks)
        )

    battle_id = str(uuid.uuid4())[:8]
    state = {
        "battle_id": battle_id,
        "trainer_id": trainer_id,
        "actions_count": 0,
        "player_party": list(player_party),
        "enemy_party": list(enemy_party),
        "player_idx": 0,
        "enemy_idx": 0,
        "finished": False,
        "winner": None,
        "damage_taken_by_type": {}
    }
    ACTIVE_BATTLES[battle_id] = state
    return serialize_state(state, [f"野生挑戰者出現！派出了「{enemy_party[0]['name']}」！"])

def compute_damage(attacker: dict, defender: dict, move: dict):
    if random.randint(1, 100) > (move.get("accuracy") or 100):
        return 0, 1.0, False
    is_special = move.get("damage_class") == "special"
    a_stat = attacker["spa"] if is_special else attacker["atk"]
    d_stat = defender["spd"] if is_special else defender["def"]
    power = move.get("power") or 50
    stab = 1.5 if move["type"] in attacker["types"] else 1.0
    eff = calc_type_multiplier(move["type"], defender["types"])
    if eff == 0:
        return 0, 0.0, True
    rand_factor = random.uniform(0.88, 1.0)
    raw = (((2 * 50 / 5 + 2) * power * (a_stat / max(1, d_stat))) / 50 + 2) * stab * eff * rand_factor
    return max(1, int(raw)), eff, True

def execute_attack(attacker: dict, defender: dict, move: dict, is_player: bool, state: dict, logs: list, events: list):
    dmg, eff, hit = compute_damage(attacker, defender, move)
    m_name = move["name"]
    if is_player and m_name in attacker["stats_log"]["move_usage"]:
        attacker["stats_log"]["move_usage"][m_name]["uses"] += 1

    if not hit:
        msg = f"{attacker['name']} 使出了「{m_name}」，但是沒有命中！"
        logs.append(msg)
        events.append({
            "attacker": "player" if is_player else "enemy",
            "move_name": m_name,
        "move_type": move["type"],
            "damage": 0,
            "target_hp_after": defender["hp"],
            "target_max_hp": defender["max_hp"],
            "log": msg,
            "fainted": False
        })
        return False

    if eff == 0:
        msg = f"{attacker['name']} 使出了「{m_name}」，但對 {defender['name']} 完全沒有效果..."
        logs.append(msg)
        events.append({
            "attacker": "player" if is_player else "enemy",
            "move_name": m_name,
        "move_type": move["type"],
            "damage": 0,
            "target_hp_after": defender["hp"],
            "target_max_hp": defender["max_hp"],
            "log": msg,
            "fainted": False
        })
        return False

    actual_dmg = min(defender["hp"], dmg)
    defender["hp"] -= actual_dmg
    attacker["stats_log"]["damage_dealt"] += actual_dmg
    defender["stats_log"]["damage_taken"] += actual_dmg

    if is_player and m_name in attacker["stats_log"]["move_usage"]:
        attacker["stats_log"]["move_usage"][m_name]["total_dmg"] += actual_dmg
        if eff > 1.0:
            attacker["stats_log"]["move_usage"][m_name]["super_hits"] += 1

    if not is_player:
        m_type = move["type"]
        state["damage_taken_by_type"][m_type] = state["damage_taken_by_type"].get(m_type, 0) + actual_dmg

    eff_text = "（效果絕佳！）" if eff >= 2.0 else ("（效果不太好...）" if eff < 1.0 else "")
    msg = f"{attacker['name']} 使出了「{m_name}」，造成 {actual_dmg} 點傷害！{eff_text}"
    logs.append(msg)

    fainted = defender["hp"] <= 0
    if fainted:
        defender["hp"] = 0
        attacker["stats_log"]["kos"] += 1
        defender["stats_log"]["fatal_type"] = move["type"]
        logs.append(f"💥 {defender['name']} 體力耗盡倒下了！")

    events.append({
        "attacker": "player" if is_player else "enemy",
        "move_name": m_name,
        "move_type": move["type"],
        "damage": actual_dmg,
        "target_hp_after": defender["hp"],
        "target_max_hp": defender["max_hp"],
        "log": msg,
        "fainted": fainted
    })
    return fainted

def switch_player_pokemon(battle_id: str, target_idx: int):
    state = ACTIVE_BATTLES.get(battle_id)
    if not state or state["finished"]:
        raise ValueError("對戰不存在或已結束")
    if target_idx < 0 or target_idx >= len(state["player_party"]):
        raise ValueError("無效的隊伍位置")
    if target_idx == state["player_idx"]:
        raise ValueError("該寶可夢已經在場上了")
    target_mon = state["player_party"][target_idx]
    if target_mon["hp"] <= 0:
        raise ValueError("該寶可夢已失去戰鬥能力")

    state["player_idx"] = target_idx
    logs = [f"回來吧！去吧，{target_mon['name']}！"]
    return serialize_state(state, logs, [])

def process_turn(battle_id: str, move_index: int):
    state = ACTIVE_BATTLES.get(battle_id)
    if not state or state["finished"]:
        raise ValueError("對戰不存在或已結束")

    state["actions_count"] += 1
    p_mon = state["player_party"][state["player_idx"]]
    e_mon = state["enemy_party"][state["enemy_idx"]]
    p_move = p_mon["moves"][min(move_index, len(p_mon["moves"]) - 1)]
    e_move = random.choice(e_mon["moves"])

    logs = []
    events = []

    p_prio = p_move.get("priority", 0)
    e_prio = e_move.get("priority", 0)
    if p_prio != e_prio:
        player_first = p_prio > e_prio
    else:
        player_first = p_mon["spe"] >= e_mon["spe"]

    if player_first:
        fainted = execute_attack(p_mon, e_mon, p_move, True, state, logs, events)
        if not fainted:
            execute_attack(e_mon, p_mon, e_move, False, state, logs, events)
    else:
        fainted = execute_attack(e_mon, p_mon, e_move, False, state, logs, events)
        if not fainted:
            execute_attack(p_mon, e_mon, p_move, True, state, logs, events)

    if e_mon["hp"] <= 0:
        next_e = next((i for i, m in enumerate(state["enemy_party"]) if m["hp"] > 0), None)
        if next_e is None:
            state["finished"] = True
            state["winner"] = "player"
            logs.append("🏆 恭喜！你擊敗了對手所有寶可夢，獲得勝利！")
        else:
            state["enemy_idx"] = next_e
            logs.append(f"對手派出了「{state['enemy_party'][next_e]['name']}」上場！")

    if not state["finished"] and p_mon["hp"] <= 0:
        next_p = next((i for i, m in enumerate(state["player_party"]) if m["hp"] > 0), None)
        if next_p is None:
            state["finished"] = True
            state["winner"] = "enemy"
            logs.append("💀 我方全軍覆沒，挑戰失敗...")
        else:
            state["player_idx"] = next_p
            logs.append(f"你派出了「{state['player_party'][next_p]['name']}」接替戰鬥！")

    return serialize_state(state, logs, events)

def build_analytics(state: dict):
    mvp_list = []
    move_stats = []
    total_taken = sum(state["damage_taken_by_type"].values()) or 1

    for m in state["player_party"]:
        s = m["stats_log"]
        mvp_list.append({
            "name": m["name"],
            "damage_dealt": s["damage_dealt"],
            "damage_taken": s["damage_taken"],
            "kos": s["kos"],
            "fatal_type": TYPE_ZH.get(s["fatal_type"], s["fatal_type"]) if s["fatal_type"] else "存活"
        })
        for m_name, ms in s["move_usage"].items():
            if ms["uses"] > 0:
                move_stats.append({
                    "pokemon": m["name"],
                    "move_name": m_name,
        "move_type": move["type"],
                    "type_zh": TYPE_ZH.get(ms["type"], ms["type"]),
                    "uses": ms["uses"],
                    "avg_dmg": round(ms["total_dmg"] / ms["uses"], 1),
                    "total_dmg": ms["total_dmg"],
                    "super_hits": ms["super_hits"]
                })

    mvp_list.sort(key=lambda x: x["damage_dealt"], reverse=True)
    move_stats.sort(key=lambda x: x["total_dmg"], reverse=True)

    advice = []
    if state["damage_taken_by_type"]:
        worst_type, worst_dmg = max(state["damage_taken_by_type"].items(), key=lambda x: x[1])
        pct = round((worst_dmg / total_taken) * 100)
        if pct >= 30:
            advice.append(f"防守預警：敵方「{TYPE_ZH.get(worst_type, worst_type)}屬性」招式對你造成了高達 {pct}% 的總傷害，建議隊伍補入抵抗該屬性的聯防寶可夢。")

    zero_dmg = [p["name"] for p in mvp_list if p["damage_dealt"] == 0]
    if zero_dmg:
        advice.append(f"輸出檢討：「{', '.join(zero_dmg)}」本場未造成任何有效傷害即退場，建議善用自由換人避開不利屬性或調整出戰順序。")

    if not advice:
        advice.append("陣容表現均衡！各屬性打擊面與承傷配置相當穩定，可嘗試挑戰更高強度的隨機對手。")

    return {
        "winner": state["winner"],
        "total_actions": state["actions_count"],
        "mvp_ranking": mvp_list,
        "move_analytics": move_stats,
        "tactical_advice": advice
    }

def serialize_state(state: dict, logs: list, events: list = None):
    p_mon = state["player_party"][state["player_idx"]]
    e_mon = state["enemy_party"][state["enemy_idx"]]
    res = {
        "battle_id": state["battle_id"],
        "finished": state["finished"],
        "winner": state["winner"],
        "logs": logs,
        "events": events or [],
        "player_party": [
            {
                "idx": i,
                "name": m["name"],
                "sprite": m["front_sprite"],
                "hp": m["hp"],
                "max_hp": m["max_hp"],
                "active": i == state["player_idx"]
            }
            for i, m in enumerate(state["player_party"])
        ],
        "player": {
            "name": p_mon["name"],
            "sprite": p_mon["back_sprite"],
            "hp": p_mon["hp"],
            "max_hp": p_mon["max_hp"],
            "spe": p_mon["spe"],
            "moves": p_mon["moves"],
            "alive_count": sum(1 for m in state["player_party"] if m["hp"] > 0),
            "total_count": len(state["player_party"])
        },
        "enemy": {
            "name": e_mon["name"],
            "sprite": e_mon["front_sprite"],
            "hp": e_mon["hp"],
            "max_hp": e_mon["max_hp"],
            "spe": e_mon["spe"],
            "alive_count": sum(1 for m in state["enemy_party"] if m["hp"] > 0),
            "total_count": len(state["enemy_party"])
        }
    }
    if state["finished"]:
        res["analytics"] = build_analytics(state)
    return res
