#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT/.venv/bin/python"
S3_TOOL="$ROOT/S3ReadWrite.py"
BUCKET="justcausepools"

usage() {
  cat <<'HELP'
Usage:
  npm run aws:upload-json -- <asset-file.json> <etherwars/s3/key.json>

Example:
  npm run aws:upload-json -- mock_tournament_stats.json etherwars/tournaments/mock_tournament-1/mock_tournament-1.json

The source file must be a JSON file directly inside assets/. The destination
must be a JSON object key below etherwars/ in the justcausepools bucket.
HELP
}

if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
  usage
  exit 0
fi

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 2
fi

ASSET_NAME="$1"
S3_KEY="$2"

if [[ ! "$ASSET_NAME" =~ ^[A-Za-z0-9._-]+\.json$ ]]; then
  echo "Asset must be a .json filename directly inside assets/: $ASSET_NAME" >&2
  exit 2
fi

if [[ "$S3_KEY" != etherwars/* || "$S3_KEY" != *.json || "$S3_KEY" == *..* || "$S3_KEY" == *//* ]]; then
  echo "S3 key must be a safe etherwars/.../*.json path: $S3_KEY" >&2
  exit 2
fi

ASSET_PATH="$ROOT/assets/$ASSET_NAME"
if [[ ! -f "$ASSET_PATH" ]]; then
  echo "Asset not found: $ASSET_PATH" >&2
  exit 2
fi

if [[ ! -x "$PYTHON" ]]; then
  echo "Project venv Python not found: $PYTHON" >&2
  exit 2
fi

"$PYTHON" -m json.tool "$ASSET_PATH" >/dev/null

echo "Uploading assets/$ASSET_NAME"
echo "       to s3://$BUCKET/$S3_KEY"
"$PYTHON" "$S3_TOOL" \
  --write-json "$ASSET_PATH" \
  --bucket "$BUCKET" \
  --key "$S3_KEY"
