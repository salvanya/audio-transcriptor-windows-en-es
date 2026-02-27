import psutil
import httpx
import hashlib
import asyncio
import time
import logging
from typing import Dict, Any, Callable, Awaitable
from pathlib import Path

from config import MODEL_DIR, MODEL_SHA256, WHISPER_MODEL

logger = logging.getLogger(__name__)

def check_ram_availability() -> Dict[str, Any]:
    """
    Checks if there is sufficient RAM available before starting transcription.
    Returns dict with 'sufficient', 'available_gb', 'required_gb'.
    """
    available = psutil.virtual_memory().available
    required  = 2_400_000_000   # 2.4 GB: model (2.2 GB) + FFmpeg + overhead
    return {
        "sufficient":    available >= required,
        "available_gb":  round(available / 1e9, 1),
        "required_gb":   2.4
    }

async def download_model(progress_callback: Callable[[dict], Awaitable[None]] = None) -> bool:
    """
    Downloads the faster-whisper model from Hugging Face with progress reporting.
    Verifies SHA256 checksum on completion.
    """
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    
    base_url = f"https://huggingface.co/Systran/faster-whisper-{WHISPER_MODEL}/resolve/main"
    files_to_download = [
        "config.json",
        "tokenizer.json",
        "vocabulary.txt",
        "model.bin"
    ]
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            for filename in files_to_download:
                url = f"{base_url}/{filename}"
                filepath = MODEL_DIR / filename
                
                if filename == "model.bin":
                    # Remove existing if incomplete
                    if filepath.exists():
                        filepath.unlink()
                        
                    async with client.stream("GET", url) as response:
                        response.raise_for_status()
                        total_bytes = int(response.headers.get("Content-Length", 465000000))
                        downloaded_bytes = 0
                        start_time = time.time()
                        last_emit_time = 0.0
                        
                        hasher = hashlib.sha256()
                        
                        with open(filepath, "wb") as f:
                            async for chunk in response.aiter_bytes(chunk_size=65536):
                                f.write(chunk)
                                hasher.update(chunk)
                                downloaded_bytes += len(chunk)
                                
                                current_time = time.time()
                                # Throttle progress events to ~10 per second
                                if progress_callback and (current_time - last_emit_time > 0.1):
                                    elapsed = current_time - start_time
                                    speed = downloaded_bytes / elapsed if elapsed > 0 else 0
                                    remaining_bytes = max(0, total_bytes - downloaded_bytes)
                                    estimated_remaining = remaining_bytes / speed if speed > 0 else 0
                                    
                                    await progress_callback({
                                        "event": "model_download",
                                        "bytes_downloaded": downloaded_bytes,
                                        "bytes_total": total_bytes,
                                        "percent": round((downloaded_bytes / total_bytes) * 100, 1) if total_bytes > 0 else 0.0,
                                        "speed_mbps": round(speed / 1_048_576, 1),  # MB/s
                                        "estimated_remaining_seconds": int(estimated_remaining)
                                    })
                                    last_emit_time = current_time
                                    
                        # Emit final 100% for this file just in case it was skipped by throttle
                        if progress_callback and filename == "model.bin":
                            await progress_callback({
                                "event": "model_download",
                                "bytes_downloaded": total_bytes,
                                "bytes_total": total_bytes,
                                "percent": 100.0,
                                "speed_mbps": 0.0,
                                "estimated_remaining_seconds": 0
                            })
                        
                        # Verify SHA256
                        downloaded_hash = hasher.hexdigest()
                        expected_hash = MODEL_SHA256.get(WHISPER_MODEL)
                        if expected_hash and downloaded_hash != expected_hash:
                            logger.error(f"SHA256 mismatch for {filename}. Expected {expected_hash}, got {downloaded_hash}")
                            filepath.unlink()
                            return False
                else:
                    if not filepath.exists():
                        resp = await client.get(url)
                        resp.raise_for_status()
                        with open(filepath, "wb") as f:
                            f.write(resp.content)
                            
        return True
    except Exception as e:
        logger.error(f"Error downloading model: {e}")
        return False

def is_model_downloaded() -> bool:
    """Checks if the Whisper model is present and apparently downloaded."""
    return (MODEL_DIR / "model.bin").exists() and \
           (MODEL_DIR / "config.json").exists() and \
           (MODEL_DIR / "vocabulary.txt").exists()
