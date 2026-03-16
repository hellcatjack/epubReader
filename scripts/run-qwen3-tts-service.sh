#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -x "$REPO_ROOT/.venv/bin/python" ]]; then
  echo "Missing .venv. Run scripts/setup-qwen3-tts-venv.sh first." >&2
  exit 1
fi

exec "$REPO_ROOT/.venv/bin/python" -m tts.qwen3_tts_service
