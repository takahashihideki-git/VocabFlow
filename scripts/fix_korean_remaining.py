#!/usr/bin/env python3
"""
Step 2 で追加発見された韓国語（ハングル）混入の修正
入力: scripts/results/word_data_distractor_fixed.json（Step 1-7 適用済み）
出力: scripts/results/word_data_distractor_fixed.json（上書き）
"""

import json
import re

PATH = "scripts/results/word_data_distractor_fixed.json"

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

id_to_word = {w["id"]: w for w in data}
changes = []

def log(msg):
    print(msg)
    changes.append(msg)

# ===================================================
# 発見された韓国語混入の一覧と修正内容
# ===================================================

# --- distractors ---

# '無傷の、손상されていない' → '無傷の、損傷されていない'
# 影響: #99 correct, #492 unknown, #696 raw, #1495 sole
for wid in [99, 492, 696, 1495]:
    w = id_to_word[wid]
    for i, d in enumerate(w["distractors"]):
        if "손상" in d:
            old = d
            w["distractors"][i] = d.replace("손상されていない", "損傷されていない")
            log(f"[Fix] #{wid} {w['word']}: distractor '{old}' → '{w['distractors'][i]}'")

# '〜をざっと見る、훑어보다' → '〜をざっと見る、斜め読みする'
# 影響: #134 search, #638 eliminate, #1038 persist, #1730 impair
for wid in [134, 638, 1038, 1730]:
    w = id_to_word[wid]
    for i, d in enumerate(w["distractors"]):
        if "훑어보다" in d:
            old = d
            w["distractors"][i] = d.replace("훑어보다", "斜め読みする")
            log(f"[Fix] #{wid} {w['word']}: distractor '{old}' → '{w['distractors'][i]}'")

# --- meanings ---

# #879 precious: '高価な、귀중한' → '高価な、貴重な'
w879 = id_to_word[879]
for m in w879["meanings"]:
    if "귀중한" in m["meaning"]:
        old = m["meaning"]
        m["meaning"] = old.replace("귀중한", "貴重な")
        log(f"[Fix] #879 precious: meaning '{old}' → '{m['meaning']}'")

# #926 scan: '〜をざっと見る、훑어보다' → '〜をざっと見る、斜め読みする'
w926 = id_to_word[926]
for m in w926["meanings"]:
    if "훑어보다" in m["meaning"]:
        old = m["meaning"]
        m["meaning"] = old.replace("훑어보다", "斜め読みする")
        log(f"[Fix] #926 scan: meaning '{old}' → '{m['meaning']}'")

# --- passive.etymology ---

# #333 surround: '넘치다・溢れる' → '溢れる'
w333 = id_to_word[333]
if w333.get("passive", {}).get("etymology"):
    old = w333["passive"]["etymology"]
    if "넘치다" in old:
        w333["passive"]["etymology"] = old.replace("넘치다・", "")
        log(f"[Fix] #333 surround: etymology '{old[:60]}...' → ハングル除去")

# #1192 abundant: '넘れ流れる' → '流れ出る'
w1192 = id_to_word[1192]
if w1192.get("passive", {}).get("etymology"):
    old = w1192["passive"]["etymology"]
    if "넘れ" in old:
        w1192["passive"]["etymology"] = old.replace("넘れ流れる", "流れ出る")
        log(f"[Fix] #1192 abundant: etymology '{old[:60]}...' → ハングル除去")

# ===================================================
# 最終スキャン: ハングルが残っていないか確認
# ===================================================
print("\n=== 最終ハングル残存スキャン ===")
korean_re = re.compile(r"[\uAC00-\uD7AF]")
remaining = []

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
            remaining.append(f"  #{w['id']} {w['word']}: [{field_name}] {text[:80]}")

if remaining:
    print(f"⚠ 残存 {len(remaining)}件:")
    for r in remaining:
        print(r)
else:
    print("ハングル残存なし ✓")

# ===================================================
# 上書き保存
# ===================================================
with open(PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\n=== 完了: {len(changes)}件修正 ===")
for c in changes:
    print(f"  {c}")
