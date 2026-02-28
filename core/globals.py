from core.job_manager import JobManager
from typing import Optional

job_manager: Optional[JobManager] = None
webview_window: Optional[object] = None

def init_globals():
    global job_manager
    job_manager = JobManager()
