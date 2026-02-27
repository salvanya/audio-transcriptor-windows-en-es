from fastapi import APIRouter, BackgroundTasks
from core.model_manager import check_ram_availability, is_model_downloaded, download_model
from config import WHISPER_MODEL
from api.websocket import ws_manager

router = APIRouter(prefix="/api/model", tags=["model"])

@router.get("/status")
async def get_model_status():
    """Returns whether the model is downloaded and checks RAM."""
    return {
        "downloaded": is_model_downloaded(),
        "model": WHISPER_MODEL,
        "size_mb": 465,
        "ram_check": check_ram_availability()
    }

@router.post("/download")
async def start_download(background_tasks: BackgroundTasks):
    """Triggers background download if not already downloaded."""
    if is_model_downloaded():
        return {"status": "already_downloaded"}
        
    async def _download_task():
        success = await download_model(progress_callback=ws_manager.broadcast)
        # We can emit final success/error here if needed, but progress_callback does it mostly.
        # Actually, let's emit a completion event
        if success:
            await ws_manager.broadcast({"event": "model_download_complete"})
        else:
            await ws_manager.broadcast({"event": "model_download_failed"})

    background_tasks.add_task(_download_task)
    return {"status": "download_started"}
