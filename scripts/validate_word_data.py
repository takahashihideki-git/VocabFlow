"""
Section 8 バリデーションスクリプト
word-data-spec.md §8 の全チェックを実行する。

使用方法:
  python3 scripts/validate_word_data.py [input_file]
  python3 scripts/validate_word_data.py [input_file] --strict-distractors  # 衝突を Error 扱い
  python3 scripts/validate_word_data.py [input_file] --collisions-json out.json

デフォルト入力: scripts/results/word_data_fixed.json
"""

import json, os, sys, re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

VALID_POS   = {"verb", "noun", "adjective", "adverb", "other"}
VALID_CEFR  = {"A1", "A2", "B1", "B2", "C1", "C2"}

# ============================================================
# distractor 近義衝突の検出（Recognition 四択が解けなくなるバグ）
#
# 完全一致（§8.2 の既存チェック）では #798 eager のような
# 「正解=熱心な、熱望している / 誤答=熱心な、情熱的な」を素通しするため、
# 訳語を区切り文字で分割したセグメント単位で照合する。
# ============================================================

PAREN_RE = re.compile(r'[（(][^）)]*[）)]')   # （〜を）等の補足は比較から外す
SEG_RE   = re.compile(r'[、,，・;；/／]')      # 訳語の区切り


def meaning_segments(text: str, min_len: int = 2) -> set[str]:
    """訳語を区切り文字で分割し、比較用セグメント集合を返す"""
    text = PAREN_RE.sub("", text or "")
    return {s.strip() for s in SEG_RE.split(text) if len(s.strip()) >= min_len}


def correct_choice_text(entry: dict) -> str:
    """Recognition 四択の正解ラベル（app/ui-cards.js getChoiceText と同じ fallback）"""
    meanings = entry.get("meanings") or []
    return entry.get("choiceLabel") or (meanings[0].get("meaning", "") if meanings else "")


def find_distractor_collisions(data: list[dict]) -> list[dict]:
    """distractor と正解ラベル・他 meaning の近義衝突を検出する

    kind:
      segment_match   — 正解ラベルと同じ訳語セグメントを含む（事実上の同義・致命的）
      containment     — 正解ラベルのセグメントと包含関係にある（例: 提案する / 〜を提案する）
      other_meaning   — その語の別 meaning と一致（誤答が実は正解）
    """
    findings = []

    for entry in data:
        word        = entry.get("word", f"<id={entry.get('id','?')}>")
        distractors = entry.get("distractors") or []
        correct     = correct_choice_text(entry)
        correct_segs = meaning_segments(correct)

        other_segs = set()
        for m in (entry.get("meanings") or [])[1:]:
            other_segs |= meaning_segments(m.get("meaning", ""))

        for d in distractors:
            d_segs = meaning_segments(d)

            shared = correct_segs & d_segs
            if shared:
                findings.append({
                    "id": entry.get("id"), "word": word, "kind": "segment_match",
                    "correct": correct, "distractor": d, "shared": sorted(shared),
                })
                continue

            contained = None
            for a in correct_segs:
                for b in d_segs:
                    if len(a) >= 3 and len(b) >= 3 and (a in b or b in a):
                        contained = f"{a} / {b}"
                        break
                if contained:
                    break
            if contained:
                findings.append({
                    "id": entry.get("id"), "word": word, "kind": "containment",
                    "correct": correct, "distractor": d, "shared": [contained],
                })
                continue

            shared_other = other_segs & d_segs
            if shared_other:
                findings.append({
                    "id": entry.get("id"), "word": word, "kind": "other_meaning",
                    "correct": correct, "distractor": d, "shared": sorted(shared_other),
                })

    return findings


