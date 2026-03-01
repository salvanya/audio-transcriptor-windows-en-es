import sys
import os
import subprocess
import signal
import uvicorn
import webview
import threading
import logging
import time
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
                # Don't kill ourselves
                if pid != os.getpid():
                    logger.info(f"Killing stale process on port {port} (PID {pid})")
                    os.kill(pid, signal.SIGTERM)
                    time.sleep(0.5)
    except Exception as e:
        logger.warning(f"Could not clean port {port}: {e}")


app = FastAPI(title="AuraTranscribe API")

app.include_router(api_router)

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

    # Wait briefly to let the uvicorn server bind to the port
    time.sleep(1)

    # Create pywebview window
    core.globals.webview_window = webview.create_window(
        title="AuraTranscribe",
        url=f"http://127.0.0.1:{FASTAPI_PORT}",
        width=900,
        height=660,
        min_size=(800, 600),
        background_color="#080808"
    )

    # Run the window on the main thread (blocks until window is closed)
    webview.start(debug=False)

    # -- Window closed: clean shutdown --
    logger.info("Window closed. Shutting down server...")
    if _server:
        _server.should_exit = True

    # Give the server a moment to finish, then force exit
    time.sleep(1)
    os._exit(0)