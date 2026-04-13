#!/usr/bin/env python3
"""
VocabFlow 追加品質修正スクリプト
指示書: vocabflow-distractor-fix-instructions.md に従い順番に実行

Step 1: #1700 intact の韓国語修正
Step 2: 韓国語・中国語の全件スキャン
Step 3: 致命的 distractor 7件の差し替え
Step 4: 要注意 distractor 5件の判断・差し替え
Step 5: 差し替え後の再検証
Step 6: カタカナのみ meaning 9語に和語・漢語の言い換えを追加
Step 7: カタカナ meaning 146語の語順確認
"""

import json
import re
import sys

INPUT_PATH = "scripts/results/word_data_final.json"
OUTPUT_PATH = "scripts/results/word_data_distractor_fixed.json"

with open(INPUT_PATH, encoding="utf-8") as f:
    data = json.load(f)

id_to_word = {w["id"]: w for w in data}

changes = []

def log(msg):
    print(msg)
    changes.append(msg)

# ============================================================
# Step 1: #1700 intact の韓国語修正
# ============================================================
print("\n=== Step 1: #1700 intact の韓国語修正 ===")
w1700 = id_to_word[1700]
for m in w1700["meanings"]:
    if "손상" in m["meaning"]:
        old = m["meaning"]
        m["meaning"] = "無傷の、損傷されていない"
        log(f"[Fix] #1700 intact: meaning '{old}' → '{m['meaning']}'")

# ============================================================
# Step 2: 韓国語・中国語の全件スキャン
# ============================================================
print("\n=== Step 2: 韓国語・中国語の全件スキャン ===")
korean_re = re.compile(r"[\uAC00-\uD7AF]")  # ハングル
chinese_re = re.compile(r"[\u4E00-\u9FFF\u3400-\u4DBF]")  # CJK統合漢字（日本語漢字も含むので注意）

# 日本語でも使う漢字は除外できないので、ハングルのみ確実に検出
found_korean = []
for w in data:
    fields_to_check = []
    for m in w.get("meanings", []):
        fields_to_check.append(("meanings.meaning", m["meaning"]))
    for d in w.get("distractors", []):
        fields_to_check.append(("distractors", d))
    for e in w.get("examples", []):
        if e.get("ja"):
            fields_to_check.append(("examples.ja", e["ja"]))
    passive = w.get("passive", {}) or {}
    for key in ["etymology", "tips", "confusables", "trivia"]:
        if passive.get(key):
            fields_to_check.append((f"passive.{key}", passive[key]))

    for field_name, text in fields_to_check:
        if korean_re.search(text):
            found_korean.append(f"  #{ w['id']} {w['word']}: [{field_name}] {text[:80]}")

if found_korean:
    print("韓国語（ハングル）検出:")
    for s in found_korean:
        print(s)
else:
    print("韓国語（ハングル）: 検出なし ✓")

# ============================================================
# Step 3 & 4: distractor 差し替え
# ============================================================
print("\n=== Step 3: 致命的 distractor 7件の差し替え ===")

# 差し替え対象（致命的7件 + 要注意5件）
# 差し替え先は: 同品詞・意味が明確に異なる・他の類義語と重複しない、を条件に選定

