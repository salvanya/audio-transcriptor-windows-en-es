from fastapi import APIRouter
from api.websocket import router as ws_router
from api.model import router as model_router
from api.transcription import router as transcription_router

api_router = APIRouter()

# Mount the sub-routers
api_router.include_router(ws_router)
api_router.include_router(model_router)
api_router.include_router(transcription_router)
