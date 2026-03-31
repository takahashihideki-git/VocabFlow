"""
Distractor 後処理スクリプト
generate_word_data.py で生成した word_data_raw.json の distractors を
同カテゴリの実単語の意味に差し替える。

使用方法:
  python3 scripts/fix_distractors.py

入力:  scripts/results/word_data_raw.json
出力:  scripts/results/word_data_fixed.json
"""

import json, os, random

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
RAW_FILE    = os.path.join(SCRIPT_DIR, "results", "word_data_raw.json")
FIXED_FILE  = os.path.join(SCRIPT_DIR, "results", "word_data_fixed.json")

random.seed(42)


def get_primary_meaning(entry: dict) -> str | None:
    meanings = entry.get("meanings") or []
    if meanings:
        return meanings[0].get("meaning")
    return None


def main():
    if not os.path.exists(RAW_FILE):
        print(f"ERROR: {RAW_FILE} not found. Run generate_word_data.py first.")
        return

    with open(RAW_FILE, encoding="utf-8") as f:
        data = json.load(f)

    # カテゴリ別の (word_id, meaning) リストを構築
    # 同カテゴリ内の他の単語の意味をdistractor候補にする
    cat_pool: dict[int, list[tuple[int, str]]] = {}  # categoryId -> [(id, meaning)]
    for entry in data:
        cat_id = entry.get("categoryId", 0)
        meaning = get_primary_meaning(entry)
        if meaning:
            cat_pool.setdefault(cat_id, []).append((entry["id"], meaning))

    # 各単語のdistractorを置き換え
    replaced = 0
    kept = 0
    for entry in data:
        cat_id = entry.get("categoryId", 0)
        correct = get_primary_meaning(entry)
        word_id = entry["id"]

        # 同カテゴリの他単語の意味（自分自身を除く）
        candidates = [
            m for (wid, m) in cat_pool.get(cat_id, [])
            if wid != word_id and m != correct
        ]

        if len(candidates) >= 3:
            # ランダムに3つ選ぶ（毎回同じにならないようシャッフル）
            random.shuffle(candidates)
            # 重複なし・正解と一致なし
            chosen = []
            seen = set()
            for cand in candidates:
                if cand not in seen and cand != correct:
                    chosen.append(cand)
                    seen.add(cand)
                if len(chosen) == 3:
                    break
            if len(chosen) == 3:
                entry["distractors"] = chosen
                replaced += 1
                continue

        # 候補が足りない場合は既存を維持（警告を出す）
        print(f"  ⚠ word={entry['word']} (id={word_id}, cat={cat_id}): "
              f"not enough same-category candidates ({len(candidates)}), keeping original distractors")
        kept += 1

    with open(FIXED_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n=== fix_distractors complete ===")
    print(f"  Replaced: {replaced}")
    print(f"  Kept original: {kept}")
    print(f"  Output: {FIXED_FILE}")


if __name__ == "__main__":
    main()
