import logging
import multiprocessing
from multiprocessing.synchronize import Event
from multiprocessing.queues import Queue
from pathlib import Path
from typing import Dict, Any

from faster_whisper import WhisperModel
from config import MODEL_DIR

def run_transcription(
    job_id: str,
    audio_path: Path,
    language: str,
    duration_seconds: float,
    pause_event: Event,
    cancel_event: Event,
    progress_queue: Queue
) -> Dict[str, Any]:
    """
    Worker function executed in ProcessPoolExecutor.
    Reads audio_path, initializes Whisper, and yields progress.
    Returns the final concatenated text and detected language.
    """
    logger = logging.getLogger("transcriber_worker")
    logger.setLevel(logging.INFO)
    
    # Needs to be string for faster-whisper
    model_path = str(MODEL_DIR)
    
    try:
        # Check cancel before starting
        if cancel_event.is_set():
            return {"status": "cancelled", "text": None}
            
        model = WhisperModel(model_path, device="cpu", compute_type="int8")
        
        # 'auto' is not a valid language param in faster-whisper, it expects None for auto-detect
        lang_arg = language if language and language != "auto" else None

        segments, info = model.transcribe(
            str(audio_path),
            language=lang_arg,
            task="transcribe"
        )
        
        detected_language = info.language
        text_segments = []
        
        for segment in segments:
            # Check cancel
            if cancel_event.is_set():
                logger.info(f"Job {job_id} cancelled during transcription.")
                return {"status": "cancelled", "text": None}
                
            # Check pause
            if not pause_event.is_set():
                logger.info(f"Job {job_id} paused. Waiting...")
                progress_queue.put({"job_id": job_id, "event": "status_change", "status": "paused"})
                pause_event.wait() # blocks indefinitely until set
                
                if cancel_event.is_set():
                    return {"status": "cancelled", "text": None}
                    
                logger.info(f"Job {job_id} resumed.")
                progress_queue.put({"job_id": job_id, "event": "status_change", "status": "transcribing"})
                
            text_segments.append(segment.text)
            
            # Calculate progress
            if duration_seconds > 0:
                progress = min(1.0, segment.end / duration_seconds)
                progress_queue.put({
                    "job_id": job_id,
                    "event": "progress_update",
                    "progress": progress
                })
                
        full_text = "".join(text_segments).strip()
        
        return {
            "status": "completed",
            "text": full_text,
            "detected_language": detected_language
        }
        
    except Exception as e:
        logger.exception(f"Exception in transcription worker for job {job_id}: {e}")
        return {"status": "error", "error": str(e), "text": None}
