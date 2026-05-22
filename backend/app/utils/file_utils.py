import json
from pathlib import Path

# Locate data folder in backend/data (same as original monolithic app)
pkg_dir = Path(__file__).resolve().parent.parent  # backend/app
DATA_DIR = pkg_dir.parent / "data"  # backend/data
HISTORY_FILE = DATA_DIR / "history.json"
MANUAL_VALUES_FILE = DATA_DIR / "manual_values.json"

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not HISTORY_FILE.exists():
        HISTORY_FILE.write_text("[]", encoding="utf-8")
    if not MANUAL_VALUES_FILE.exists():
        MANUAL_VALUES_FILE.write_text("{}", encoding="utf-8")

def _load_history() -> list:
    _ensure_data_dir()
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError):
        return []

def _save_history(data: list):
    _ensure_data_dir()
    HISTORY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def _load_manual_values() -> dict:
    _ensure_data_dir()
    try:
        return json.loads(MANUAL_VALUES_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError):
        return {}

def _save_manual_values(data: dict):
    _ensure_data_dir()
    MANUAL_VALUES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
