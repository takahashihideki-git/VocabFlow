#!/usr/bin/env python3
"""
distractor 近義衝突の AI 監査スクリプト

Recognition カード（英単語 → 日本語の意味を4択）の誤答選択肢が
正解と実質同義になっていないか（＝正解が選べない設問になっていないか）を
Claude API に一定語数ずつ渡して判定させる。

validate_word_data.py の機械的チェック（訳語セグメント一致）は
表記が同じ場合しか捕まえられない。「熱心な」vs「意欲的な」のような
表記は違うが同義、という取りこぼしを埋めるのがこのスクリプト。

使用方法:
  export ANTHROPIC_API_KEY=...
  python3 scripts/audit_distractors.py --dry-run          # 対象件数と概算コストのみ
  python3 scripts/audit_distractors.py --limit 100        # 先頭100語で試す
  python3 scripts/audit_distractors.py                    # 全1900語
  python3 scripts/audit_distractors.py --ids 798,894,1294 # 特定語のみ
  python3 scripts/audit_distractors.py --model claude-opus-5   # 判定を上位モデルで再確認

出力: scripts/results/distractor_audit.json（フラグの立った語のみ）
      データファイルは書き換えない（人間が確認して修正する）
"""

import argparse
import json
import os
import re
import sys
import time

import anthropic

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
INPUT_PATH  = os.path.join(SCRIPT_DIR, "results", "word_data_final.json")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "results", "distractor_audit.json")

DEFAULT_MODEL = "claude-sonnet-5"
BATCH_SIZE    = 20
MAX_RETRIES   = 2
MAX_TOKENS    = 8192   # 指摘が多いバッチは出力が伸びる。超過時は自動で分割

# Sonnet 5 の概算単価（$/1M tokens・導入価格）。コスト表示は目安。
PRICE_IN, PRICE_OUT = 2.0, 10.0

SYSTEM_PROMPT = """あなたは英単語学習アプリの設問品質を監査する日本語の専門家です。

## 設問の形式
学習者は英単語を1つ見て、その意味を日本語4択から選びます。
choices = [正解ラベル] + [誤答3つ]（順序はランダム）。

## タスク
各エントリには誤答が3つあります。**3つを1つずつ独立に評価**し、
該当するものを**すべて** issues に列挙してください。
1つのエントリで2件以上該当することは珍しくありません。
1件見つけた時点で残りの評価を打ち切らないこと。

【flag すべきもの】
- synonym   : 正解ラベルと実質同義で、学習者が正解を一意に選べない
              例: 正解「熱心な、熱望している」/ 誤答「熱心な、情熱的な」
- valid     : その英単語の別の意味として実際に正しい（誤答なのに正解）
              例: twist の誤答に「曲がる」
- vague     : 表記は違うが意味の差が微妙すぎて、上級者でも根拠を持って除外できない
- duplicate : 誤答どうしが実質同義で、選択肢として重複している
              例: 誤答に「名声、威信」と「評判、名声」が併存

【flag しないもの】
- 意味が明確に異なるもの。品詞や用法がずれていても、意味が別なら問題ない
- 単に「難しい」「紛らわしい」だけのもの。良い誤答は本来まぎらわしい
- 正解の反義語・関連語

判定は保守的に。確信が持てないものは flag しない。

## 出力形式
問題のあるエントリだけを JSON 配列で出力してください（無ければ []）。
説明文やコードフェンスは付けず、JSON のみを出力すること。

（下の例は issues が2件のエントリ。1件のこともあれば3件のこともある）

[
  {
    "id": 798,
    "word": "eager",
    "issues": [
      {
        "distractor": "熱心な、情熱的な",
        "type": "synonym",
        "reason": "正解「熱心な、熱望している」と実質同義で区別できない",
        "suggestion": "気乗りしない、消極的な"
      },
      {
        "distractor": "意欲的な、前向きな",
        "type": "synonym",
        "reason": "これも正解と同義。3つ目の誤答まで評価した結果",
        "suggestion": "無口な、寡黙な"
      }
    ]
  }
]

suggestion は差し替え候補の日本語訳。以下を満たすこと:
1. 正解とも他の誤答とも意味がはっきり異なる
2. その英単語のどの意味とも一致しない
3. カタカナ3文字以上を含まない
4. 20文字以内"""


def correct_choice_text(entry: dict) -> str:
    """Recognition 四択の正解ラベル（app/ui-cards.js getChoiceText と同じ fallback）"""
    meanings = entry.get("meanings") or []
    return entry.get("choiceLabel") or (meanings[0].get("meaning", "") if meanings else "")


def build_entries(data: list[dict], ids: set[int] | None,
                  start: int, limit: int | None) -> list[dict]:
    entries = []
    for w in data:
        if ids is not None and w["id"] not in ids:
            continue
        entries.append({
            "id":          w["id"],
            "word":        w["word"],
            "pos":         w.get("pos", ""),
            "correct":     correct_choice_text(w),
            "meanings":    [m.get("meaning", "") for m in (w.get("meanings") or [])],
            "distractors": w.get("distractors") or [],
        })
    if ids is None:
        entries = entries[start:]
        if limit is not None:
            entries = entries[:limit]
    return entries


def format_batch(batch: list[dict]) -> str:
    lines = []
    for e in batch:
        lines.append(
            f'id={e["id"]}, word="{e["word"]}" ({e["pos"]})\n'
            f'  正解ラベル: {e["correct"]}\n'
            f'  全 meanings: {" / ".join(e["meanings"])}\n'
            f'  誤答: {" / ".join(e["distractors"])}'
        )
    return "以下のエントリを監査してください:\n\n" + "\n\n".join(lines)


