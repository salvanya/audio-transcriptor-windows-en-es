import subprocess
import logging
from pathlib import Path
from typing import Tuple, Optional
import static_ffmpeg

logger = logging.getLogger(__name__)

# Ensure static ffmpeg binaries are added to the PATH dynamically.
static_ffmpeg.add_paths()

def get_media_duration(filepath: Path) -> float:
    """Gets the duration of a media file in seconds using ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(filepath)
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return float(result.stdout.strip())
    except Exception as e:
        logger.error(f"Error getting duration for {filepath}: {e}")
        return 0.0

def extract_audio(input_path: Path, output_path: Path) -> bool:
    """
    Extracts audio from a given media file and converts it to Whisper-compatible 16kHz, mono, 16-bit WAV.
    output_path will be written to AppData/tmp/{job_id}.wav.
    """
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        # Remove if it exists
        if output_path.exists():
            output_path.unlink()

        cmd = [
            "ffmpeg",
            "-y",               # Overwrite output
            "-i", str(input_path),
            "-vn",              # No video
            "-acodec", "pcm_s16le", # 16-bit PCM
            "-ar", "16000",     # 16 kHz sample rate
            "-ac", "1",         # Mono channel
            str(output_path)
        ]
        
        # We don't check=True immediately to be able to log stderr on failure
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg extraction failed for {input_path}")
            logger.error(result.stderr)
            return False
            
        return output_path.exists()
    except Exception as e:
        logger.error(f"Exception during audio extraction for {input_path}: {e}")
        return False