fixes = {
    # 致命的7件
    400: {
        # nevertheless: 「それにもかかわらず、それでもやはり」(= #1000 nonetheless) を差し替え
        "old": "それにもかかわらず、それでもやはり",
        "new": "その後、続いて",  # subsequently (#1049) の意味
        "reason": "致命的: #1000 nonetheless の meaning と同一"
    },
    1000: {
        # nonetheless: distractors に #400 nevertheless・#497 regardless の meaning が両方含まれている
        # まとめて差し替え（複数）
        "multi": [
            {
                "old": "それにもかかわらず、それでも",
                "new": "その結果として、したがって",
                "reason": "致命的: #400 nevertheless の meaning と同一"
            },
            {
                "old": "それにもかかわらず、とにかく",
                "new": "その間に、一方で",
                "reason": "致命的: #497 regardless の meaning と同一"
            }
        ]
    },
    357: {
        # vote: 「世論調査・投票」(= #1062 poll の meaning) を差し替え
        "old": "世論調査・投票",
        "new": "〜を脅かす、危険にさらす",  # threaten 系
        "reason": "致命的: #1062 poll の meaning と同一"
    },
    1383: {
        # indispensable: 「不可欠な、極めて重要な」(= #584 vital の meaning) を差し替え
        "old": "不可欠な、極めて重要な",
        "new": "任意の、選択的な",
        "reason": "致命的: #584 vital の meaning と同一"
    },
    1389: {
        # fragile: 「繊細な、壊れやすい」(= #1283 delicate の meaning) を差し替え
        "old": "繊細な、壊れやすい",
        "new": "丈夫な、頑丈な",
        "reason": "致命的: #1283 delicate の meaning と同一（正反対の意味で差し替え）"
    },
    1399: {
        # inherent: 「先住民の；固有の」(= #1189 indigenous の meaning) を差し替え
        "old": "先住民の；固有の",
        "new": "後天的な、習得された",
        "reason": "致命的: #1189 indigenous の meaning と同一"
    },
}

print("\n=== Step 4: 要注意 distractor 5件の差し替え ===")

fixes_caution = {
    100: {
        # despite (前置詞): 「それにもかかわらず、それでも」(= #400 nevertheless の meaning)
        # 品詞が異なる（前置詞 vs 副詞）が混乱を招くので差し替え
        "old": "それにもかかわらず、それでも",
        "new": "〜のおかげで、〜によって",
        "reason": "要注意: #400 nevertheless の meaning と同一（品詞異なるが紛らわしい）"
    },
    497: {
        # regardless: 「それにもかかわらず、それでもやはり」(= #1000 nonetheless の meaning)
        "old": "それにもかかわらず、それでもやはり",
        "new": "条件付きで、場合によっては",
        "reason": "要注意: #1000 nonetheless の meaning と同一"
    },
    283: {
        # vast: 「巨大な、莫大な」(= #1582 immense の meaning)
        "old": "巨大な、莫大な",
        "new": "小さな、わずかな",
        "reason": "要注意: #1582 immense の meaning と同一（正反対の意味で差し替え）"
    },
    1100: {
        # versus: 「〜であるのに対して、一方で」(= #300 whereas の meaning)
        "old": "〜であるのに対して、一方で",
        "new": "〜に加えて、さらに",
        "reason": "要注意: #300 whereas の meaning と同一"
    },
    1379: {
        # outstanding: 「壮大な、素晴らしい」(= #1298 magnificent の meaning)
        "old": "壮大な、素晴らしい",
        "new": "平凡な、普通の",
        "reason": "要注意: #1298 magnificent の meaning と同一（正反対の意味で差し替え）"
    },
}

all_fixes = {**fixes, **fixes_caution}

for wid, fix_info in all_fixes.items():
    w = id_to_word[wid]
    if "multi" in fix_info:
        for fix in fix_info["multi"]:
            for i, d in enumerate(w["distractors"]):
                if d == fix["old"]:
                    w["distractors"][i] = fix["new"]
                    log(f"[Fix] #{wid} {w['word']}: distractor '{fix['old']}' → '{fix['new']}' ({fix['reason']})")
                    break
            else:
                print(f"[WARN] #{wid} {w['word']}: distractor '{fix['old']}' が見つからない（既修正?）")
    else:
        for i, d in enumerate(w["distractors"]):
            if d == fix_info["old"]:
                w["distractors"][i] = fix_info["new"]
                log(f"[Fix] #{wid} {w['word']}: distractor '{fix_info['old']}' → '{fix_info['new']}' ({fix_info['reason']})")
                break
        else:
            print(f"[WARN] #{wid} {w['word']}: distractor '{fix_info['old']}' が見つからない（既修正?）")

# ============================================================
# Step 5: 差し替え後の再検証（meaning と完全一致するdistractorがないか）
# ============================================================
print("\n=== Step 5: 差し替え後の再検証 ===")

