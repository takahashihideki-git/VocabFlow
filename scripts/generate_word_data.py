"""
Phase 2 教材データ一括生成スクリプト
Claude API を使って 1900語のフル学習データを 20語バッチで生成する。

使用方法:
  export ANTHROPIC_API_KEY=sk-ant-...
  python3 scripts/generate_word_data.py

出力:
  scripts/results/word_data/batch_{001-095}.json  -- バッチ別中間ファイル
  scripts/results/word_data_raw.json              -- 全バッチ統合ファイル
"""

import json, os, time, re, sys
import anthropic

# ============================================================
# 設定
# ============================================================
SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
ALL_RESULTS   = os.path.join(SCRIPT_DIR, "results", "all_results.json")
OUT_DIR       = os.path.join(SCRIPT_DIR, "results", "word_data")
OUT_MERGED    = os.path.join(SCRIPT_DIR, "results", "word_data_raw.json")

BATCH_SIZE    = 20
# MODEL         = "claude-haiku-4-5-20251001"   # 速度・コスト優先
MODEL         = "claude-sonnet-4-6"
MAX_TOKENS    = 8000
RETRY_MAX     = 3
RETRY_DELAY   = 5   # seconds

CATEGORIES = {
    0:  "分類不可能",
    1:  "基本動作・操作・変化動詞",
    2:  "認知・思考・コミュニケーション動詞",
    3:  "身体動作・生理・物理動詞",
    4:  "社会的行為・対人関係動詞",
    5:  "科学・医学・健康",
    6:  "社会・政治・制度",
    7:  "経済・ビジネス・金融",
    8:  "自然・環境・地理",
    9:  "学術・教育・知識",
    10: "抽象概念・哲学・精神",
    11: "日常生活・物品・文化",
    12: "技術・システム・情報",
    13: "芸術・文化・創作",
    14: "時間・空間・数量",
    15: "基本特性・状態形容詞",
    16: "感情・性格・人間性形容詞",
    17: "専門的・技術的・学術的形容詞",
    18: "評価・判断・程度形容詞",
}


# ============================================================
# プロンプト構築
# ============================================================
def build_prompt(batch: list[dict]) -> str:
    word_list_lines = []
    for item in batch:
        cat_name = CATEGORIES.get(item["categoryId"], "不明")
        word_list_lines.append(f'  {{ "id": {item["id"]}, "word": "{item["word"]}", "categoryId": {item["categoryId"]}, "category": "{cat_name}" }}')
    word_list_str = "[\n" + ",\n".join(word_list_lines) + "\n]"

    return f"""以下の英単語リスト（{len(batch)}語）について、各単語の学習データをJSONオブジェクトの配列として生成してください。

単語リスト:
{word_list_str}

各単語について以下のフォーマットのオブジェクトを生成してください:
{{
  "id": <入力のidをそのまま使用>,
  "word": "<単語>",
  "pos": "品詞 (verb | noun | adjective | adverb | other)",
  "categoryId": <入力のcategoryIdをそのまま使用>,
  "meanings": [
    {{ "meaning": "最も一般的な日本語訳", "pos": "品詞" }},
    {{ "meaning": "2番目の意味（あれば）", "pos": "品詞" }}
  ],
  "pronunciation": "/IPA発音記号/",
  "syllables": "シラブル分割（ハイフン区切り）",
  "audioHint": "カタカナ近似発音",
  "examples": [
    {{
      "en": "自然な英語例文（15語以内）",
      "ja": "日本語訳",
      "blank": "対象単語を___に置換した版",
      "blankAnswer": "空欄の正解（活用形含む）"
    }}
  ],
  "distractors": ["ダミー意味1", "ダミー意味2", "ダミー意味3"],
  "confusableSpellings": ["よくあるスペルミス1", "よくあるスペルミス2"],
  "passive": {{
    "etymology": "語源の解説（接頭辞・語根の分解）",
    "tips": "使い方のコツ、日本人が間違えやすいポイント",
    "confusables": "紛らわしい語との比較・使い分け",
    "collocations": ["頻出コロケーション1", "コロケーション2", "コロケーション3"],
    "trivia": "文化的背景やトリビア（TikTok的な「へぇ」感を意識）"
  }},
  "frequency": COCA頻度順位の推定値（整数）,
  "cefr": "CEFRレベル推定 (A1|A2|B1|B2|C1|C2)"
}}

制約:
- examples の英語例文は自然で日常的な文にすること（15語以内）
- distractors は同じカテゴリ内の別の単語の意味を使い、正解と紛らわしいが明確に区別できるものを選ぶこと
- distractors は正解の meaning と完全に一致してはいけない
- distractors の3つは互いに重複してはいけない
- confusableSpellings は日本人学習者が犯しやすいスペルミスを2〜3個（正しいスペルは含めないこと）
- blankAnswer は文脈に応じた活用形（三単現のs、過去形、進行形等）にすること
- blank には必ず "___" を含めること
- passive の各フィールドは日本語で記述すること
- passive.etymology は接頭辞・語根の分解を含めること
- passive.tips は日本人英語学習者が実際に間違えやすいポイントに焦点を当てること
- passive.trivia は堅くなりすぎず「へぇ」と思える内容にすること
- id と categoryId は入力の値をそのまま維持すること

出力はJSONの配列のみとしてください（前後に説明文・コードブロックマーカーを入れないこと）。
"""


