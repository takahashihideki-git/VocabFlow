#!/usr/bin/env python3
"""
Recall 誤答プロトタイプの AI 監査（distractor-generation-notes.md「プロトタイプ3回目」）

proto_recall_distractors.py の出力（語ごとの候補と Δ）を読み、各候補を空欄に入れた文が
「正解として通るか」を Claude に判定させる。Δ は見せない（判定を Δ に引きずらせないため）。
全候補を判定するので、Δ の帯ごとに「空欄に入る割合」が測れる＝しきい値を決める材料になる。

使い方:
  python3 scripts/proto_recall_audit.py scripts/results/proto_recall_sample30.json
  python3 scripts/proto_recall_audit.py IN.json --dry-run

出力: 入力と同じ場所に *_audit.json（候補ごとに verdict: fits / borderline / no を付けたもの）
      データファイルは書き換えない
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path

from env import load_env
load_env()   # リポジトリ直下の .env から ANTHROPIC_API_KEY を読む

import anthropic

DEFAULT_MODEL = "claude-sonnet-5"
MAX_TOKENS = 16000   # 思考ブロックも含む

SYSTEM_PROMPT = """You audit fill-in-the-blank vocabulary questions for Japanese learners of English.

The learner sees ONE sentence with a blank and picks a word from 4 choices.
Choices are shown in base form; the blank takes the inflected form given below.
A distractor is broken if putting it in the blank yields a sentence that a fair
English teacher would have to accept as correct.

For EACH candidate, independently judge the sentence with that candidate in the blank:
- "fits": grammatical and makes sense; a learner who picked it could fairly argue it is correct
  (synonyms, antonyms, and any other word that produces a sensible sentence all count)
- "borderline": grammatical, but the meaning is odd, strained, or needs an unusual reading
- anything else: clearly wrong (ungrammatical or nonsensical) — do not list it

Judge every candidate; do not stop early. Many or none may fit.
Reply with JSON only:
{"fits": ["word", ...], "borderline": ["word", ...]}
Use the candidate strings exactly as given."""


def build_prompt(t, forms):
    lines = "\n".join(f"- {f}" for f in forms)
    return (f"Sentence: {t['blank']}\n"
            f"Intended answer: {t['blankAnswer']}\n\n"
            f"Candidates (already inflected for the blank):\n{lines}")


def audit_one(client, model, t):
    forms = sorted({r['form'] for r in t['candidates']})
    random.Random(t['target']).shuffle(forms)
    res = client.messages.create(
        model=model, max_tokens=MAX_TOKENS, system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_prompt(t, forms)}])
    if res.stop_reason == "max_tokens":
        raise RuntimeError(f"{t['target']}: max_tokens で切り詰め")
    text = "".join(b.text for b in res.content if b.type == "text")
    m = re.search(r"\{.*\}", text, re.S)
    out = json.loads(m.group(0))
    return {f.lower() for f in out.get("fits", [])}, {f.lower() for f in out.get("borderline", [])}, res.usage


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src = Path(args.input)
    data = json.loads(src.read_text())
    targets = data["targets"]
    print(f"{len(targets)}語・候補計 {sum(len(t['candidates']) for t in targets)} 件（model={args.model}）")
    if args.dry_run:
        print(build_prompt(targets[0], [r['form'] for r in targets[0]['candidates']][:5]))
        return

    client = anthropic.Anthropic()
    tin = tout = 0
    for t in targets:
        fits, border, u = audit_one(client, args.model, t)
        tin, tout = tin + u.input_tokens, tout + u.output_tokens
        for r in t["candidates"]:
            f = r["form"].lower()
            r["verdict"] = "fits" if f in fits else "borderline" if f in border else "no"
        print(f"  {t['target']:<14} fits={len(fits):>2} borderline={len(border):>2}", flush=True)

    data["audit"] = {"model": args.model, "inputTokens": tin, "outputTokens": tout}
    out = src.with_name(src.stem + "_audit.json")
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print(f"tokens in={tin} out={tout} → {out}")


if __name__ == "__main__":
    sys.exit(main())
