import asyncio
import logging
import time
from typing import Dict, Any, Callable, Awaitable, List
from concurrent.futures import ProcessPoolExecutor
import multiprocessing
from multiprocessing.managers import SyncManager

from schemas.models import Job, JobStatus
from core.media_processor import get_media_duration, extract_audio
from core.transcriber import run_transcription
from config import TMP_DIR

logger = logging.getLogger(__name__)

class JobManager:
    def __init__(self):
        self.jobs: Dict[str, Job] = {}
        # Max 1 worker to serialize transcriptions (batch processing sequentially)
        self.executor = ProcessPoolExecutor(max_workers=1)
        self.manager = multiprocessing.Manager()
        self.progress_queue = self.manager.Queue()
        self.event_callbacks: List[Callable[[dict], Awaitable[None]]] = []
        
        # Background task for progress monitoring
        self._monitor_task = None
        self._process_queue_task = None
        self._job_queue: asyncio.Queue = asyncio.Queue()

    def add_event_callback(self, callback: Callable[[dict], Awaitable[None]]):
        self.event_callbacks.append(callback)

    async def emit(self, event_data: dict):
        for cb in self.event_callbacks:
            try:
                await cb(event_data)
            except Exception as e:
                logger.error(f"Error in event callback: {e}")

    async def start(self):
        """Starts background tasks to process queued jobs and monitor progress."""
        if self._monitor_task is None:
            self._monitor_task = asyncio.create_task(self._monitor_progress_queue())
        if self._process_queue_task is None:
            self._process_queue_task = asyncio.create_task(self._process_jobs())

    async def stop(self):
        if self._monitor_task:
            self._monitor_task.cancel()
        if self._process_queue_task:
            self._process_queue_task.cancel()
        self.executor.shutdown(wait=False)

    def submit_jobs(self, new_jobs: List[Job]):
        for j in new_jobs:
            # Initialize these safely inside the Manager context for Windows pickling
            j._pause_event = self.manager.Event()
            j._cancel_event = self.manager.Event()
            self.jobs[j.id] = j
            self._job_queue.put_nowait(j)

    def get_job(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    async def _process_jobs(self):
        """Continuously pulls jobs from the queue and processes them one by one."""
        while True:
            try:
                job: Job = await self._job_queue.get()
                if job.status in [JobStatus.CANCELLED, JobStatus.ERROR]:
                    self._job_queue.task_done()
                    continue

                await self._run_job(job)
                self._job_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error processing job queue: {e}")

    async def _run_job(self, job: Job):
        job.status = JobStatus.EXTRACTING
        await self.emit({
            "event": "status_change",
            "job_id": job.id,
            "status": job.status.value
        })

        # Set pause event to true (not paused)
        job._pause_event.set()
        job._cancel_event.clear()
        
        # 1. duration
        duration = await asyncio.to_thread(get_media_duration, job.original_path)
        job.duration_seconds = duration

        # 2. extract audio
        tmp_id = job.id
        tmp_audio_path = TMP_DIR / f"{tmp_id}.wav"
        job.tmp_audio_path = tmp_audio_path
        
        success = await asyncio.to_thread(extract_audio, job.original_path, tmp_audio_path)
        if not success or job._cancel_event.is_set():
            if not job._cancel_event.is_set():
                job.status = JobStatus.ERROR
                job.error = "Failed to extract audio using FFmpeg"
            else:
                job.status = JobStatus.CANCELLED
            await self._cleanup_and_emit(job)
            return

        # 3. transcribe
        job.status = JobStatus.TRANSCRIBING
        job.elapsed_seconds = 0
        await self.emit({
            "event": "status_change",
            "job_id": job.id,
            "status": job.status.value
        })
        
        start_time = time.time()
        
        # Launch in executor
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(
            self.executor,
            run_transcription,
            job.id,
            job.tmp_audio_path,
            job.detected_language or "es", # or passed language
            job.duration_seconds,
            job._pause_event,
            job._cancel_event,
            self.progress_queue
        )
        job._process_future = future
        
        try:
            # We await the future in a tight loop to also update elapsed_seconds
            while not future.done():
                await asyncio.sleep(1)
                # Only update elapsed if transcribing (not paused)
                if job.status == JobStatus.TRANSCRIBING:
                    job.elapsed_seconds = int(time.time() - start_time)
            
            result = future.result()
            
            if result["status"] == "completed":
                job.status = JobStatus.COMPLETED
                job.result_text = result["text"]
                job.detected_language = result["detected_language"]
                
                await self.emit({
                    "event": "completed",
                    "job_id": job.id,
                    "filename": job.original_filename,
                    "detected_language": job.detected_language,
                    "duration_seconds": job.duration_seconds,
                    "text": job.result_text
                })
            elif result["status"] == "cancelled":
                job.status = JobStatus.CANCELLED
            else:
                job.status = JobStatus.ERROR
                job.error = result.get("error", "Unknown error")
                
        except Exception as e:
            logger.error(f"Error awaiting transcription future: {e}")
            job.status = JobStatus.ERROR
            job.error = str(e)
            
        await self._cleanup_and_emit(job)

    async def _cleanup_and_emit(self, job: Job):
        if job.tmp_audio_path and job.tmp_audio_path.exists():
            try:
                job.tmp_audio_path.unlink()
            except Exception as e:
                logger.error(f"Failed to delete tmp audio {job.tmp_audio_path}: {e}")
                
        if job.status in [JobStatus.ERROR, JobStatus.CANCELLED]:
            await self.emit({
                "event": "status_change",
                "job_id": job.id,
                "status": job.status.value,
                "error_message": job.error
            })

    async def _monitor_progress_queue(self):
        while True:
            try:
                # Use to_thread to safely poll without blocking asyncio loop
                msg = await asyncio.to_thread(self._poll_queue)
                if msg:
                    job_id = msg.get("job_id")
                    event_type = msg.get("event")
                    job = self.jobs.get(job_id)
                    
                    if not job: continue
                    
                    if event_type == "status_change":
                        new_status = msg.get("status")
                        if new_status == "paused":
                            job.status = JobStatus.PAUSED
                        elif new_status == "transcribing":
                            job.status = JobStatus.TRANSCRIBING
                        await self.emit({
                            "event": "status_change",
                            "job_id": job_id,
                            "status": job.status.value
                        })
                        
                    elif event_type == "progress_update":
                        progress = msg.get("progress", 0.0)
                        job.progress_audio = progress
                        
                        # Calculate remaining
                        if progress > 0 and job.elapsed_seconds > 0:
                            total_est = job.elapsed_seconds / progress
                            job.estimated_remaining = int(total_est - job.elapsed_seconds)
                        
                        await self.emit({
                            "event": "progress",
                            "job_id": job.id,
                            "status": job.status.value,
                            "audio_progress": round(progress, 3),
                            "batch_current": job.index_in_batch,
                            "batch_total": job.total_in_batch,
                            "elapsed_seconds": job.elapsed_seconds,
                            "estimated_remaining": job.estimated_remaining
                        })
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error polling progress queue: {e}")
                await asyncio.sleep(1)

    def _poll_queue(self) -> dict | None:
        try:
            from queue import Empty
            return self.progress_queue.get(timeout=0.5)
        except Empty:
            return None

    def pause_job(self, job_id: str):
        job = self.jobs.get(job_id)
        if job and job.status == JobStatus.TRANSCRIBING:
            job._pause_event.clear()

    def resume_job(self, job_id: str):
        job = self.jobs.get(job_id)
        if job and job.status == JobStatus.PAUSED:
            job._pause_event.set()

    def cancel_job(self, job_id: str):
        job = self.jobs.get(job_id)
        if job and job.status not in [JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.ERROR]:
            job._cancel_event.set()
            job._pause_event.set() # Unblock if paused
            job.status = JobStatus.CANCELLED
            if job._process_future and not job._process_future.done():
                 # Process will see cancel_event and exit
                 pass