def validate(data: list[dict]) -> tuple[list[str], list[str]]:
    errors   = []  # エラー（修正必要）
    warnings = []  # 警告（品質向上推奨）

    seen_ids = set()

    for entry in data:
        word = entry.get("word", f"<id={entry.get('id','?')}>")
        eid  = entry.get("id")

        # ============================================================
        # §8.1 必須フィールドチェック
        # ============================================================

        # id が 1-1900 の範囲で一意
        if eid is None:
            errors.append(f"[{word}] id missing")
        elif not (1 <= eid <= 1900):
            errors.append(f"[{word}] id={eid} out of range 1-1900")
        elif eid in seen_ids:
            errors.append(f"[{word}] id={eid} is not unique")
        else:
            seen_ids.add(eid)

        # word が空でない
        if not entry.get("word"):
            errors.append(f"[{word}] word is empty")

        # pos が有効値
        pos = entry.get("pos")
        if not pos:
            errors.append(f"[{word}] pos missing")
        elif pos not in VALID_POS:
            errors.append(f"[{word}] pos='{pos}' invalid (must be one of {VALID_POS})")

        # categoryId が 0-18 の範囲
        cat = entry.get("categoryId")
        if cat is None:
            errors.append(f"[{word}] categoryId missing")
        elif not (0 <= cat <= 18):
            errors.append(f"[{word}] categoryId={cat} out of range 0-18")

        # meanings が1つ以上
        meanings = entry.get("meanings") or []
        if len(meanings) == 0:
            errors.append(f"[{word}] meanings is empty")

        # examples が1つ以上
        examples = entry.get("examples") or []
        if len(examples) == 0:
            errors.append(f"[{word}] examples is empty")

        # distractors が3つ以上
        distractors = entry.get("distractors") or []
        if len(distractors) < 3:
            errors.append(f"[{word}] distractors has {len(distractors)} entries (need 3+)")

        # ============================================================
        # §8.2 整合性チェック
        # ============================================================

        # examples[].blank に "___" が含まれている
        for i, ex in enumerate(examples):
            blank = ex.get("blank") or ""
            if "___" not in blank:
                errors.append(f"[{word}] examples[{i}].blank missing '___': '{blank[:60]}'")
            if not ex.get("blankAnswer"):
                errors.append(f"[{word}] examples[{i}].blankAnswer is empty")

        # distractors に meanings[0].meaning と同一のものがない
        correct_meaning = meanings[0].get("meaning") if meanings else ""
        if correct_meaning and correct_meaning in distractors:
            errors.append(f"[{word}] distractor duplicates correct answer '{correct_meaning}'")

        # choiceLabel バリデーション（定義されている場合のみ）
        choice_label = entry.get("choiceLabel")
        if choice_label is not None:
            if not choice_label.strip():
                errors.append(f"[{word}] choiceLabel is empty string (use undefined instead)")
            elif re.search(r'[ァ-ヾー]{3,}', choice_label):
                errors.append(f"[{word}] choiceLabel contains katakana (3+ chars): '{choice_label}'")
            elif choice_label in distractors:
                errors.append(f"[{word}] choiceLabel duplicates a distractor: '{choice_label}'")

        # distractors 同士に重複がない
        if len(distractors) != len(set(distractors)):
            errors.append(f"[{word}] distractors contain duplicates: {distractors}")

        # confusableSpellings に正しいスペル (word) が含まれていない
        conf_sp = entry.get("confusableSpellings") or []
        if word in conf_sp:
            errors.append(f"[{word}] confusableSpellings contains correct spelling '{word}'")

        # ============================================================
        # §8.3 品質チェック（警告レベル）
        # ============================================================

        # pronunciation が "/" で囲まれている
        pron = entry.get("pronunciation") or ""
        if pron and not (pron.startswith("/") and pron.endswith("/")):
            warnings.append(f"[{word}] pronunciation not wrapped in '/': '{pron}'")

        # syllables にハイフンが含まれている
        syl = entry.get("syllables") or ""
        if syl and "-" not in syl:
            warnings.append(f"[{word}] syllables has no hyphen: '{syl}'")

        # examples[].en が 20語以内
        for i, ex in enumerate(examples):
            en = ex.get("en") or ""
            word_count = len(en.split())
            if word_count > 20:
                warnings.append(f"[{word}] examples[{i}].en has {word_count} words (max 20): '{en[:60]}...'")

        # cefr が有効値
        cefr = entry.get("cefr") or ""
        if cefr and cefr not in VALID_CEFR:
            warnings.append(f"[{word}] cefr='{cefr}' invalid (must be one of {VALID_CEFR})")

        # frequency が 1-100000 の範囲
        freq = entry.get("frequency")
        if freq is not None:
            if not isinstance(freq, int) or not (1 <= freq <= 100000):
                warnings.append(f"[{word}] frequency={freq} out of range 1-100000")

    # id の連続性チェック（欠番があれば警告）
    expected_ids = set(range(1, 1901))
    missing = expected_ids - seen_ids
    if missing:
        missing_sorted = sorted(missing)
        if len(missing_sorted) <= 20:
            warnings.append(f"Missing ids: {missing_sorted}")
        else:
            warnings.append(f"Missing {len(missing_sorted)} ids: {missing_sorted[:10]}...")

    return errors, warnings


