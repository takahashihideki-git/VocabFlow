"""
Phase 2: 機械的修正スクリプト
word_data_fixed.json を読み込み、以下を修正して word_data_phase2.json に保存する。

2-1. 句点なし修正: etymology/tips/confusables/trivia の文末に句読点を付与
2-2. collocations の日本語訳除去
2-3. audioHint の注釈除去（13件の特定エントリ）

実行: python3 scripts/phase2_fixes.py
"""

import json
import re
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
INPUT_FILE = os.path.join(RESULTS_DIR, "word_data_fixed.json")
OUTPUT_FILE = os.path.join(RESULTS_DIR, "word_data_phase2.json")

# -----------------------------------------------------------------
# 2-3: audioHint 修正テーブル（id → 正しい読み）
# -----------------------------------------------------------------
AUDIOHINT_FIXES = {
    37:   "オブジェクト",
    235:  "ウィンド",
    245:  "コントラスト",
    249:  "コンテント",
    373:  "デザート",
    410:  "テア",
    568:  "ミス",
    577:  "コントラクト",
    736:  "プロテスト",
    1129: "コンパウンド",
    1200: "インクラインド",
    1755: "レベル",
    1876: "ハラスメント",
}

# 文末に許容する句読点
PUNCT_OK = set("。！？!?）」")


def fix_punctuation(text: str) -> tuple[str, bool]:
    """文末に句読点がなければ。を付与。(変更後テキスト, 変更したか) を返す"""
    if not text:
        return text, False
    last = text.rstrip()  # 末尾空白は無視して判定
    if not last:
        return text, False
    if last[-1] in PUNCT_OK:
        return text, False
    return text.rstrip() + "。", True


def remove_jp_from_collocation(s: str) -> tuple[str, bool]:
    """
    collocation 文字列から日本語訳部分を除去する。
    全角括弧（...）と、内部に日本語を含む半角括弧(...)を除去。
    """
    original = s
    # 全角括弧（...）を除去
    s = re.sub(r"（[^）]*）", "", s)
    # 半角括弧内に日本語文字が含まれる場合も除去
    s = re.sub(r"\([^)]*[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF][^)]*\)", "", s)
    s = s.strip()
    return s, s != original


def has_japanese(s: str) -> bool:
    return bool(re.search(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", s))


def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        data = json.load(f)

    # 統計
    stats = {
        "punct_fixed": 0,
        "colloc_fixed": 0,
        "audiohint_fixed": 0,
    }
    punct_fields = ("etymology", "tips", "confusables", "trivia")

    for entry in data:
        entry_id = entry.get("id")

        # ---- 2-1. 句点なし修正 ----------------------------------------
        passive = entry.get("passive", {})
        for field in punct_fields:
            val = passive.get(field, "")
            if val:
                fixed, changed = fix_punctuation(val)
                if changed:
                    passive[field] = fixed
                    stats["punct_fixed"] += 1

        # ---- 2-2. collocations の日本語訳除去 --------------------------
        collocations = passive.get("collocations", [])
        new_collocations = []
        for item in collocations:
            fixed, changed = remove_jp_from_collocation(item)
            if changed:
                stats["colloc_fixed"] += 1
            new_collocations.append(fixed)
        passive["collocations"] = new_collocations

        # ---- 2-3. audioHint の注釈除去 ---------------------------------
        if entry_id in AUDIOHINT_FIXES:
            old = entry.get("audioHint", "")
            new = AUDIOHINT_FIXES[entry_id]
            if old != new:
                entry["audioHint"] = new
                stats["audiohint_fixed"] += 1

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("=== Phase 2 修正完了 ===")
    print(f"  2-1 句点付与:          {stats['punct_fixed']} 件")
    print(f"  2-2 日本語訳除去:      {stats['colloc_fixed']} 件")
    print(f"  2-3 audioHint 修正:    {stats['audiohint_fixed']} 件")
    print(f"  出力: {OUTPUT_FILE}")

    # ---- 後検証 --------------------------------------------------------
    print("\n=== 後検証 ===")
    punct_errors = []
    colloc_jp_errors = []
    audiohint_errors = []

    kana_pattern = re.compile(r"^[ァ-ヾー・]+$")

    for entry in data:
        eid = entry.get("id")
        passive = entry.get("passive", {})

        # 句点チェック
        for field in punct_fields:
            val = passive.get(field, "")
            if val and val[-1] not in PUNCT_OK:
                punct_errors.append((eid, field, val[-30:]))

        # collocations 日本語残存チェック
        for item in passive.get("collocations", []):
            if has_japanese(item):
                colloc_jp_errors.append((eid, item))

        # audioHint カタカナのみチェック
        ah = entry.get("audioHint", "")
        if ah and not kana_pattern.match(ah):
            audiohint_errors.append((eid, entry.get("word"), ah))

    if punct_errors:
        print(f"  [WARN] 句点未修正: {len(punct_errors)} 件")
        for e in punct_errors[:5]:
            print(f"    id={e[0]} {e[1]}: ...{e[2]!r}")
    else:
        print("  [OK] 全フィールド句点終わり")

    if colloc_jp_errors:
        print(f"  [WARN] collocations 日本語残存: {len(colloc_jp_errors)} 件")
        for e in colloc_jp_errors[:5]:
            print(f"    id={e[0]}: {e[1]!r}")
    else:
        print("  [OK] collocations 日本語ゼロ")

    if audiohint_errors:
        print(f"  [WARN] audioHint 非カタカナ残存: {len(audiohint_errors)} 件")
        for e in audiohint_errors[:10]:
            print(f"    id={e[0]} {e[1]}: {e[2]!r}")
    else:
        print("  [OK] audioHint 全件カタカナのみ")


if __name__ == "__main__":
    main()
