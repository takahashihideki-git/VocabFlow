"""
Phase 3: 個別修正スクリプト
word_data_phase2.json を読み込み、手動判断が必要な項目を修正して
word_data_phase3.json に保存する。

修正項目:
  3-1. blankAnswer が対象語と無関係（#875 prefecture, #1249 syndrome）
  3-2. tips の論理的矛盾（#132 regard, #107 solve）
  3-3. trivia の虚偽記述（#1249 syndrome）
  3-4. confusableSpellings に正答が含まれる（#1562 makeup）
  3-5. crisis の trivia 俗説の扱い（#366 crisis）

実行: python3 scripts/phase3_fixes.py
"""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
INPUT_FILE  = os.path.join(RESULTS_DIR, "word_data_phase2.json")
OUTPUT_FILE = os.path.join(RESULTS_DIR, "word_data_phase3.json")


FIXES = {
    # 3-1. blankAnswer が対象語と無関係
    875: {
        "desc": "#875 prefecture: blankAnswer が 'Kyoto' → 対象語 'prefecture' に修正",
        "examples": [
            {
                "en": "Each prefecture in Japan has its own governor.",
                "ja": "日本の各都道府県にはそれぞれ知事がいる。",
                "blank": "Each ___ in Japan has its own governor.",
                "blankAnswer": "prefecture",
            }
        ],
    },
    1249: {
        "desc": "#1249 syndrome: blankAnswer が 'Down syndrome' → 対象語 'syndrome' に修正 / trivia も差し替え",
        "examples": [
            {
                "en": "Impostor syndrome is common among high achievers.",
                "ja": "インポスター症候群は優秀な人に多く見られる。",
                "blank": "Impostor ___ is common among high achievers.",
                "blankAnswer": "syndrome",
            }
        ],
        # 3-3 と同時に trivia も修正
        "trivia": (
            "心理学者ポーリン・クランスとスジャン・エイムズが1978年に初めて論文で使った語。"
            "「インポスター（詐欺師）症候群」は、優秀と評価される人が「自分は本当はたいしたことない」と感じる現象で、"
            "ノーベル賞受賞者や宇宙飛行士にも経験者がいると報告されている。"
        ),
    },

    # 3-2. tips の論理的矛盾
    132: {
        "desc": "#132 regard: tips の混同元 'consider A as B' → 'consider A to be B' に修正",
        "tips_fix": ("'consider A as B' と混同して", "'consider A to be B' と混同して"),
    },
    107: {
        "desc": "#107 solve: tips の矛盾（for を使うなと言った直後に for 付き例）を整合性ある説明に差し替え",
        "tips": (
            "solve は他動詞で 'solve the problem' のように直接目的語を取る。"
            "'solve for the problem' は誤り。"
            "ただし数学では 'solve for x'（xについて解く）という特殊な用法があり、"
            "この場合の for の後には「求める未知数」が来る点が異なる。"
        ),
    },

    # 3-4. confusableSpellings に正答が含まれる
    1562: {
        "desc": "#1562 makeup: confusableSpellings から 'makeUp' を除去し誤答スペルに差し替え",
        "confusableSpellings_remove": "makeUp",
        "confusableSpellings_add": ["make-up", "maikup"],
    },

    # 3-5. crisis の trivia（俗説の明記）
    366: {
        "desc": "#366 crisis: trivia の俗説を明記し、'機' の実際の意味を補足",
        "trivia": (
            "「危機＝危険＋機会」という解釈はジョン・F・ケネディが1959年の演説で広めたが、"
            "これは俗説で学術的には誤りとされる。"
            "漢字「機」の本来の意味は「きざし・転換点」であり「チャンス（好機）」ではない。"
            "英語圏では今もこの誤訳が motivational speech でしばしば引用される。"
        ),
    },
}


def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        data = json.load(f)

    index = {e["id"]: e for e in data}
    changed = []

    for entry_id, fix in FIXES.items():
        entry = index.get(entry_id)
        if not entry:
            print(f"[WARN] id={entry_id} が見つかりません")
            continue

        print(f"\n--- {fix['desc']}")

        # examples の差し替え
        if "examples" in fix:
            old = entry.get("examples", [])
            entry["examples"] = fix["examples"]
            print(f"  examples: {len(old)} → {len(fix['examples'])} 件に差し替え")

        # tips 全文差し替え
        if "tips" in fix:
            old = entry["passive"].get("tips", "")
            entry["passive"]["tips"] = fix["tips"]
            print(f"  tips 差し替え完了")

        # tips 部分置換
        if "tips_fix" in fix:
            old_str, new_str = fix["tips_fix"]
            tips = entry["passive"].get("tips", "")
            if old_str in tips:
                entry["passive"]["tips"] = tips.replace(old_str, new_str)
                print(f"  tips: '{old_str}' → '{new_str}'")
            else:
                print(f"  [WARN] tips に '{old_str}' が見つかりません（現状: {tips[:80]!r}）")

        # trivia 差し替え
        if "trivia" in fix:
            entry["passive"]["trivia"] = fix["trivia"]
            print(f"  trivia 差し替え完了")

        # confusableSpellings 修正
        if "confusableSpellings_remove" in fix:
            spellings = entry.get("confusableSpellings", [])
            remove = fix["confusableSpellings_remove"]
            add    = fix.get("confusableSpellings_add", [])
            if remove in spellings:
                spellings = [s for s in spellings if s != remove]
                print(f"  confusableSpellings: '{remove}' を除去")
            else:
                print(f"  [WARN] confusableSpellings に '{remove}' が見つかりません")
            for s in add:
                if s not in spellings:
                    spellings.append(s)
                    print(f"  confusableSpellings: '{s}' を追加")
            entry["confusableSpellings"] = spellings

        changed.append(entry_id)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n=== Phase 3 修正完了: {len(changed)} エントリ ===")
    print(f"  出力: {OUTPUT_FILE}")

    # ---- 後検証 --------------------------------------------------------
    print("\n=== 後検証 ===")
    errors = []
    for entry in data:
        eid = entry.get("id")
        word = entry.get("word", "")
        for ex in entry.get("examples", []):
            ba = ex.get("blankAnswer", "")
            stem = word[:3].lower()
            if ba and not ba.lower().startswith(stem):
                errors.append((eid, word, ba))

    if errors:
        print(f"  [WARN] blankAnswer が単語と不一致: {len(errors)} 件")
        for e in errors[:10]:
            print(f"    id={e[0]} '{e[1]}': blankAnswer='{e[2]}'")
    else:
        print("  [OK] blankAnswer 全件 単語語幹と一致")

    # confusableSpellings に正答なし確認
    spelling_errors = []
    for entry in data:
        word = entry.get("word", "").lower()
        for sp in entry.get("confusableSpellings", []):
            if sp.lower() == word:
                spelling_errors.append((entry["id"], word, sp))
    if spelling_errors:
        print(f"  [WARN] confusableSpellings に正答あり: {len(spelling_errors)} 件")
        for e in spelling_errors:
            print(f"    id={e[0]} word='{e[1]}' spelling='{e[2]}'")
    else:
        print("  [OK] confusableSpellings に正答なし")


if __name__ == "__main__":
    main()