# ============================================================
# バリデーション（簡易版）
# ============================================================
def validate_entry(entry: dict) -> list[str]:
    errors = []
    w = entry.get("word", "<unknown>")

    # 必須フィールド
    for field in ["word", "pos", "meanings", "examples", "distractors"]:
        if not entry.get(field):
            errors.append(f"{w}: '{field}' missing or empty")

    if entry.get("meanings") and len(entry["meanings"]) < 1:
        errors.append(f"{w}: meanings must have at least 1 entry")

    if entry.get("examples"):
        for i, ex in enumerate(entry["examples"]):
            if "___" not in (ex.get("blank") or ""):
                errors.append(f"{w}: examples[{i}].blank missing '___'")
            if not ex.get("blankAnswer"):
                errors.append(f"{w}: examples[{i}].blankAnswer missing")

    dist = entry.get("distractors", [])
    if len(dist) < 3:
        errors.append(f"{w}: need 3+ distractors, got {len(dist)}")

    correct = (entry.get("meanings") or [{}])[0].get("meaning", "")
    if correct and correct in dist:
        errors.append(f"{w}: distractor duplicates correct answer '{correct}'")

    if len(dist) != len(set(dist)):
        errors.append(f"{w}: distractors contain duplicates")

    # confusableSpellings に正しいスペルが入っていないか
    conf_sp = entry.get("confusableSpellings", [])
    if entry.get("word") in conf_sp:
        errors.append(f"{w}: confusableSpellings contains correct spelling")

    return errors


# ============================================================
# API 呼び出し（リトライ付き）
# ============================================================
def repair_json(raw: str) -> str:
    """よくある JSON 破損パターンを修復する"""
    # 末尾の余分なカンマを除去（}, や ],）
    raw = re.sub(r',\s*([}\]])', r'\1', raw)
    # 制御文字（改行・タブ以外）を除去
    raw = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', raw)
    return raw


def call_api(client: anthropic.Anthropic, prompt: str, batch_num: int) -> list[dict]:
    for attempt in range(1, RETRY_MAX + 1):
        try:
            msg = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = msg.content[0].text.strip()

            # コードブロックマーカーを除去
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)

            # まず直接パース、失敗したら修復してリトライ
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                raw = repair_json(raw)
                data = json.loads(raw)

            if not isinstance(data, list):
                raise ValueError("Response is not a JSON array")
            return data

        except (json.JSONDecodeError, ValueError) as e:
            print(f"  [Batch {batch_num}] Parse error (attempt {attempt}/{RETRY_MAX}): {e}")
            if isinstance(e, json.JSONDecodeError):
                pos = e.pos
                snippet = raw[max(0, pos-40):pos+40]
                print(f"    Context around error (char {pos}): {repr(snippet)}")
            if attempt < RETRY_MAX:
                time.sleep(RETRY_DELAY)
            else:
                raise

        except anthropic.RateLimitError:
            wait = RETRY_DELAY * attempt * 2
            print(f"  [Batch {batch_num}] Rate limit. Waiting {wait}s...")
            time.sleep(wait)

        except anthropic.APIError as e:
            print(f"  [Batch {batch_num}] API error (attempt {attempt}/{RETRY_MAX}): {e}")
            if attempt < RETRY_MAX:
                time.sleep(RETRY_DELAY)
            else:
                raise

    raise RuntimeError(f"Batch {batch_num} failed after {RETRY_MAX} attempts")


