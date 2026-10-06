#!/usr/bin/env python3
"""
audit_distractors.py のレポートで flag された誤答を差し替える（2026-10-06）

差し替え先は AI の suggestion ではなく、データ内の**他の単語の正解ラベル**から選ぶ。
AI 候補は「撤退する」「拒否する」等の使い回しと反義語に偏り、誤答が易しくなるため。

候補の条件:
  - 正解ラベル（meanings[0]）の品詞が対象語の正解と同じ
  - 同じカテゴリを優先（無ければ全カテゴリ）
  - カタカナ（2文字以上）を含まない
  - 対象語の正解・全 meanings・残りの誤答と訳語セグメントが重ならない（validate と同じ判定）
  - データ全体で誤答としての使用回数が少ないものを優先（使い回しを散らす）

使用方法:
  python3 scripts/fix_distractor_pos.py REPORT.json          # dry-run
  python3 scripts/fix_distractor_pos.py REPORT.json --apply
"""
import hashlib, json, os, re, sys
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from validate_word_data import meaning_segments, correct_choice_text  # noqa: E402

PATH = os.path.join(SCRIPT_DIR, "results", "word_data_final.json")

# 自動選択だと近義語・紛らわしい語を引くもの: (id, 候補) を使わない
BLOCK = {
    (171,  "収益、歳入"),             # income（収入）と同義
    (163,  "予算"),                   # resource（財源）と紛らわしい
    (77,   "端末機器"),               # 既存の誤答「装置、機器」と重なる
    (78,   "料理（の様式）、食文化"), # culture（文化）を含む
    (737,  "借りる、賃貸する"),       # owe（借りている）と紛らわしい
    (779,  "美的な、審美的な"),       # artistic（芸術的な）と近すぎる
    (1688, "古典的な、一流の"),       # antique（骨董品の）と近すぎる
    (545,  "料金、手数料"),           # expense（費用）と近すぎる
}
KATA2 = re.compile(r'[ァ-ヺー]{2,}')

POST_FIXES = [
    (847,  "領土・縄張り",       "小惑星"),             # orbit の別義「範囲・領域」と一致
    (1153, "固定観念、紋切り型", "罰則"),               # 既存の誤答「偏見、先入観」と重複
    (1188, "最高の、主要な",     "遠隔の、人里離れた"), # vertical の別義「頂点に関する」と一致
    (1204, "投資する",           "謝罪する"),           # venture（ベンチャー）の語義と重なる
    (1459, "樽",                 "記念碑"),             # 既存の誤答「樽、円筒形容器」と重複
    # AI 監査が見落とした品詞ずれ（語尾による簡易判定で発見）
    (1613, "偏見、先入観",       "〜を規制する、取り締まる"),  # convict は動詞
    (1613, "機関、施設",         "侵略する"),
    (1613, "地雷",               "拷問する、苦しめる"),
    (1872, "襲撃する、暴行する", "罰則"),               # bribe は名詞
    (1852, "調査する、探る",     "氷河"),               # basin は名詞
    (1154, "預ける、預金する",   "割引"),               # retail は名詞
]


def overlaps(a: str, b: str) -> bool:
    sa, sb = meaning_segments(a), meaning_segments(b)
    if sa & sb:
        return True
    return any(len(x) >= 3 and len(y) >= 3 and (x in y or y in x) for x in sa for y in sb)


def main():
    report = json.load(open(sys.argv[1], encoding="utf-8"))
    apply = "--apply" in sys.argv
    data = json.load(open(PATH, encoding="utf-8"))
    by_id = {w["id"]: w for w in data}
    usage = Counter(d for w in data for d in w["distractors"])

    pool = []   # (pos, categoryId, label, source id)
    for w in data:
        label = correct_choice_text(w)
        if not KATA2.search(label) and len(label) <= 20:
            pool.append((w["meanings"][0]["pos"], w["categoryId"], label, w["id"]))

    changes = 0
    for f in report["findings"]:
        w = by_id[f["id"]]
        flagged = {iss["distractor"] for iss in f["issues"]}   # 外した誤答を同じ語に戻さない
        pos = w["meanings"][0]["pos"]
        for iss in f["issues"]:
            old = iss["distractor"]
            if old not in w["distractors"]:
                print(f"  skip #{w['id']} {w['word']}: {old!r} が見つからない")
                continue
            idx = w["distractors"].index(old)
            others = [d for k, d in enumerate(w["distractors"]) if k != idx]
            avoid = [correct_choice_text(w)] + [m["meaning"] for m in w["meanings"]] + others

            def ok(c):
                return (c[0] == pos and c[3] != w["id"] and c[2] not in w["distractors"]
                        and c[2] not in flagged and (w["id"], c[2]) not in BLOCK
                        and not any(overlaps(c[2], a) for a in avoid))
            cands = [c for c in pool if ok(c) and c[1] == w["categoryId"]] or [c for c in pool if ok(c)]
            if not cands:
                print(f"  候補なし #{w['id']} {w['word']}: {old}")
                continue
            key = lambda c: (usage[c[2]], hashlib.md5(f"{w['id']}:{c[2]}".encode()).hexdigest())
            new = min(cands, key=key)[2]
            usage[old] -= 1
            usage[new] += 1
            w["distractors"][idx] = new
            changes += 1
            print(f"#{w['id']:4d} {w['word']:<14s} [{correct_choice_text(w)}] ({iss['type'][:3]}) {old}  →  {new}")
    # 差し替え後の再監査（--ids）で残ったもの。(id, 旧誤答, 新誤答)
    for i, old, new in POST_FIXES:
        ds = by_id[i]["distractors"]
        if old in ds:
            ds[ds.index(old)] = new
            changes += 1
            print(f"#{i:4d} {by_id[i]['word']:<14s} (再監査) {old}  →  {new}")
    print(f"\n差し替え: {changes}件")
    if apply:
        json.dump(data, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("→ 書き込みました")


if __name__ == "__main__":
    main()
