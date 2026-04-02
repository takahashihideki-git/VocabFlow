#!/usr/bin/env bash
# deploy.sh — Word Wave を本番サーバーへデプロイ
# 使い方: bash scripts/deploy.sh [--dry-run]

set -euo pipefail

REMOTE_USER="YOUR_USER"
REMOTE_HOST="YOUR_HOST"
REMOTE_PATH="/path/to/wordwave"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "=== DRY RUN モード（実際には転送しません） ==="
fi

echo ">>> デプロイ開始: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"
echo "    ソース: ${LOCAL_ROOT}"

rsync -avz --delete \
  ${DRY_RUN} \
  --include="app/" \
  --include="app/**" \
  --include="core/" \
  --include="core/**" \
  --exclude="*" \
  "${LOCAL_ROOT}/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/"

echo ">>> デプロイ完了"
echo "    URL: https://${REMOTE_HOST}/playground/wordwave/app/app.html"
