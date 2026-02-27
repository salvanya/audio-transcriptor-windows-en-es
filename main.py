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

# Basic logging setup
FORMAT = "%(message)s"
logging.basicConfig(
    level="INFO", format=FORMAT, datefmt="[%X]", handlers=[RichHandler()]
)

app = FastAPI(title="AuraTranscribe API")

app.include_router(api_router)

# Mount frontend (must ensure the directory exists)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

@app.on_event("startup")
async def startup_event():
    from api.websocket import ws_manager
    core.globals.job_manager.add_event_callback(ws_manager.broadcast)
    await core.globals.job_manager.start()

@app.on_event("shutdown")
async def shutdown_event():
    await core.globals.job_manager.stop()

def run_server():
    uvicorn.run(app, host="127.0.0.1", port=FASTAPI_PORT, log_level="warning")

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    
    # Initialize the globals after freeze_support
    core.globals.init_globals()
    
    # Start FastAPI server in a background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait briefly to let the uvicorn server bind to the port
    time.sleep(1)

    # Create pywebview window
    window = webview.create_window(
        title="AuraTranscribe",
        url=f"http://127.0.0.1:{FASTAPI_PORT}",
        width=900,
        height=660,
        min_size=(800, 600),
        background_color="#080808"
    )
    
    # Run the window on the main thread
    webview.start(debug=False)
