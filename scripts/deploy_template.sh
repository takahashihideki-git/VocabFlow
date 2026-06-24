#!/usr/bin/env bash
# deploy_template.sh — Word Wave を本番サーバーへデプロイするテンプレート
#
# 使い方:
#   1. このファイルを scripts/deploy.sh にコピー
#        cp scripts/deploy_template.sh scripts/deploy.sh
#   2. 下の REMOTE_USER / REMOTE_HOST / REMOTE_PATH を自分の接続先に書き換える
#   3. bash scripts/deploy.sh [--dry-run]
#
# 実 scripts/deploy.sh は .gitignore 済み（接続先情報をリポジトリに含めないため）。

set -euo pipefail

# ↓↓↓ 自分の環境に合わせて書き換える ↓↓↓
REMOTE_USER="YOUR_USER"
REMOTE_HOST="YOUR_HOST"
REMOTE_PATH="/path/to/wordwave"
# ↑↑↑ ここまで ↑↑↑

LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "=== DRY RUN モード（実際には転送しません） ==="
fi

echo ">>> デプロイ開始: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"
echo "    ソース: ${LOCAL_ROOT}"

# 開発専用ファイル・個人データは本番へ転送しない（--include="app/**" より前に置く＝先勝ち）。
# --delete により既に本番へ上がっている該当ファイルも次回デプロイで除去される。
#   _realstate.json(.gz) … 持ち込んだ個人学習状態（gitignore 済みだが rsync は git と別経路）
#   _import.html          … _realstate.json を localStorage へ流し込む開発ページ
#   realmock / design-preview / profile-mock … 配色・FAB位置・プロファイルの検証用モック
# （debug.html は iOS 向けデバッグページとして意図的に本番へ残す＝除外しない）
rsync -avz --delete \
  ${DRY_RUN} \
  --exclude="app/_realstate.json" \
  --exclude="app/_realstate.json.gz" \
  --exclude="app/_import.html" \
  --exclude="app/realmock.html" \
  --exclude="app/design-preview-wordwave.html" \
  --exclude="app/profile-mock.html" \
  --include="app/" \
  --include="app/**" \
  --include="core/" \
  --include="core/**" \
  --exclude="*" \
  "${LOCAL_ROOT}/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/"

echo ">>> デプロイ完了"
echo "    URL: https://${REMOTE_HOST}/path/to/wordwave/app/app.html"