# ============================================================
# メイン
# ============================================================
def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)

    # 全単語データ読み込み
    with open(ALL_RESULTS, encoding="utf-8") as f:
        all_words = json.load(f)
    print(f"Loaded {len(all_words)} words from all_results.json")

    os.makedirs(OUT_DIR, exist_ok=True)
    client = anthropic.Anthropic(api_key=api_key)

    # バッチ分割
    batches = [all_words[i:i+BATCH_SIZE] for i in range(0, len(all_words), BATCH_SIZE)]
    total = len(batches)
    print(f"Total batches: {total} (batch size: {BATCH_SIZE})")

    all_generated = []
    errors_summary = []

    for i, batch in enumerate(batches, 1):
        batch_file = os.path.join(OUT_DIR, f"batch_{i:03d}.json")

        # レジューム: 既存ファイルがあればスキップ
        if os.path.exists(batch_file):
            with open(batch_file, encoding="utf-8") as f:
                cached = json.load(f)
            all_generated.extend(cached)
            print(f"[{i:3d}/{total}] SKIP (cached): words {batch[0]['id']}-{batch[-1]['id']}")
            continue

        words_range = f"words {batch[0]['id']}-{batch[-1]['id']}"
        print(f"[{i:3d}/{total}] Generating: {words_range} ...", end=" ", flush=True)

        # 20語を前半・後半10語に分けて2回API呼び出し（max_tokens超過防止）
        t0 = time.time()
        mid = len(batch) // 2
        try:
            result_a = call_api(client, build_prompt(batch[:mid]), i)
            time.sleep(0.3)
            result_b = call_api(client, build_prompt(batch[mid:]), i)
        except Exception as e:
            print(f"\n  !! Batch {i} FAILED, skipping: {e}")
            errors_summary.append(f"BATCH_FAILED:{i}:{words_range}:{e}")
            time.sleep(RETRY_DELAY)
            continue
        result = result_a + result_b
        elapsed = time.time() - t0
        print(f"{elapsed:.1f}s", end="")

        # バリデーション
        batch_errors = []
        for entry in result:
            errs = validate_entry(entry)
            if errs:
                batch_errors.extend(errs)

        if batch_errors:
            print(f"  ⚠ {len(batch_errors)} validation error(s)")
            for e in batch_errors:
                print(f"    - {e}")
            errors_summary.extend(batch_errors)
        else:
            print(f"  ✓")

        # idとcategoryIdを入力値で上書き（AIが変更した場合の保険）
        id_map = {w["id"]: w for w in batch}
        for entry in result:
            if entry.get("id") in id_map:
                entry["id"] = id_map[entry["id"]]["id"]
                entry["categoryId"] = id_map[entry["id"]]["categoryId"]

        # 中間ファイル保存
        with open(batch_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        all_generated.extend(result)

        # レート制限回避（0.5秒待機）
        time.sleep(0.5)

    # id でソート
    all_generated.sort(key=lambda x: x.get("id", 0))

    # 統合ファイル保存
    with open(OUT_MERGED, "w", encoding="utf-8") as f:
        json.dump(all_generated, f, ensure_ascii=False, indent=2)

    print(f"\n=== Generation complete ===")
    print(f"Total words generated: {len(all_generated)}")
    print(f"Total validation errors: {len(errors_summary)}")
    print(f"Output: {OUT_MERGED}")

    if errors_summary:
        err_file = os.path.join(SCRIPT_DIR, "results", "generation_errors.txt")
        with open(err_file, "w", encoding="utf-8") as f:
            f.write("\n".join(errors_summary))
        print(f"Errors saved to: {err_file}")
        print("Run fix_distractors.py and validate_word_data.py to clean up")


if __name__ == "__main__":
    main()
