import platformdirs
from pathlib import Path

APP_NAME   = "AuraTranscribe"
APP_AUTHOR = "AuraTranscribe"

BASE_DIR     = Path(platformdirs.user_data_dir(APP_NAME))
MODEL_DIR    = BASE_DIR / "models" / "small"
TMP_DIR      = BASE_DIR / "tmp"
EXPORTS_DIR  = Path(platformdirs.user_documents_dir()) / APP_NAME
LOG_FILE     = BASE_DIR / "auratranscribe.log"

FASTAPI_PORT  = 47821   # Fixed, uncommon port to avoid collisions
WHISPER_MODEL = "small"
LANGUAGES     = {"es": "Spanish", "en": "English"}

# Model SHA256 checksum for integrity verification after download
MODEL_SHA256 = {
    "small": "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671"
}
