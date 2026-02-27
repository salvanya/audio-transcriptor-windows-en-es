import platformdirs
from pathlib import Path

APP_NAME   = "AuraTranscribe"
APP_AUTHOR = "AuraTranscribe"

BASE_DIR     = Path(platformdirs.user_data_dir(APP_NAME, APP_AUTHOR))
MODEL_DIR    = BASE_DIR / "models" / "small"
TMP_DIR      = BASE_DIR / "tmp"
EXPORTS_DIR  = Path.home() / "Documents" / APP_NAME   # User-visible
LOG_FILE     = BASE_DIR / "auratranscribe.log"

FASTAPI_PORT  = 47821   # Fixed, uncommon port to avoid collisions
WHISPER_MODEL = "small"
LANGUAGES     = {"es": "Spanish", "en": "English"}

# Model SHA256 checksum for integrity verification after download
MODEL_SHA256 = {
    "small": "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794"
}
