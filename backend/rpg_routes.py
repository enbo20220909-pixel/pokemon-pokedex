from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import rpg_engine

router = APIRouter(prefix="/api/rpg", tags=["Pokopia RPG"])

class MountRequest(BaseModel):
    trainer_id: str
    box_id: Optional[int] = None

class TravelRequest(BaseModel):
    trainer_id: str
    island_id: str

class CatchRequest(BaseModel):
    trainer_id: str
    pokemon: Dict[str, Any]

class TmRequest(BaseModel):
    trainer_id: str
    box_id: int
    move: Dict[str, Any]

class BadgeRequest(BaseModel):
    trainer_id: str
    badge_name: str

@router.get("/state/{trainer_id}")
async def api_rpg_state(trainer_id: str):
    tid = trainer_id.strip()
    await rpg_engine.ensure_starter_if_empty(tid)
    return rpg_engine.get_rpg_state(tid)

@router.post("/mount")
def api_rpg_mount(req: MountRequest):
    try:
        return rpg_engine.set_mount(req.trainer_id.strip(), req.box_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/travel")
def api_rpg_travel(req: TravelRequest):
    try:
        return rpg_engine.travel_island(req.trainer_id.strip(), req.island_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/encounter/{trainer_id}/{island_id}")
async def api_rpg_encounter(trainer_id: str, island_id: str):
    return await rpg_engine.trigger_grass_encounter(trainer_id.strip(), island_id)

@router.post("/catch")
def api_rpg_catch(req: CatchRequest):
    tid = req.trainer_id.strip()
    box_id = rpg_engine.add_to_pc_box(tid, req.pokemon)
    return {"status": "caught", "box_id": box_id, "state": rpg_engine.get_rpg_state(tid)}

@router.post("/picnic/{trainer_id}")
def api_rpg_picnic(trainer_id: str):
    return rpg_engine.hold_picnic(trainer_id.strip())

@router.post("/teach-tm")
def api_rpg_teach_tm(req: TmRequest):
    try:
        return rpg_engine.teach_tm_move(req.trainer_id.strip(), req.box_id, req.move)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/badge")
def api_rpg_badge(req: BadgeRequest):
    return rpg_engine.claim_gym_badge(req.trainer_id.strip(), req.badge_name)

class ExpGrantRequest(BaseModel):
    trainer_id: str
    box_id: int
    enemy_level: int
    is_legendary: bool = False

@router.post("/exp")
def api_rpg_grant_exp(req: ExpGrantRequest):
    try:
        return rpg_engine.grant_battle_exp(req.trainer_id.strip(), req.box_id, req.enemy_level, req.is_legendary)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

class AttemptCatchRequest(BaseModel):
    trainer_id: str
    pokemon: Dict[str, Any]
    ball_id: str
    current_hp: int
    max_hp: int

@router.post("/attempt-catch")
def api_rpg_attempt_catch(req: AttemptCatchRequest):
    return rpg_engine.attempt_capture_pokemon(
        req.trainer_id.strip(), req.pokemon, req.ball_id, req.current_hp, req.max_hp
    )
