# VocabFlow UI ラベル仕様書

## 概要

SRS の内部用語をユーザー向けの日本語ラベルに変換するための対応表。ドッグフーディング参加者やエンドユーザーにとってわかりやすい表現を定義する。

---

## 1. SRS パラメータの表示ラベル

| 内部名 | 表示ラベル | 表示形式 | 備考 |
|---|---|---|---|
| h | 記憶強度 | 数値＋日（例: 12.3日） | 半減期。大きいほど記憶が安定 |
| peakH | 最高記憶強度 | 数値＋日（例: 15.1日） | これまでの最高 h |
| avgH | 平均記憶強度 | 数値＋日（例: 109日） | 学習済み全語の平均 h |
| p(recall) | 記憶保持率 | パーセント（例: 85%） | 現時点でこの語を覚えている確率 |
| reviewCount | 復習回数 | 数値（例: 8回） | |
| correctCount | 正解回数 | 数値（例: 6回） | |
| incorrectCount | 不正解回数 | 数値（例: 2回） | |
| stuckCount | 苦手度 | 数値（例: 3回） | 同一ステージでの累積不正解 |

> **注（2026-06-11・review #5）**: σ（確信度）と `sigmaToConfidence` は形骸化していた μ/σ ベイズ層の削除に伴い廃止した。観測回数・経過時間から導出する `uncertaintyWidth` ベースの確信度表示として復活させる構想は `bayesian-srs-proposal.md` §5 を参照（順次実装予定）。

---

## 2. 候補プールのラベル

| 内部名 | 表示ラベル | 備考 |
|---|---|---|
| urgent | 要復習 | 忘れかけている語（p < 0.5） |
| due | 復習時期 | 最適な復習タイミングを過ぎた語 |
| new | 新語 | まだ出会っていない語 |
| filler | 定着語 | 十分覚えている語（箸休め） |

---

## 3. セッション画面のラベル

| 内部名 / 機能 | 表示ラベル | 備考 |
|---|---|---|
| sessionSize | セッション枚数 | 「1セッションの最大カード数」 |
| sessionsPerDay | 1日のセッション数 | |
| セッション早期終了 | 「今日の復習は完了です」 | urgent + due + new が空のとき |
| 時間進行ボタン1 | 8時間後 | currentTime += 1/sessionsPerDay |
| 時間進行ボタン2 | 1日後 | currentTime += 1 |
| 時間進行ボタン3 | 1週間後 | currentTime += 7 |

---

## 4. Word Wave 画面のラベル

| 内部名 / 機能 | 表示ラベル | 備考 |
|---|---|---|
| masteredCount | 定着語数 | h ≥ masteredThresholdH の語数 |
| learnedCount | 学習済み語数 | stage ≠ 'new' の語数 |
| activeWaves | 現在のWave | アクティブウェーブの範囲 |
| excluded | 除外 | 学習対象外の語 |

---

## 5. カード種別のラベル

| 内部名 | UIラベル | 補足（日本語） |
|---|---|---|
| intro | Intro | 新語の初出カード |
| recognition | Recognition | 意味を選ぶ4択 |
| recall | Recall | 空欄を埋める |
| dictation | Dictation | 音声→タイピング |
| handwrite | Handwrite | 紙に書いて撮影 |
| passive | Passive | 語源・コツ・トリビア |

---

## 6. ヒートマップ色の凡例ラベル

水深ランプ（bathymetric・定着＝深く沈む）。詳細は spec.md §5.2 を参照。

| h の範囲 | 色 | 凡例ラベル |
|---|---|---|
| 未学習 | グレー (#333348) | 未学習 |
| h < 1日 | 浅瀬ターコイズ (#2FD9C5) | 学習開始 |
| 1日 ≤ h < 3日 | 浅青 (#29A9C2) | 練習中 |
| 3日 ≤ h < 7日 | 中層青 (#2486BC) | 成長中 |
| 7日 ≤ h < 14日 | 中層 (#2566AC) | もう少し |
| 14日 ≤ h < 30日 | 深い青 (#244F9E) | ほぼ定着 |
| h ≥ 30日 | 深海インディゴ (#1B2E66) | 定着 |
| 除外 | 暗いグレー | 除外 |

### 信頼度ゲート（泡ティア）— Word Wave 単語一覧・Wave Heatmap 共通

上記の h ベース配色に加えて**信頼度が立つまでの一色**を持つ。導入直後（`reviewCount < CONFIDENCE_MIN_REVIEWS = 3`）の語は h ティア（水深ランプ）に参加せず、泡（白アクア・#9FD8E8）の「出会ったばかり」色で一律表示する。Word Wave 単語一覧（`ui-wordwave.js`）と Wave Heatmap 俯瞰バー（`ui-heatmap.js`）の両方が同じゲートを通る（閾値は `core/labels.js` に一元化）。詳細・設計理由は spec.md §5.2「信頼度ゲート」を参照。

| 条件 | 色 | 凡例ラベル |
|---|---|---|
| `reviewCount < 3`（導入済み） | 泡（白アクア） | 出会ったばかり |

三段階：**未学習（グレー）→ 出会ったばかり（泡・白アクア）→ 測定済み（水深グラデ）**。泡は水深ランプの最浅・最明として浅瀬ターコイズに連続する。ripple 播種による h の揺らぎを実力差として色に見せないための表示で、h の数値はポップオーバーで常に確認できる。

---

## 7. 実装方針

UIラベルは定数ファイルとして一元管理し、内部名→表示ラベルの変換を関数で行う。

```javascript
// core/labels.js

export const LABELS = {
  params: {
    h: '記憶強度',
    peakH: '最高記憶強度',
    avgH: '平均記憶強度',
    pRecall: '記憶保持率',
    reviewCount: '復習回数',
    correctCount: '正解回数',
    incorrectCount: '不正解回数',
    stuckCount: '苦手度',
  },
  pools: {
    urgent: '要復習',
    due: '復習時期',
    new: '新語',
    filler: '定着語',
  },
  stages: {
    new: 'new',
    intro: 'intro',
    recognition: 'recognition',
    recall: 'recall',
    dictation: 'dictation',
    handwrite: 'handwrite',
    mastered: 'mastered',
  },
  heatmap: {
    unlearned: '未学習',
    started: '学習開始',
    practicing: '練習中',
    growing: '成長中',
    almost: 'もう少し',
    nearMastered: 'ほぼ定着',
    mastered: '定着',
    excluded: '除外',
  },
};

export function formatH(h) {
  if (h <= 0) return '—';
  if (h < 1) return `${(h * 24).toFixed(0)}時間`;
  if (h < 30) return `${h.toFixed(1)}日`;
  if (h < 365) return `${(h / 30).toFixed(1)}ヶ月`;
  return `${(h / 365).toFixed(1)}年`;
}

export function formatPRecall(p) {
  return `${(p * 100).toFixed(0)}%`;
}
```