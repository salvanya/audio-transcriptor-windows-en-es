from fastapi import APIRouter, HTTPException, File, UploadFile
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
import shutil

from schemas.models import Job
import core.globals
from config import EXPORTS_DIR, TMP_DIR

router = APIRouter(prefix="/api", tags=["transcription"])

class JobPathsRequest(BaseModel):
    paths: List[str]

@router.get("/ui/save_dialog")
async def save_dialog(filename: str):
    """Triggers a native 'Save As' dialog via pywebview."""
    if not core.globals.webview_window:
        return {"path": None, "error": "UI window not available"}
        
    result = core.globals.webview_window.create_file_dialog(
        webview.SAVE_DIALOG,
        directory=str(Path(platformdirs.user_documents_dir())),
        save_filename=filename
    )
    
    # result is a string path or None
    return {"path": result}

import platformdirs
import webview

@router.post("/transcription/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """Receives files via standard multipart format and queues them."""
    job_ids = []
    total = len(files)
    
    new_jobs = []
    
    for idx, f in enumerate(files):
        job = Job(
            original_filename=f.filename,
            index_in_batch=idx + 1,
            total_in_batch=total
        )
        
        # Save to TMP_DIR
        safe_name = f"{job.id}_{f.filename}"
        save_path = TMP_DIR / safe_name
        save_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
            
        job.original_path = save_path
        new_jobs.append(job)
        job_ids.append(job.id)
        
    core.globals.job_manager.submit_jobs(new_jobs)
    return {"job_ids": job_ids}

@router.post("/transcription/upload_paths")
async def upload_paths(req: JobPathsRequest):
    """
    Alternative upload where the UI just sends absolute paths.
    Fits the 'original file is NOT moved' requirement.
    """
    job_ids = []
    total = len(req.paths)
    new_jobs = []
    
    for idx, path_str in enumerate(req.paths):
        p = Path(path_str)
        if not p.exists():
            raise HTTPException(status_code=400, detail=f"File not found: {path_str}")
            
        job = Job(
            original_filename=p.name,
            original_path=p,
            index_in_batch=idx + 1,
            total_in_batch=total
        )
        new_jobs.append(job)
        job_ids.append(job.id)
        
    core.globals.job_manager.submit_jobs(new_jobs)
    return {"job_ids": job_ids}

@router.post("/transcription/{id}/pause")
async def pause_job(id: str):
    job = core.globals.job_manager.get_job(id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    core.globals.job_manager.pause_job(id)
    return {"status": "paused"}

@router.post("/transcription/{id}/resume")
async def resume_job(id: str):
    job = core.globals.job_manager.get_job(id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    core.globals.job_manager.resume_job(id)
    return {"status": "resuming"}

@router.post("/transcription/{id}/cancel")
async def cancel_job(id: str):
    job = core.globals.job_manager.get_job(id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    core.globals.job_manager.cancel_job(id)
    return {"status": "cancelled"}

@router.get("/transcription/{id}/text")
async def get_text(id: str):
    job = core.globals.job_manager.get_job(id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"text": job.result_text}

class ExportRequest(BaseModel):
    job_ids: List[str]
    mode: str # "separate" or "merged"
    target_path: Optional[str] = None

@router.post("/export/single")
async def export_single(job_id: str, target_path: str):
    job = core.globals.job_manager.get_job(job_id)
    if not job or not job.result_text:
        raise HTTPException(status_code=404, detail="Job or text not found")
        
    p = Path(target_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(job.result_text, encoding="utf-8")
    return {"status": "exported", "file": target_path}

@router.post("/export/batch")
async def export_batch(req: ExportRequest):
    if req.mode == "separate":
        # This is now handled by the UI calling export_single in a loop for better control
        return {"status": "use_single_export_flow"}
        
    elif req.mode == "merged":
        if not req.target_path:
            raise HTTPException(status_code=400, detail="Target path required for merged export")
            
        jobs = [core.globals.job_manager.get_job(jid) for jid in req.job_ids if core.globals.job_manager.get_job(jid)]
        if not jobs:
            raise HTTPException(status_code=404, detail="No jobs found")
            
        import datetime
        date_str = datetime.datetime.now().strftime("%Y-%m-%d")
        out_file = Path(req.target_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
            
        lines = []
        for job in jobs:
            if not job.result_text:
                continue
            
            lines.append("══════════════════════════════════════════════════════════")
            lines.append(f"File: {job.original_filename}")
            dur_m, dur_s = divmod(int(job.duration_seconds or 0), 60)
            dur_str = f"{dur_m}:{dur_s:02d}"
            lines.append(f"Duration: {dur_str}  |  Language: {job.detected_language or 'Unknown'}  |  Date: {date_str}")
            lines.append("══════════════════════════════════════════════════════════\n")
            lines.append(job.result_text)
            lines.append("\n\n")
            
        out_file.write_text("\n".join(lines), encoding="utf-8")
        return {"status": "exported", "mode": "merged", "file": str(out_file)}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid mode")