# 全 meaning の辞書を構築
all_meanings = {}  # meaning_text -> [(id, word)]
for w in data:
    for m in w.get("meanings", []):
        key = m["meaning"].strip()
        if key not in all_meanings:
            all_meanings[key] = []
        all_meanings[key].append((w["id"], w["word"]))

collisions = []
for w in data:
    for d in w.get("distractors", []):
        d_stripped = d.strip()
        if d_stripped in all_meanings:
            # 自分自身の meaning との一致は除外
            others = [(oid, oword) for oid, oword in all_meanings[d_stripped] if oid != w["id"]]
            if others:
                collisions.append(
                    f"  #{w['id']} {w['word']}: distractor='{d}' が #{others[0][0]} {others[0][1]} の meaning と一致"
                )

if collisions:
    print("再検証で残存する衝突:")
    for c in collisions:
        print(c)
else:
    print("衝突なし ✓")

# ============================================================
# Step 6: カタカナのみ meaning 9語に和語・漢語の言い換えを追加
# ============================================================
print("\n=== Step 6: カタカナのみ meaning 9語の修正 ===")

katakana_fixes = {
    173: {
        "old": "（ウェブ）サイト",
        "new": "ウェブサイト、（インターネット上の）敷地",
        "word": "site"
    },
    361: {
        "old": "ウェブ、インターネット",
        "new": "インターネット（の）、ウェブ",
        "word": "web"
    },
    783: {
        "old": "コンクリート製の",
        "new": "コンクリート製の、具体的な",
        "word": "concrete"
    },
    853: {
        "old": "ショッピングモール",
        "new": "大型商業施設、ショッピングモール",
        "word": "mall"
    },
    1055: {
        "old": "ペナルティ（スポーツ）",
        "new": "罰則、ペナルティ",
        "word": "penalty"
    },
    1076: {
        "old": "ファンタジー（ジャンル）",
        "new": "空想、ファンタジー",
        "word": "fantasy"
    },
    1354: {
        "old": "ホラー（ジャンル）",
        "new": "恐怖、ホラー",
        "word": "horror"
    },
    1355: {
        "old": "（データの）クラスター",
        "new": "集団、群れ、クラスター",
        "word": "cluster"
    },
    1645: {
        "old": "樽、バレル",
        "new": "樽、円筒形容器",
        "word": "barrel"
    },
}

for wid, fix in katakana_fixes.items():
    w = id_to_word[wid]
    for m in w["meanings"]:
        if m["meaning"] == fix["old"]:
            m["meaning"] = fix["new"]
            log(f"[Fix] #{wid} {fix['word']}: meaning '{fix['old']}' → '{fix['new']}' (カタカナのみ → 和語・漢語追加)")
            break
    else:
        print(f"[WARN] #{wid} {fix['word']}: meaning '{fix['old']}' が見つからない")

# ============================================================
# Step 7: カタカナ meaning 146語の語順確認（カタカナが先頭にある場合のみ報告）
# ============================================================
print("\n=== Step 7: カタカナ meaning の語順スキャン ===")

katakana_re = re.compile(r"^[ァ-ヶー・（）()「」\s]+")  # カタカナ始まり

leading_katakana = []
for w in data:
    for m in w.get("meanings", []):
        if katakana_re.match(m["meaning"]) and len(m["meaning"]) > 3:
            leading_katakana.append(f"  #{w['id']} {w['word']}: '{m['meaning']}'")

if leading_katakana:
    print(f"カタカナ始まりの meaning: {len(leading_katakana)}件（手動確認推奨）")
    for s in leading_katakana[:30]:
        print(s)
    if len(leading_katakana) > 30:
        print(f"  ... 他 {len(leading_katakana) - 30}件")
else:
    print("カタカナ始まりの meaning: なし ✓")

# ============================================================
# 出力
# ============================================================
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\n=== 完了 ===")
print(f"出力: {OUTPUT_PATH}")
print(f"変更件数: {len(changes)} 件")
for c in changes:
    print(f"  {c}")
