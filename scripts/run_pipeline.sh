#!/bin/bash
# VocabFlow Phase 2 データ生成パイプライン
# 使用方法: ANTHROPIC_API_KEY=sk-ant-... bash scripts/run_pipeline.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo " VocabFlow Phase 2 データ生成パイプライン"
echo "=========================================="

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "ERROR: ANTHROPIC_API_KEY が設定されていません"
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  exit 1
fi

echo ""
echo "Step 1: API生成 (95バッチ × 20語)..."
python3 "$SCRIPT_DIR/generate_word_data.py"

echo ""
echo "Step 2: Distractor後処理 (同カテゴリ実単語意味に差し替え)..."
python3 "$SCRIPT_DIR/fix_distractors.py"

echo ""
echo "Step 3: バリデーション (word-data-spec §8)..."
python3 "$SCRIPT_DIR/validate_word_data.py"

echo ""
echo "Step 4: word-data.js ビルド..."
python3 "$SCRIPT_DIR/build_word_data_js.py"

echo ""
echo "=========================================="
echo " 完了！ core/word-data.js を確認してください"
echo "=========================================="