class Truncated(Exception):
    """max_tokens に達して JSON が途中で切れた"""


def _call_once(client, model: str, batch: list[dict]) -> tuple[list[dict], dict]:
    response = client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": format_batch(batch)}],
    )
    usage = {
        "input_tokens":  response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    # 切り詰めは JSON 崩れとして現れるので、原因を取り違えないよう先に判定する
    if response.stop_reason == "max_tokens":
        raise Truncated(f"max_tokens({MAX_TOKENS}) に到達 / {len(batch)}語")
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    m = re.search(r'\[[\s\S]*\]', text)
    if not m:
        raise ValueError(f"JSON not found:\n{text[:300]}")
    return json.loads(m.group()), usage


def audit_batch(client, model: str, batch: list[dict]) -> tuple[list[dict], dict]:
    """1バッチを監査する。切り詰め・JSON 崩れはバッチを二分割して再試行する"""
    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return _call_once(client, model, batch)
        except Truncated as e:
            last_err = e
            break                      # 同じサイズで粘っても無駄。分割へ
        except Exception as e:         # API エラー・JSON 崩れ
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(2 * (attempt + 1))

    if len(batch) > 1:
        mid = len(batch) // 2
        print(f"\n  [分割] {len(batch)}語 → {mid}+{len(batch)-mid}語（{last_err}）", end=" ")
        out, usage = [], {"input_tokens": 0, "output_tokens": 0}
        for half in (batch[:mid], batch[mid:]):
            o, u = audit_batch(client, model, half)
            out += o
            usage = {k: usage[k] + u[k] for k in usage}
        return out, usage

    raise last_err


def main():
    p = argparse.ArgumentParser()
    p.add_argument("input", nargs="?", default=INPUT_PATH)
    p.add_argument("--out", default=OUTPUT_PATH)
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    p.add_argument("--limit", type=int, default=None, help="先頭からN語だけ監査")
    p.add_argument("--start", type=int, default=0, help="先頭からN語スキップ")
    p.add_argument("--ids", default=None, help="監査する id をカンマ区切りで指定")
    p.add_argument("--dry-run", action="store_true", help="対象件数と概算コストのみ表示")
    args = p.parse_args()

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)

    ids = {int(x) for x in args.ids.split(",")} if args.ids else None
    entries = build_entries(data, ids, args.start, args.limit)
    batches = [entries[i:i + args.batch_size]
               for i in range(0, len(entries), args.batch_size)]

    print(f"監査対象: {len(entries)}語 / {len(batches)}バッチ（model={args.model}）")
    if args.dry_run:
        # 1語あたり input ~35 tok + system 分、output は flag 分のみという実測ベースの概算
        est_in  = len(batches) * 700 + len(entries) * 35
        est_out = len(batches) * 400
        cost = est_in / 1e6 * PRICE_IN + est_out / 1e6 * PRICE_OUT
        print(f"概算コスト: 約 ${cost:.2f}（in~{est_in:,} / out~{est_out:,} tokens）")
        for e in entries[:5]:
            print(f"  #{e['id']:4d} {e['word']:<16s} 正解={e['correct']} / 誤答={e['distractors']}")
        if len(entries) > 5:
            print(f"  ... 他 {len(entries) - 5}語")
        return

    client   = anthropic.Anthropic()
    findings = []
    failures = []
    total_in = total_out = 0

    for bi, batch in enumerate(batches, 1):
        head = f"#{batch[0]['id']}-#{batch[-1]['id']}"
        print(f"Batch {bi}/{len(batches)} ({len(batch)}語 {head})...", end=" ", flush=True)
        try:
            flagged, usage = audit_batch(client, args.model, batch)
            total_in  += usage["input_tokens"]
            total_out += usage["output_tokens"]
            batch_ids = {e["id"] for e in batch}
            for item in flagged:
                if item.get("id") not in batch_ids:
                    print(f"\n  [WARN] バッチ外の id={item.get('id')} を無視")
                    continue
                findings.append(item)
            print(f"flag {len(flagged)}件")
            for item in flagged:
                for iss in item.get("issues", []):
                    print(f"    #{item['id']:4d} {item['word']:<16s} [{iss.get('type')}] "
                          f"'{iss.get('distractor')}' → 候補 '{iss.get('suggestion')}'")
        except Exception as e:
            print(f"[ERROR] {e}")
            failures.append({"batch": bi, "ids": [x["id"] for x in batch], "error": str(e)})

        if bi < len(batches):
            time.sleep(0.5)

    report = {
        "model":     args.model,
        "audited":   len(entries),
        "flagged":   len(findings),
        "findings":  findings,
        "failures":  failures,
        "usage":     {"input_tokens": total_in, "output_tokens": total_out},
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    cost = total_in / 1e6 * PRICE_IN + total_out / 1e6 * PRICE_OUT
    print(f"\n=== 完了 ===")
    print(f"  監査:   {len(entries)}語")
    print(f"  flag:   {len(findings)}語")
    print(f"  失敗:   {len(failures)}バッチ")
    print(f"  tokens: in {total_in:,} / out {total_out:,}（約 ${cost:.2f}）")
    print(f"  レポート: {args.out}")
    if failures:
        print("  ※ 失敗バッチは --ids で再実行してください:")
        print(f"     --ids {','.join(str(i) for f_ in failures for i in f_['ids'])}")
    print("\n  データファイルは変更していません。レポートを確認して修正してください。")


if __name__ == "__main__":
    main()