COLLISION_LABELS = {
    "segment_match": "正解と同じ訳語（事実上の同義）",
    "containment":   "正解と包含関係",
    "other_meaning": "その語の別 meaning と一致（誤答が実は正解）",
}


def main():
    args = [a for a in sys.argv[1:]]
    strict_distractors = "--strict-distractors" in args
    args = [a for a in args if a != "--strict-distractors"]

    collisions_json = None
    if "--collisions-json" in args:
        i = args.index("--collisions-json")
        collisions_json = args[i + 1] if i + 1 < len(args) else \
            os.path.join(SCRIPT_DIR, "results", "distractor_collisions.json")
        del args[i:i + 2]

    input_file = args[0] if args else \
        os.path.join(SCRIPT_DIR, "results", "word_data_fixed.json")

    if not os.path.exists(input_file):
        # fallback to raw
        fallback = os.path.join(SCRIPT_DIR, "results", "word_data_raw.json")
        if os.path.exists(fallback):
            print(f"Note: fixed file not found, using {fallback}")
            input_file = fallback
        else:
            print(f"ERROR: {input_file} not found")
            sys.exit(1)

    with open(input_file, encoding="utf-8") as f:
        data = json.load(f)

    print(f"Validating {len(data)} entries from {input_file}")
    errors, warnings = validate(data)
    collisions = find_distractor_collisions(data)

    print(f"\n=== Errors ({len(errors)}) ===")
    for e in errors:
        print(f"  ✗ {e}")

    print(f"\n=== Warnings ({len(warnings)}) ===")
    for w in warnings:
        print(f"  ⚠ {w}")

    print(f"\n=== Distractor collisions ({len(collisions)}) ===")
    for c in collisions:
        print(f"  ! #{c['id']:4d} {c['word']:<16s} [{COLLISION_LABELS[c['kind']]}]")
        print(f"      正解: {c['correct']}")
        print(f"      誤答: {c['distractor']}   （重複: {'、'.join(c['shared'])}）")

    if collisions_json:
        with open(collisions_json, "w", encoding="utf-8") as f:
            json.dump(collisions, f, ensure_ascii=False, indent=2)
        print(f"\n  → {collisions_json} に保存")

    print(f"\n=== Summary ===")
    print(f"  Entries:    {len(data)}")
    print(f"  Errors:     {len(errors)}")
    print(f"  Warnings:   {len(warnings)}")
    print(f"  Collisions: {len(collisions)}"
          f"{' (--strict-distractors: Error 扱い)' if strict_distractors else ''}")

    if strict_distractors and collisions:
        errors = errors + [
            f"[{c['word']}] distractor collides with correct answer "
            f"({COLLISION_LABELS[c['kind']]}): '{c['distractor']}' vs '{c['correct']}'"
            for c in collisions
        ]

    if errors:
        # エラーレポートをファイルに保存
        report_file = os.path.join(SCRIPT_DIR, "results", "validation_report.txt")
        with open(report_file, "w", encoding="utf-8") as f:
            f.write(f"Errors: {len(errors)}\n")
            for e in errors:
                f.write(f"  {e}\n")
            f.write(f"\nWarnings: {len(warnings)}\n")
            for w in warnings:
                f.write(f"  {w}\n")
        print(f"\nReport saved to: {report_file}")
        sys.exit(1)
    else:
        print("\n✓ All required fields valid!")
        sys.exit(0)


if __name__ == "__main__":
    main()
