#!/usr/bin/env python3
"""
choiceLabel 生成スクリプト

Recognition カードの正解ラベルとして、カタカナ推測を防ぐ和語・漢語を
Claude API を使って生成し、word_data_final.json に追加する。

対象: audioHint とカタカナ meaning が音的に一致する語（約146語）

使用方法:
  python3 scripts/generate_choice_labels.py
  python3 scripts/generate_choice_labels.py --dry-run  # 候補リストのみ表示
"""

import json
import re
import sys
import time
import argparse
import anthropic

INPUT_PATH  = "scripts/results/word_data_final.json"
OUTPUT_PATH = "scripts/results/word_data_final.json"  # 上書き
BACKUP_PATH = "scripts/results/word_data_final.json.bk_choicelabel"

KATAKANA_RE = re.compile(r'[ァ-ヾー]{3,}')
# ヲン単独など音的に対応しない小カタカナ表現を除く

# ============================================================
# 候補語の特定
# ============================================================

def extract_katakana_from_meaning(meanings):
    """meanings のいずれかから3文字以上の連続カタカナを抽出"""
    for m in meanings:
        matches = KATAKANA_RE.findall(m.get("meaning", ""))
        if matches:
            return matches
    return []

def katakana_matches_audio_hint(katakana_list, audio_hint):
    """カタカナが audioHint と音的に一致するか判定"""
    if not audio_hint:
        return False
    ah = audio_hint.strip()
    for kata in katakana_list:
        # 先頭3文字が一致、または一方が他方を含む
        if ah[:3] == kata[:3]:
            return True
        if kata in ah or ah in kata:
            return True
        # 括弧を除去して比較
        kata_clean = re.sub(r'[（()）]', '', kata)
        ah_clean   = re.sub(r'[（()）]', '', ah)
        if ah_clean[:3] == kata_clean[:3]:
            return True
        if kata_clean in ah_clean or ah_clean in kata_clean:
            return True
    return False

def find_candidates(data):
    """choiceLabel が必要な候補語を返す"""
    candidates = []
    for w in data:
        # 既に choiceLabel が定義済みならスキップ
        if w.get("choiceLabel"):
            continue
        katakana_list = extract_katakana_from_meaning(w.get("meanings", []))
        if not katakana_list:
            continue
        audio_hint = w.get("audioHint", "")
        if katakana_matches_audio_hint(katakana_list, audio_hint):
            candidates.append({
                "id": w["id"],
                "word": w["word"],
                "pos": w["pos"],
                "meaning": w["meanings"][0]["meaning"],
                "audio_hint": audio_hint,
                "katakana_found": katakana_list,
            })
    return candidates

# ============================================================
# Claude API でバッチ生成
# ============================================================

BATCH_SIZE = 25

SYSTEM_PROMPT = """あなたは英語教材の日本語訳専門家です。
Recognition カード（英単語を見て日本語の意味を4択から選ぶ）の正解ラベルを生成します。

## ルール
1. カタカナ語（3文字以上の連続カタカナ）を含まないこと
2. 対象語の意味を正確に表していること
3. 自然な日本語（和語・漢語）であること
4. 20文字以内で簡潔に

## 出力形式
JSON配列で、入力と同じ順番で出力してください:
[
  {"id": 173, "choiceLabel": "蜘蛛の巣"},
  ...
]

choiceLabel が生成できない（和語での言い換えが極めて不自然な）場合は null を返してください。"""

def generate_batch(client, candidates_batch):
    """候補リストの一括生成（1バッチ）"""
    items = []
    for c in candidates_batch:
        items.append(
            f'id={c["id"]}, word="{c["word"]}", pos={c["pos"]}, '
            f'meaning="{c["meaning"]}", audioHint="{c["audio_hint"]}"'
        )
    user_content = "以下の語に choiceLabel を生成してください:\n\n" + "\n".join(items)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    text = response.content[0].text.strip()

    # JSON を抽出
    json_match = re.search(r'\[[\s\S]*\]', text)
    if not json_match:
        raise ValueError(f"JSON not found in response:\n{text[:300]}")
    return json.loads(json_match.group())

# ============================================================
# メイン処理
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="候補リストのみ表示して終了")
    args = parser.parse_args()

    with open(INPUT_PATH, encoding="utf-8") as f:
        data = json.load(f)

    candidates = find_candidates(data)
    print(f"候補語: {len(candidates)}件")

    if args.dry_run:
        for c in candidates:
            print(f"  #{c['id']:4d} {c['word']:20s} {c['meaning'][:40]:40s} audioHint={c['audio_hint']}")
        return

    # バックアップ
    import shutil
    shutil.copy(INPUT_PATH, BACKUP_PATH)
    print(f"バックアップ: {BACKUP_PATH}")

    client = anthropic.Anthropic()
    id_to_word = {w["id"]: w for w in data}

    results = {}   # id -> choiceLabel or None
    errors  = []

    batches = [candidates[i:i+BATCH_SIZE] for i in range(0, len(candidates), BATCH_SIZE)]
    print(f"\n{len(batches)}バッチで処理開始...\n")

    for bi, batch in enumerate(batches, 1):
        print(f"Batch {bi}/{len(batches)} ({len(batch)}語)...")
        try:
            generated = generate_batch(client, batch)
            for item in generated:
                wid = item["id"]
                cl  = item.get("choiceLabel")
                if cl and cl.strip():
                    # バリデーション: カタカナ3文字以上含まないこと
                    if re.search(r'[ァ-ヾー]{3,}', cl):
                        print(f"  [WARN] #{wid}: choiceLabel にカタカナ含む → スキップ: '{cl}'")
                        errors.append({"id": wid, "issue": f"katakana in choiceLabel: {cl}"})
                    else:
                        results[wid] = cl
                        print(f"  #{wid:4d} {id_to_word[wid]['word']:20s} → '{cl}'")
                else:
                    print(f"  #{wid:4d} {id_to_word[wid]['word']:20s} → null（スキップ）")
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

    # 保存
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n=== 完了 ===")
    print(f"  生成成功: {applied}件")
    print(f"  エラー:   {len(errors)}件")
    print(f"  出力: {OUTPUT_PATH}")
    if errors:
        print("  エラー詳細:")
        for e in errors:
            print(f"    {e}")


if __name__ == "__main__":
    main()
