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

---

## 8. Marine Chart 学習プロファイル・綴りの暗礁 特訓（2026-06-23）

Word Wave 画面右下の FAB（海図アイコン）から開く全画面ビュー。**既存 localStorage state からすべて算出**（新トラッキングなし）し、**SRS ロジックには一切触れない**（Word Wave・Tide と同じ可視化のみの哲学）。文言は `core/labels.js` の `PROFILE_LABELS` に一元化。

### プロファイル画面（`app/ui-profile.js`・`ProfileRenderer`）

現在の弱点（state）と過去の苦戦（累計）を**意図的に分離**して誤読を防ぐ4セクション構成:

| セクション | 文言 | 内容 |
|---|---|---|
| 誤答の渦：品詞 | `posSection` | 品詞別バブルチャート（x=語数・y=誤答率・径∝√誤答数）+ 弱点語チップ |
| 誤答の渦：カテゴリ | `catSection` | カテゴリ別（バブルは語数5以上の上位8・単語リストは誤答ありの全カテゴリ） |
| 乗り越えた難所 | `overcameSection` | 累計✗が多いが**今は mastered** の語（克服済み） |
| 綴りの暗礁 | `reefSection` | **現在 dictation/recall 段で止まっている**語（意味は取れるが綴りで座礁） |

- **誤答率は回答回数ベース**（誤答数 / 総回答数）。語数とは別単位なので凡例は `N語 | 誤答率X%（誤答数/総回答数）` と分母を明示する（語数で割った率と誤読させない）。
- バブルはビビッドパレット10色・`fill-opacity 0.2`・枠線なし。色は `<circle>` の `fill` 属性で指定（CSS の `fill` は属性を上書きするため `.bc-bubble` には書かない）。

### FAB の gating

| 定数 | 値 | 根拠 |
|---|---|---|
| `PROFILE_FAB_MIN_LEARNED` | 50 | 学習済み（`stage !== 'new' && !excluded`）が 50 以上で FAB を表示。プロファイルの中身は learned 全体から算出するため gate も **learned で測る**（mastered ではない＝指標と中身を一致させる）。50 は 19 カテゴリ中いくつかが minN=5 に届きカテゴリの渦が成立し始める実用下限 |

### 綴りの暗礁 特訓（`app/ui-drill.js`・`ReefDrill`）

プロファイルの「綴りの暗礁」CTA「`この暗礁だけで特訓する（N語）`」から開く**練習モード**。

- 通常セッションと同じ dictation カード（`CardRenderer` を再利用）を上下スワイプでめくる。PC（no-touch）では 9:16 レイアウト + 「次へ」ナビボタン。
- **SRS ステータス（h・stage・正誤カウント・lastReviewed）は一切更新しない**。SRS 副作用は `CardRenderer` 自体ではなく回答時の `onReady`（通常は `_onCardAnswered → processResponse`）で起きるため、ドリルは `onReady` を UI 専用（PC ボタン点灯のみ）にして `processResponse` を呼ばない。判定の `judgeDictation` は純粋関数。
- 「記録に影響しない」ことを**常時バナー**（🪸 練習モード — 記憶強度・定着の記録には影響しません）と**終了サマリ**の2箇所で明示する。