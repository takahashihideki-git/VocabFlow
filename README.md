# Word Wave

TikTok 式の縦スワイプ UI で英単語を学ぶ、半減期ベースの SRS（間隔反復）語彙学習アプリ。

- **アプリ表示名**: Word Wave（ユーザー向けの名称）
- **開発コードネーム**: VocabFlow（ファイル名・クラス名・localStorage キー等で使用）

## 概要

1900 語の英単語を 100 語ずつ 19 の「Wave」に分け、学習者のペースに合わせて少しずつ供給する。各単語は半減期 `h`（記憶が半分になるまでの日数）で記憶状態をモデル化し、最適なタイミングで復習カードを出題する。

設計思想として「完全に覚えた」という終着点を置かない。`mastered`（定着済み）も `h` が閾値を超えた状態にすぎず、時間が経てば記憶はまた薄れる。記憶は固定資産ではなく、メンテナンスが必要な状態として扱う。

## 特徴

- **6 種類のカード** — Intro（導入）/ Recognition（四択認識）/ Recall（想起）/ Dictation（書き取り）/ Handwrite（手書き介入）/ Passive（受動的インプット）
- **半減期ベース SRS** — `h` の成長に応じて `new → recognition → recall → dictation → mastered` とステージが昇格。不正解で降格
- **Wave 供給システム** — アクティブ Wave の未学習語が尽きかけたら次の Wave を解放。学習者のペースに追従
- **Handwrite 停滞介入** — 同じ語でつまずき続けると、紙への手書きを促す特殊カードを出題
- **Wave ヒートマップ** — 全 1900 語の記憶強度を一覧表示
- **Word Wave 画面** — 全画面の単語一覧。定着度の確認・学習対象からの除外操作に加え、新語投入期（満ち潮）と復習定着期（引き潮）の「潮の状態」と全 Wave 制覇までのペースを表示
- **ビルド不要** — Vanilla JavaScript（ES Modules）。npm 依存・ビルドツールなし

## クイックスタート

ローカルサーバーを起動してブラウザで開く（ES Modules のため `file://` 直開きは不可）:

```bash
python3 -m http.server 8080
```

- インタラクティブプロトタイプ — <http://localhost:8080/app/app.html>
- 学習者シミュレーター — <http://localhost:8080/sim/sim.html>

UI なしでシミュレーションを実行する例:

```bash
node --input-type=module << 'EOF'
import { runSimulation } from './sim/sim-runner.js';
runSimulation({}, 90, (day, _, snap) => {
  if (day % 30 === 0) console.log(`Day ${day}: 定着=${snap.masteredCount} 学習済=${snap.learnedCount}`);
});
EOF
```

## ディレクトリ構成

```
VocabFlow/
├── core/      SRS コアロジック（UI 非依存の純粋 JS）
├── sim/       学習者シミュレーター（パラメータ検証用）
├── app/       インタラクティブプロトタイプ（実際の学習 UI）
├── scripts/   教材データ生成・ビルド・デプロイスクリプト
└── *.md       仕様書・ドキュメント
```

主なモジュール:

| ファイル | 役割 |
|---|---|
| `core/srs-engine.js` | 半減期 `h` の更新・ステージ遷移・判定 |
| `core/wave-manager.js` | Wave の解放・卒業判定 |
| `core/feed-generator.js` | 1 セッション分のカード列を生成 |
| `core/word-data.js` | 全 1900 語の教材データ（生成済み） |
| `sim/sim-runner.js` | 仮想学習者による長期シミュレーション |
| `app/app.js` | セッション管理・スワイプ・localStorage 永続化 |
| `app/ui-cards.js` | 6 種カードの UI・TTS |

## アーキテクチャ

3 層構成。`core/` は UI に一切依存しない純粋ロジックで、`sim/`（シミュレーター）と `app/`（実 UI）の両方が同じ `core/` を共有する。これにより SRS パラメータをシミュレーターで検証してから実アプリに反映できる。

```
        ┌─────────┐     ┌─────────┐
        │  sim/   │     │  app/   │
        └────┬────┘     └────┬────┘
             └───────┬───────┘
                ┌────┴────┐
                │  core/  │  ← SRS ロジック（UI 非依存）
                └─────────┘
```

## ドキュメント

| ファイル | 内容 |
|---|---|
| `spec.md` | SRS 仕様書 v3（半減期モデル・カード・セッション生成） |
| `wordwave-spec.md` | Word Wave の UI 仕様書 |
| `word-data-spec.md` | 単語データのスキーマ仕様 |
| `ui-labels-spec.md` | UI ラベルの一元管理仕様 |
| `classification-spec.md` | 単語のカテゴリ分類仕様 |
| `1900_words_list.md` | 1900 語リスト（語順 = Wave 順） |
| `CLAUDE.md` | 実装継続ガイド（変更履歴・既知バグ・設計メモ） |

## 開発・運用

教材データ（`core/word-data.js`）の再ビルドと検証:

```bash
python3 scripts/build_word_data_js.py scripts/results/word_data_final.json
python3 scripts/validate_word_data.py scripts/results/word_data_final.json
```

本番環境へのデプロイ（`app/` と `core/` のみ rsync 転送）。`scripts/deploy_template.sh` をコピーして接続先（ホスト・ユーザー・パス）を記入し、`scripts/deploy.sh` として実行する（実 `deploy.sh` は `.gitignore` 済み）:

```bash
cp scripts/deploy_template.sh scripts/deploy.sh
# scripts/deploy.sh を編集して REMOTE_USER / REMOTE_HOST / REMOTE_PATH を記入
bash scripts/deploy.sh
```

## 技術スタック

- **フロントエンド** — Vanilla JavaScript（ES Modules、`"type": "module"`）。フレームワーク・ビルドツール・npm 依存なし
- **永続化** — ブラウザの localStorage（キー: `vocabflow_state_v1`）
- **教材データ生成** — Python + Claude API（`scripts/` 配下）
- **カード背景画像** — Unsplash API

## ステータス

Phase 1（`core/`）・Phase 2（`sim/`）・Phase 3（`app/`）はいずれも完了済み。現在は実機ドッグフーディング段階。詳細な進捗・既知の課題は `CLAUDE.md` を参照。

## クレジット

- 教材データ（語義・例文・語源解説等）は Claude API で生成
- カード背景画像・スタート画面の背景写真は [Unsplash](https://unsplash.com/) License に基づく
