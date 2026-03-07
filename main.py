import sys
import os
import subprocess
import signal
import uvicorn
import threading
import logging
import time
import hashlib
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from rich.logging import RichHandler

from api.router import api_router
import core.globals
from config import FASTAPI_PORT

# -- Path resolution for PyInstaller bundled mode --
if getattr(sys, 'frozen', False):
    FRONTEND_PATH = os.path.join(sys._MEIPASS, 'frontend')
else:
    FRONTEND_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend')

# Basic logging setup
FORMAT = "%(message)s"
logging.basicConfig(
    level="INFO", format=FORMAT, datefmt="[%X]", handlers=[RichHandler()]
)
logger = logging.getLogger(__name__)


def kill_process_on_port(port: int):
    """Kill any existing process occupying the given port (Windows only)."""
    try:
        result = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW
        )
        for line in result.stdout.splitlines():
            if f"127.0.0.1:{port}" in line and "LISTENING" in line:
                parts = line.split()
                pid = int(parts[-1])
                if pid != os.getpid():
                    logger.info(f"Killing stale process on port {port} (PID {pid})")
                    os.kill(pid, signal.SIGTERM)
                    time.sleep(0.5)
    except Exception as e:
        logger.warning(f"Could not clean port {port}: {e}")


def open_app_window(url):
    """Open URL in the default browser tab to avoid app-window cache issues."""
    import webbrowser
    webbrowser.open(url)
    logger.info("Opened app in default browser tab")

app = FastAPI(title="AuraTranscribe API")

app.include_router(api_router)


@app.middleware("http")
async def disable_frontend_cache(request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.get("/api/debug/runtime_source")
async def debug_runtime_source():
    index_path = os.path.join(FRONTEND_PATH, "index.html")
    index_exists = os.path.exists(index_path)
    index_sha1 = None
    contains_welcome = False

    if index_exists:
        with open(index_path, "rb") as f:
            raw = f.read()
            index_sha1 = hashlib.sha1(raw).hexdigest()
            contains_welcome = b"Welcome to AuraTranscribe" in raw

    return {
        "cwd": os.getcwd(),
        "main_py": os.path.abspath(__file__),
        "frozen": bool(getattr(sys, "frozen", False)),
        "frontend_path": FRONTEND_PATH,
        "index_path": index_path,
        "index_exists": index_exists,
        "index_sha1": index_sha1,
        "index_contains_welcome": contains_welcome
    }

# Mount frontend using the resolved path
app.mount("/", StaticFiles(directory=FRONTEND_PATH, html=True), name="frontend")

@app.on_event("startup")
async def startup_event():
    from api.websocket import ws_manager
    core.globals.job_manager.add_event_callback(ws_manager.broadcast)
    await core.globals.job_manager.start()

@app.on_event("shutdown")
async def shutdown_event():
    await core.globals.job_manager.stop()


# Global reference to the uvicorn server so we can shut it down
_server = None

def run_server():
    global _server
    config = uvicorn.Config(app, host="127.0.0.1", port=FASTAPI_PORT, log_level="warning")
    _server = uvicorn.Server(config)
    _server.run()


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()

    # Kill any stale instance holding the port
    kill_process_on_port(FASTAPI_PORT)

    # Initialize the globals after freeze_support
    core.globals.init_globals()

    # Start FastAPI server in a background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait for server to be ready
    time.sleep(1.5)

    # Open the app in a normal browser tab
    app_url = f"http://127.0.0.1:{FASTAPI_PORT}"
    open_app_window(app_url)

    logger.info(f"AuraTranscribe running at {app_url}")
    logger.info("Close this window or press Ctrl+C to stop.")

    # Keep the server alive until user stops it
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down...")

    if _server:
        _server.should_exit = True
    time.sleep(1)
    os._exit(0)

