#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PATH="$REPO_ROOT/.venv"

python3 -m venv "$VENV_PATH"
"$VENV_PATH/bin/python" -m pip install --upgrade pip setuptools wheel
"$VENV_PATH/bin/pip" install -U \
  "kokoro>=0.9.4" \
  soundfile \
  "misaki[en]" \
  fastapi \
  uvicorn \
  pytest \
  httpx \
  "rocm[libraries,devel]==7.13.0a20260315"
"$VENV_PATH/bin/pip" install --force-reinstall --no-deps \
  "https://rocm.nightlies.amd.com/v2/gfx1151/torch-2.9.1%2Brocm7.13.0a20260315-cp310-cp310-linux_x86_64.whl" \
  "https://rocm.nightlies.amd.com/v2/gfx1151/torchaudio-2.9.0%2Brocm7.13.0a20260315-cp310-cp310-linux_x86_64.whl" \
  "https://rocm.nightlies.amd.com/v2/gfx1151/torchvision-0.24.0%2Brocm7.13.0a20260315-cp310-cp310-linux_x86_64.whl" \
  "https://rocm.nightlies.amd.com/v2/gfx1151/triton-3.5.1%2Brocm7.13.0a20260315-cp310-cp310-linux_x86_64.whl"
