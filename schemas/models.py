from enum import Enum
from dataclasses import dataclass, field
from pathlib import Path
from concurrent.futures import Future
import multiprocessing
import uuid
from typing import Optional, Any

class JobStatus(str, Enum):
    QUEUED       = "queued"
    EXTRACTING   = "extracting"
    TRANSCRIBING = "transcribing"
    PAUSED       = "paused"
    COMPLETED    = "completed"
    CANCELLED    = "cancelled"
    ERROR        = "error"

@dataclass
class Job:
    id: str                              = field(default_factory=lambda: str(uuid.uuid4()))
    original_filename: str               = ""
    original_path: Optional[Path]        = None
    tmp_audio_path: Optional[Path]       = None   # WAV extracted to AppData/tmp/
    status: JobStatus                    = JobStatus.QUEUED
    progress_audio: float                = 0.0    # 0.0 → 1.0
    index_in_batch: int                  = 1
    total_in_batch: int                  = 1
    elapsed_seconds: int                 = 0
    estimated_remaining: int             = 0
    result_text: Optional[str]           = None
    detected_language: Optional[str]     = None
    duration_seconds: Optional[float]    = None
    error: Optional[str]                 = None
    _process_future: Optional[Future]    = field(default=None, repr=False)
    _pause_event: Any = field(default=None, repr=False)
    _cancel_event: Any = field(default=None, repr=False)
