from constants import TYPE_ZH


def build_analytics(state: dict) -> dict:
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
                    "move_type": ms["type"],
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
            advice.append(
                f"防守預警：敵方「{TYPE_ZH.get(worst_type, worst_type)}屬性」招式對你造成了高達 {pct}% 的總傷害，"
                "建議隊伍補入抵抗該屬性的聯防寶可夢。"
            )

    zero_dmg = [p["name"] for p in mvp_list if p["damage_dealt"] == 0]
    if zero_dmg:
        advice.append(
            f"輸出檢討：「{', '.join(zero_dmg)}」本場未造成任何有效傷害即退場，"
            "建議善用自由換人避開不利屬性或調整出戰順序。"
        )

    if not advice:
        advice.append("陣容表現均衡！各屬性打擊面與承傷配置相當穩定，可嘗試挑戰更高強度的隨機對手。")

    return {
        "winner": state["winner"],
        "total_actions": state["actions_count"],
        "mvp_ranking": mvp_list,
        "move_analytics": move_stats,
        "tactical_advice": advice
    }


def serialize_state(state: dict, logs: list, events: list = None) -> dict:
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
