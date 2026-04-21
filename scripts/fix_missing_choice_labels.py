#!/usr/bin/env python3
"""
choiceLabel 漏れ修正スクリプト

対象: meanings にカタカナ3文字以上を含むが choiceLabel が未定義の語（129件）
      audioHint との一致チェックなしで全件を Claude API に渡し、
      「その英単語の発音からカタカナ meaning が推測できるか」を API に判断させる。

使用方法:
  python3 scripts/fix_missing_choice_labels.py --dry-run  # 候補確認のみ
  python3 scripts/fix_missing_choice_labels.py            # 生成・反映
"""

import json
import re
import sys
import time
import argparse
import shutil
import anthropic

INPUT_PATH  = "scripts/results/word_data_final.json"
OUTPUT_PATH = "scripts/results/word_data_final.json"
BACKUP_PATH = "scripts/results/word_data_final.json.bk_choicelabel2"

KATAKANA_RE = re.compile(r'[ァ-ヾー]{3,}')
BATCH_SIZE  = 20

# ============================================================
# 候補抽出（audioHint フィルタなし）
# ============================================================

def find_candidates(data):
    candidates = []
    for w in data:
        if w.get("choiceLabel"):
            continue
        for m in w.get("meanings", []):
            if KATAKANA_RE.search(m.get("meaning", "")):
                candidates.append({
                    "id":       w["id"],
                    "word":     w["word"],
                    "pos":      w["pos"],
                    "meaning":  w["meanings"][0]["meaning"],
                    "audio_hint": w.get("audioHint", ""),
                })
                break
    return candidates

# ============================================================
# Claude API バッチ生成
# ============================================================

SYSTEM_PROMPT = """あなたは英語教材の日本語訳専門家です。

Recognition カード（英単語を見て日本語の意味を4択から選ぶ）では、
選択肢の正解ラベルにカタカナが含まれると、英単語の発音からカタカナを推測して
正解が分かってしまう問題があります。

## タスク
各エントリについて以下を判断してください:

【要 choiceLabel】
  meaning のカタカナが、その英単語の発音・音写と対応している場合。
  例: code → コード（code の音）、design → デザイン（design の音）

【不要（null）】
  カタカナが別の英単語の音写であり、対象語の発音とは無関係な場合。
  例: opportunity → チャンス（"chance" の音であり "opportunity" の音ではない）
      protein → タンパク質（タンパクは漢語由来・音推測不可）
      clue → ヒント（"hint" の音であり "clue" の音ではない）

【choiceLabel の条件】
1. カタカナ3文字以上を含まないこと
2. 対象語の意味を正確に表していること
3. 自然な日本語（和語・漢語）であること
4. 20文字以内で簡潔に

## 出力形式
JSON配列で入力と同じ順番で出力してください:
[
  {"id": 477, "choiceLabel": "符号、暗号"},
  {"id": 141, "choiceLabel": null},
  ...
]"""

def generate_batch(client, batch):
    items = []
    for c in batch:
        items.append(
            f'id={c["id"]}, word="{c["word"]}", pos={c["pos"]}, '
            f'meaning="{c["meaning"]}", audioHint="{c["audio_hint"]}"'
        )
    user_content = "以下の語を判定してください:\n\n" + "\n".join(items)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    text = response.content[0].text.strip()
    m = re.search(r'\[[\s\S]*\]', text)
    if not m:
        raise ValueError(f"JSON not found:\n{text[:300]}")
    return json.loads(m.group())

# ============================================================
# メイン
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open(INPUT_PATH, encoding="utf-8") as f:
        data = json.load(f)

    candidates = find_candidates(data)
    print(f"候補語: {len(candidates)}件")

    if args.dry_run:
        for c in candidates:
            print(f"  #{c['id']:4d}  {c['word']:<20s}  {c['meaning']}")
        return

    shutil.copy(INPUT_PATH, BACKUP_PATH)
    print(f"バックアップ: {BACKUP_PATH}")

    client    = anthropic.Anthropic()
    id_to_word = {w["id"]: w for w in data}
    results   = {}  # id -> choiceLabel str or None
    errors    = []

    batches = [candidates[i:i+BATCH_SIZE] for i in range(0, len(candidates), BATCH_SIZE)]
    print(f"\n{len(batches)} バッチで処理開始...\n")

    for bi, batch in enumerate(batches, 1):
        print(f"Batch {bi}/{len(batches)} ({len(batch)}語)...")
        try:
            generated = generate_batch(client, batch)
            for item in generated:
                wid = item["id"]
                cl  = item.get("choiceLabel")
                word = id_to_word[wid]["word"]
                if cl and cl.strip():
                    if re.search(r'[ァ-ヾー]{3,}', cl):
                        print(f"  [WARN] #{wid} {word}: カタカナ含む → スキップ: '{cl}'")
                        errors.append({"id": wid, "issue": f"katakana in choiceLabel: {cl}"})
                    else:
                        results[wid] = cl
                        print(f"  #{wid:4d}  {word:<20s}  → '{cl}'")
                else:
                    print(f"  #{wid:4d}  {word:<20s}  → null（不要と判定）")
        except Exception as e:
            print(f"  [ERROR] Batch {bi}: {e}")
            errors.append({"batch": bi, "error": str(e)})

        if bi < len(batches):
            time.sleep(0.5)

    # データに反映
    applied = 0
    for wid, cl in results.items():
        w = id_to_word.get(wid)
        if w:
            w["choiceLabel"] = cl
            applied += 1

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n=== 完了 ===")
    print(f"  choiceLabel 追加: {applied}件")
    print(f"  null（不要）:     {len(results) - applied + (len(candidates) - len(results))}件")
    print(f"  エラー:           {len(errors)}件")
    if errors:
        for e in errors:
            print(f"    {e}")

if __name__ == "__main__":
    main()
