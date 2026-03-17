from pathlib import Path
import sys

from fastapi.testclient import TestClient
import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tts.kokoro_tts_service.app import create_app  # noqa: E402
from tts.kokoro_tts_service.runtime import BaseKokoroRuntime  # noqa: E402


@pytest.fixture
def client():
    return TestClient(create_app(runtime=BaseKokoroRuntime()))
