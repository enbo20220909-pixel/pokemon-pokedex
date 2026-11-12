from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import database
import move_service
import battle_engine

app = FastAPI(title="Pokemon Pokedex Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

database.init_db()

class AddMemberRequest(BaseModel):
    trainer_id: str
    pokemon_id: int
    pokemon_name: str
    sprite_url: str
    types: List[str]
    note: str = ""

class UpdateMovesRequest(BaseModel):
    trainer_id: str
    moves: List[Dict[str, Any]]
    note: str = ""

class StartBattleRequest(BaseModel):
    trainer_id: str

class TurnRequest(BaseModel):
    move_index: int

class SwitchRequest(BaseModel):
    target_idx: int

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Python FastAPI 後端運行中"}

@app.get("/api/pokemon/{pokemon_id}/moves")
async def api_get_moves(pokemon_id: int):
    moves = await move_service.get_pokemon_moves(pokemon_id)
    return {"pokemon_id": pokemon_id, "moves": moves}

@app.get("/api/team/{trainer_id}")
async def api_get_team(trainer_id: str):
    team = database.get_trainer_team(trainer_id)
    for member in team:
        if member["pokemon_name"].isascii():
            zh_name = await move_service.get_pokemon_zh_name(member["pokemon_id"], member["pokemon_name"])
            if zh_name != member["pokemon_name"]:
                with database.get_conn() as conn:
                    conn.execute("UPDATE teams SET pokemon_name = ? WHERE id = ?", (zh_name, member["slot_id"]))
                member["pokemon_name"] = zh_name
    return {"trainer_id": trainer_id, "team": team}

@app.post("/api/team")
async def api_add_member(req: AddMemberRequest):
    try:
        zh_name = await move_service.get_pokemon_zh_name(req.pokemon_id, req.pokemon_name)
        all_moves = await move_service.get_pokemon_moves(req.pokemon_id)
        default_moves = all_moves[:4]
        slot_id = database.add_pokemon_to_team(
            req.trainer_id.strip(), req.pokemon_id, zh_name,
            req.sprite_url, req.types, default_moves, req.note
        )
        return {"status": "success", "slot_id": slot_id, "pokemon_name": zh_name, "team": database.get_trainer_team(req.trainer_id.strip())}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/team/{slot_id}/moves")
def api_update_moves(slot_id: int, req: UpdateMovesRequest):
    try:
        database.update_slot_moves(slot_id, req.trainer_id.strip(), req.moves, req.note)
        return {"status": "success", "team": database.get_trainer_team(req.trainer_id.strip())}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/team/{slot_id}")
def api_remove_member(slot_id: int, trainer_id: str):
    database.remove_pokemon_from_team(slot_id, trainer_id.strip())
    return {"status": "success", "team": database.get_trainer_team(trainer_id.strip())}

@app.post("/api/battle/start")
async def api_start_battle(req: StartBattleRequest):
    try:
        team = database.get_trainer_team(req.trainer_id.strip())
        return await battle_engine.start_battle(req.trainer_id.strip(), team)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/battle/{battle_id}/turn")
def api_battle_turn(battle_id: str, req: TurnRequest):
    try:
        return battle_engine.process_turn(battle_id, req.move_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/battle/{battle_id}/switch")
def api_battle_switch(battle_id: str, req: SwitchRequest):
    try:
        return battle_engine.switch_player_pokemon(battle_id, req.target_idx)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
