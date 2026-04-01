# VocabFlow SRS — アルゴリズム仕様書 v3

## 概要

TikTok式の縦動画スワイプUI上で英単語学習を行うアプリ「VocabFlow」のSRS（間隔反復学習）アルゴリズム仕様。本ドキュメントはプロトタイプ構築のための設計書である。

### 設計原則

**「覚えた」は存在しない。あるのは半減期が長い状態だけ。**
母語ですら、使わない語彙は忘れる。VocabFlow は「完全に覚えた」という状態を定義しない。mastered と呼ばれる状態も、半減期 h が閾値を超えただけであり、時間が経てば p は下がり続ける。記憶は固定資産ではなく、メンテナンスが必要な状態である。

**間隔反復はスケジュール管理ではなく、状態推定である。**
「Day 5 にこの単語をレビューせよ」ではなく「この単語の記憶保持確率は今どのくらいか」を問い続ける。1回の正解と10回の安定正解では、同じ h でも信頼性（σ）が違う。ベイジアン的な不確実性の管理が、SRS を単なるスケジューラーから状態推定システムに変える。

**離脱を設計に織り込む。**
1週間空いても、1ヶ月空いても、戻ってきた瞬間に「今あなたが一番危ない単語」を出せる。離脱はペナルティではなく、単なる時間経過として処理される。ストリーク（連続記録）に依存しない。人生にはアプリより大事なことがある。

**学習者へのリスペクト。**
学習者は自分の学習をコントロールする能力がある大人である。スキップを罰しない。セッションの長さを強制しない。やることがないなら「休め」と言える。苦戦している語には「もっと頑張れ」ではなく「別のやり方を試そう」と提案する。進捗のペースは学習者が決める。

### SRSウェーブ方式

本アルゴリズムの全体設計を「SRSウェーブ方式」と呼ぶ。以下の要素を一体の設計として含み、いずれかを欠くと破綻する。

- **HLR忘却曲線による連続的な状態推定:** 「覚えた/覚えていない」の二値ではなく、記憶保持確率 p を連続値として管理する
- **ウェーブによる新語投入のゲート制御:** 新語は段階的に投入するが、復習はプール全体で横断する。ウェーブは投入のゲートにすぎない
- **貪欲方式のスロット配分:** 固定比率ではなく、urgent → due → new の優先度順にセッションを構成する。復習と新語のバランスが自動調整される
- **セッションサイズ上限による1回の負荷固定:** どれだけ復習が溜まっても、1セッションの消化量は sessionSize（20枚）を超えない
- **セッション早期終了:** urgent + due + new が空なら終了。filler だけでセッションを埋めない
- **離脱を時間経過として処理:** 1日空いても1ヶ月空いても、戻った瞬間に p を再計算して最適な復習順序を再構成する。離脱はペナルティではなく、単なる Δt の増加である

従来のSRSにおける最大の離脱原因「レビューの借金」（復習スケジュールの蓄積）は、これらの歯車が噛み合うことで構造的に発生しない。

### コンセプト

- ユーザーは縦スワイプでカードを次々と消費する
- フィード内に新語の導入、復習、テストが自然に混在する
- ユーザーは「勉強している」と意識せず、TikTokを見る感覚で語彙が定着する
- プロトタイプは動画なしだが、実際に操作できるHTML/JSアプリとして実装する

### アーキテクチャ方針

コアのSRSエンジンをESモジュールとして実装し、2つのフロントエンドが共有する：

```
┌─────────────────────────────────────────────────┐
│                 SRS Core Modules                 │
│  (config.js / models.js / srs-engine.js /        │
│   wave-manager.js / feed-generator.js)           │
└──────────┬──────────────────┬────────────────────┘
           │                  │
    ┌──────▼──────┐   ┌──────▼──────┐
    │  Interactive │   │  Simulator  │
    │  Prototype   │   │  Dashboard  │
    │  (app.html)  │   │  (sim.html) │
    │              │   │             │
    │ 縦スワイプUI  │   │ 仮想学習者   │
    │ 手動操作     │   │ 自動実行     │
    │ リアルタイム  │   │ グラフ出力   │
    │ Wave Heatmap │   │ シナリオ比較 │
    └─────────────┘   └─────────────┘
```

---

### v3 変更履歴（実装フィードバックによる改訂）

v2 → v3 の変更は、Claude Code によるシミュレーター実装中に発見された問題に基づく。

1. **セッション早期終了条件の追加** (Section 4.4): urgent + due + new = 0 ならセッション終了。passive だけでセッションを埋めない
2. **候補プール「due」の追加** (Section 4.1): 最適復習時刻を過ぎた単語の専用プール。v2 では urgent と filler の間のデッドゾーンが存在した
3. **フィード混合比率の動的化** (Section 4.2): 固定比率 → 優先度順の貪欲詰め方式に変更
4. **peakH の導入** (Section 1.4, 3.2): ウェーブ解放判定を「瞬間h」ではなく「最大到達h」で行う
5. **ウェーブ解放の即時トリガー** (Section 3.5): セッション途中でも条件達成時に即座に次ウェーブを解放
6. **不正解時のセッション内リトライ** (Section 4.5): 不正解カードを同セッション内で再出題
7. **h の範囲制約** (Section 1.2): h_min = h0/2, h_max = 365日
8. **スキップ（スワイプスルー）の定義** (Section 2.4): 全カードでスキップ可能。ペナルティなし・逃げ切り不可・次セッション優先再出題
9. **Handwrite の位置づけ変更** (Section 2.1, 2.3): 学習パスの最終段階 → 停滞語への介入メソッドに転換。発動条件を h ≥ 8日 から「同一段階で累積3回不正解」に変更
10. **Passive カードの読み物化** (Section 2, カード種別表): 「既知語を含む例文」→「語源・使い方のコツ・トリビア等の読み物カード」に拡張

---

## 1. コアモデル：HLR + ベイジアン不確実性

### 1.1 忘却曲線

各単語 w × 学習者 u の組に対して、最後の復習からの経過時間 Δt における記憶保持確率：

```
p(recall) = 2^(-Δt / h)
```

- h: 半減期（half-life）。記憶が50%の確率で失われるまでの時間（日単位）
- Δt: 最後の復習からの経過時間（日単位）

### 1.2 半減期の更新

試行結果に応じて半減期を更新する。カード種別ごとに重み（weight）が異なる。

```
正解時: h_new = h_old × α × card_weight
不正解時: h_new = h_old × β
```

- α: 正解時の基本倍率（デフォルト 2.0）
- β: 不正解時の基本倍率（デフォルト 0.3）
- card_weight: カード種別ごとの重み（後述）

**h の範囲制約:**
```
h_min = h0 / 2  (= 0.5日)
h_max = 365日

h_new = clamp(h_new, h_min, h_max)
```

h_min の設計根拠: 1日3セッション（間隔0.33日）の環境で h < 0.5 になると、次セッション時の p が極端に低くなり（p < 0.2）、不正解が連鎖する death spiral に陥る。h_min = h0/2 はこれを防ぎつつ、不正解のペナルティ（h = 1.0 → 0.5）を有効に保つ値。

### 1.4 peakH（最大到達半減期）

各単語は、これまでに到達した最大の半減期を `peakH` として記録する。

```
peakH = max(peakH, h)  // h が更新されるたびに評価
```

peakH は SRS のコア計算（p の算出、復習タイミング）には使用しない。用途はウェーブ解放判定（Section 3.2）に限定される。一度 h = 2.0 以上に到達した単語は、その後 h が振動で下がっても「一度は覚えた」と見なす。

### 1.3 ベイジアン拡張：半減期の不確実性

半減期を点推定ではなく、対数正規分布で表現する：

```
log(h) ~ N(μ, σ²)
```

- μ: 半減期の対数の最尤推定値
- σ: 不確実性（確信度の逆数）

更新ルール：
- 正解 → μ増加、σ減少（半減期が伸び、確信度が上がる）
- 不正解 → μ減少、σやや減少（半減期が縮み、確信度もやや上がる）
- 長期間テストなし → σが時間とともに増加（確信度が下がる）

σの時間経過による増加：
```
σ(t) = σ_last + σ_decay × Δt
```

この σ が「フィードに何を出すか」の判断で使われる（Uncertain候補の選出）。

---

## 2. カード種別

認知負荷の低い順に6種別。学習パスに沿って段階的に出題する。

| カード種別 | 入力チャネル | 出力チャネル | 認知負荷 | 身体負荷 | card_weight | 説明 |
|---|---|---|---|---|---|---|
| **Intro** | 視覚＋聴覚 | なし（スワイプ） | ★☆☆☆☆ | なし | — (h₀設定) | 単語＋意味＋例文＋音声。初出の提示 |
| **Recognition** | 視覚 | タップ（4択） | ★★☆☆☆ | 最小 | 0.8 | 単語を見て意味を選ぶ |
| **Recall** | 視覚（空欄） | タップ | ★★★☆☆ | 最小 | 1.0（基準） | 例文の空欄を埋める |
| **Dictation** | 聴覚のみ | タイピング | ★★★★☆ | 中 | 1.3 | 音声を聞いてスペルを入力 |
| **Handwrite** | 聴覚のみ | 紙に手書き→撮影 | ★★★★★ | 最大 | 1.6 | 紙に書いてカメラで撮影。AI判定 |
| **Passive** | 視覚 | なし（スワイプ） | ★☆☆☆☆ | なし | 間接観測 | 読み物カード。語源・使い方のコツ・トリビア等。テストの箸休め |

### 2.1 学習パス

各単語は以下のパスを辿る：

```
必須パス: Intro → Recognition → Recall → Dictation → 定着済み（Passive）

                                   ↑
                              [Handwrite]
                         （停滞時の介入パス）
```

段階の昇格条件：
- Intro → Recognition: 同セッション内、数枚後に自動
- Recognition → Recall: h ≥ recognitionThresholdH (2.0日)
- Recall → Dictation: h ≥ dictationThresholdH (4.0日)
- 定着済み: Dictation クリア かつ h ≥ masteredThresholdH (14.0日)

Recognition → Recall に h ≥ 2.0日 の閾値を設ける理由: Recognition は4択で25%のまぐれ正解がありうる。h ベースの閾値により、最低2回の正解（h: 1.0 → 2.0）が必要となり、まぐれ1回での昇格を防ぐ。Recall → Dictation（h ≥ 4.0日）と同じ思想で、全段階遷移が h ベースで一貫する。

不正解時は前の段階に戻る（例: Dictation不正解 → 次回はRecallから再開）。

**Handwrite の発動条件（停滞介入）:**

Handwrite は学習パスの最終段階ではなく、定着に苦戦している語に対する特殊介入メソッドとして機能する。身体性を伴う手書きが、タイピングや選択では定着しなかった記憶を別の神経経路から強化する。

```
発動条件: 同一段階での累積不正解数 ≥ handwriteStuckThreshold (3回)
```

例:
- Recall 段階で3回不正解 → 次回 Handwrite が出題される
- Dictation 段階で3回不正解 → 次回 Handwrite が出題される
- Handwrite で正解 → h × α × 1.6 の大きなブーストで停滞を突破。元の段階に復帰
- Handwrite でも不正解 → h × β。次回も Handwrite で再挑戦

**WordState への追加フィールド:**

```javascript
this.stuckCount = 0;  // 現在の段階での累積不正解数。stage 変更時にリセット
```

### 2.2 Dictation 判定ロジック

| 判定 | 条件 | h更新 |
|---|---|---|
| Perfect | スペル完全一致 | α × 1.3 |
| Near miss | レーベンシュタイン距離 = 1 | α × near_miss_weight (0.9) |
| Phonetic match | 発音は合っているがスペルミス (例: receive→recieve) | α × near_miss_weight (0.9)、スペルフラグ設定 |
| Wrong | 不一致 / 無回答 | β |

### 2.3 Handwrite 判定ロジック（マルチモーダルAI使用）

| 判定 | 条件 | h更新 |
|---|---|---|
| Perfect | 正しいスペル＋明瞭な字 | α × 1.6 |
| Correct but messy | 正しいスペルだが判読困難 | α × 1.3 |
| Near miss | 1文字違い | α × 0.9 |
| Wrong | 不正解 / 認識不能 | β |

Handwriteの運用制約：
- 1セッションに最大 max_handwrite_per_session (2) 語
- ユーザーが「書ける状況」を申告したときのみ出題（モード切替 or セッション開始時に確認）
- 書ける状況でない場合、Handwrite 対象語は通常の stage のカード種別（Recall or Dictation）で出題される
- 停滞語に対する介入メソッドであり、正解時の h ブースト（× 1.6）が通常より大きい

### 2.4 スキップ（スワイプスルー）の扱い

TikTok的UIでは、ユーザーはどのカードでも回答せずにスワイプで飛ばせる。回答を強制すると「勉強アプリ」感が出てコンセプトに反するため、スキップは常に許可する。

**スキップ時の振る舞い:**

| カード種別 | h 更新 | stage 変化 | 再出題 |
|---|---|---|---|
| **Intro** | なし（通常通り） | intro に遷移（通常通り） | — |
| **Recognition** | なし | なし | 次セッションで優先再出題 |
| **Recall** | なし | なし | 次セッションで優先再出題 |
| **Dictation** | なし | なし | 次セッションで優先再出題 |
| **Handwrite** | なし | なし | 次セッションで優先再出題 |
| **Passive** | なし（通常通り） | なし | — |

**設計原則:**

- **ペナルティなし:** スキップは「知らない」ではなく「今は答えたくない」。不正解とは異なる情報なので h を下げない
- **逃げ切り不可:** スキップされたカードは `skipped` フラグを立て、次のセッション生成時に優先的に再出題する。スキップし続けても同じカードが出続ける
- **stage 降格なし:** スキップしただけで Dictation → Recall に戻されるのは理不尽。stage はそのまま保持

**WordState への追加フィールド:**

```javascript
this.skipped = false;  // スキップされたか。次セッションで優先再出題
```

**フィード生成への影響（Section 4）:**

スキップされた単語は、次セッションの候補プール構築時に urgent/due とは別枠の最優先候補として扱う。

```javascript
// 候補プール構築時
const skipped = learnerState.words.filter(w => w.skipped);
// skipped は urgent よりも先にスロットを確保
// 出題後に skipped フラグをクリア
```

### 2.5 戻りスワイプ（前のカードに戻る）

TikTok同様、下スワイプで前のカードに戻れる。ただしカードの応答状態はセッション内で保持される。

**戻ったときの振る舞い:**

| カードの状態 | 表示 | 操作 |
|---|---|---|
| **未回答（スキップ済み）** | 回答UIを表示 | 回答可能。通常通りの h 更新・stage 遷移が発生 |
| **回答済み** | 結果表示（正解/不正解と正答） | 読み取り専用。再回答不可 |
| **Intro / Passive** | 元の表示 | 閲覧のみ（元々回答がない） |

**設計原則:**

- 応答状態はブラウザのセッション限りで保持される（セッション＝1回のフィード消化）
- 一度回答したカードはやり直しできない（答えを見た後の再回答を防ぐ）
- スキップしたカードには戻って回答できる（うっかりスワイプの救済）
- 戻りスワイプ自体に SRS への影響はない（閲覧は観測ではない）

---

## 3. ウェーブ方式（単語投入制御）

### 3.1 基本構造

全1900語は1つのSRSプールで管理する。ただし新語の投入をウェーブ（波）で制御する。

```
Wave 1:  単語 1-50     → Day 1から投入開始
Wave 2:  単語 51-100   → Wave 1の解放条件を満たしたら開始
Wave 3:  単語 101-150  → Wave 2の解放条件を満たしたら開始
...
Wave 38: 単語 1851-1900 → Wave 37の解放条件を満たしたら開始
```

### 3.2 ウェーブ解放条件

```
current_wave の「導入済み語（stage ≠ 'new'）」のうち
wave_unlock_ratio (70%) 以上が peakH ≥ wave_unlock_h (2.0日) を満たしている
```

**重要: 分母は「導入済み語」のみ。** まだ導入していない語（stage = 'new'）は分母に含めない。50語ウェーブで34語が導入済みなら、分母は34。34語中70%（= 24語）が peakH ≥ 2.0 なら解放条件を満たす。

```javascript
const nonNew = waveWords.filter(w => w.stage !== 'new');
const qualified = nonNew.filter(w => w.peakH >= cfg.waveUnlockH);
return nonNew.length > 0 && (qualified.length / nonNew.length) >= cfg.waveUnlockRatio;
```

この設計により、maxNewPerSession の制約で全語が導入しきれなくても、導入済みの語の定着が十分なら次のウェーブに進める。長期シミュレーションでのウェーブ停滞を防ぐ。

**peakH による判定:** 現在の h ではなく peakH で判定する。h は不正解により振動するが、一度 h ≥ 2.0 に到達した単語は「この学習者はこの単語に十分触れた」と見なす。peakH を使うことで、たまたまの不正解によるウェーブ解放のチラつき（条件達成→未達成→達成の繰り返し）を防ぐ。

100%を要求しない。未定着の単語は復習プールで引き続きケアされつつ、新しいウェーブが始まる。

### 3.3 アクティブウェーブ制限

```
max_active_waves = 3
```

同時にアクティブ（新語投入中 or 復習集中期間中）なウェーブは最大3つ。あるウェーブの大半が定着済み（h > 8日でPassive移行）になると、そのウェーブは「卒業」してアクティブ枠が空く。

### 3.4 復習はプール全体で横断

ウェーブはあくまで新語投入のゲート。復習はSRSアルゴリズムがプール全体から最適な単語を選ぶ。Wave 1の単語がWave 10をやっている頃に忘却確率が閾値を下回れば、フィードに再出現する。

### 3.5 ウェーブ解放の即時トリガー

ウェーブ解放条件のチェックは**セッション生成時**に毎回行う。次のセッションまで待つ必要はない。

```
セッション生成開始
  → waveManager.checkUnlock(currentTime)
  → 条件達成 → 即座に次ウェーブ解放、新語プールに追加
  → 今回のセッションから新ウェーブの単語が出題され得る
```

これにより、あるセッションで Wave 1 の語彙が閾値を超えた直後の次セッションから Wave 2 の新語が流入する。学習ペースに滞りがなくなる。

---

## 4. フィード生成アルゴリズム

### 4.1 候補プールの構築

1セッション生成時に、学習中の全単語を4カテゴリ + filler に分類する。

最適復習時刻の計算:
```
optimalNextReview = lastReviewed + h × log₂(1 / targetRetention)
                  ≈ lastReviewed + h × 0.234   (targetRetention = 0.85 の場合)
```

| カテゴリ | 条件 | 説明 |
|---|---|---|
| **Urgent** | p(recall) < 0.5 | 忘れかけている。復習が急務 |
| **Due** | p(recall) < targetRetention かつ optimalNextReview を過ぎた | 最適復習時刻を超えた。通常の復習対象 |
| **Uncertain** | σ > uncertain_threshold | 覚えているかどうか不確実。情報が欲しい |
| **New** | 未学習（アクティブウェーブ内） | まだ出会っていない単語 |
| **Filler** | p ≥ targetRetention | 十分定着している既知語。箸休め用 |

v2 では urgent と filler の間に「デッドゾーン」（0.5 ≤ p < 0.85 で due でもない領域）が存在し、復習されない単語が大量発生した。Due プールの追加でこれを解消する。

### 4.2 混合比率の決定（優先度順貪欲方式）

v2 の固定比率方式（urgent 50%, uncertain 30%, ...）は学習初期に破綻する。50語が同時に due になっても固定スロットでは捌けない。

**v3 では優先度順に貪欲に詰める:**

```javascript
function allocateSlots(pools, config) {
  const maxSize = config.sessionSize;
  const selected = { urgent: [], due: [], uncertain: [], new: [], filler: [] };
  let remaining = maxSize;

  // 1. Urgent（最優先: 忘れかけている語）
  selected.urgent = pickTopN(pools.urgent, remaining, sortBy='pRecall_asc');
  remaining -= selected.urgent.length;

  // 2. Due（最適復習時刻を過ぎた語）
  selected.due = pickTopN(pools.due, remaining, sortBy='pRecall_asc');
  remaining -= selected.due.length;

  // 3. New（新語。上限あり）
  const newLimit = Math.min(remaining, config.maxNewPerSession);
  selected.new = pools.new.slice(0, newLimit);
  remaining -= selected.new.length;

  // 4. Uncertain（不確実な語）
  selected.uncertain = pickTopN(pools.uncertain, remaining, sortBy='sigma_desc');
  remaining -= selected.uncertain.length;

  // 5. Filler（箸休め。残りスロットを埋める）
  selected.filler = pickRandom(pools.filler, remaining);

  return selected;
}
```

この方式の特性:
- urgent + due が sessionSize を超える場合、最も忘却が進んだ語から優先的に選ばれる
- 復習が不要なときは new と filler が自然にスロットを占める
- 学習初期（復習多）と学習後期（新語多）で自動的に比率が変化する

### 4.3 セッション内配置ルール

1. 新語（Intro）は連続させない。2〜3枚の復習カードを挟む
2. Urgentな単語はセッション前半に寄せる（早期離脱でも復習効果を確保）
3. 同一新語をセッション内で2回出す（Intro → 数枚後に Recognition）
4. Filler（passive）を等間隔に散りばめる
5. Dictation / Handwrite はセッション後半に配置（集中力が必要）

### 4.4 セッション早期終了条件

**urgent + due + new がすべて空の場合、セッションを早期終了する。**

filler（passive）だけでセッション枠を埋めない。「今はやるべき復習がない。休め。」もSRSの重要な出力である。

```javascript
function shouldEndSession(pools) {
  return pools.urgent.length === 0
      && pools.due.length === 0
      && pools.new.length === 0;
}
```

早期終了時のUX:
- インタラクティブUI: 「今日の学習は完了です！次のセッションは○時間後」と表示
- シミュレーター: セッションのカード数を実際の消化枚数として記録

### 4.5 セッション内リトライ（再学習ステップ）

不正解のカードを同セッション内の3〜5枚後に再挿入する。Anki の「再学習ステップ (relearning steps)」と同等の仕組み。

```
不正解発生
  → h を β で更新（通常通り）
  → stage を1段階降格（通常通り）
  → 同一カードを現在位置 + retryGap (3〜5) 枚後に再挿入（is_retry フラグを立てる）
  → 再挿入されたカードの種別は元と同じ（Recall → Recall）
  → 再挿入カードで正解 → h 更新なし。stage 降格をキャンセル（元の stage に戻す）
  → 再挿入カードでも不正解 → もう一度再挿入（最大 maxRetryPerCard = 2 回）
```

**リトライの意味論：リトライ正解は「成長」ではなく「ダメージ回復」**

- 不正解時の h × β ペナルティは確定（短期記憶の失敗という情報）
- リトライ正解は「短期記憶がまだ残っていた」ことを示すが、長期記憶の強化ではない
- よって h は更新せず、stage 降格だけをキャンセルする
- 次のセッションで due として再出題されたとき、そこで初めて h が伸びる

これにより：不正解+リトライ正解の正味効果は `h × β（降格なし）`。
従来の実装では `h × β × α × cardWeight`（recall なら `h × 0.6`）となり、
成長に見えて実は h が縮む二重更新バグが生じていた。

リトライの設計根拠: h = 0.5 の単語を次のセッション（0.33日後）まで放置すると p ≈ 0.63。しかしセッション内で3枚後に再出題すれば、短期記憶がまだ残っている状態で再学習できる。これによりセッション間の復習依存を減らし、death spiral を抑止する。stage 降格のキャンセルはさらに、不当なステージ後退による学習効率の低下を防ぐ。

---

## 5. 可視化：Wave Heatmap

### 5.1 コンセプト

学習進捗を「波」として可視化する。X軸に単語を提示順（ID順）で並べ、各単語の半減期 h に応じて色を付ける。

```
██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Wave 1 (定着済み)  Wave 2 (学習中)  Wave 3以降 (未着手)
```

### 5.2 カラーマッピング

| h の範囲 | 色 | 状態 |
|---|---|---|
| 未学習 | グレー (#E0E0E0) | 未着手 |
| h < 1日 | 赤 (#FF4444) | 初期段階、不安定 |
| 1日 ≤ h < 3日 | オレンジ (#FF8C00) | Recognition〜Recall段階 |
| 3日 ≤ h < 7日 | 黄 (#FFD700) | Dictation段階 |
| 7日 ≤ h < 14日 | 黄緑 (#9ACD32) | 定着進行中 |
| 14日 ≤ h < 30日 | 緑 (#32CD32) | ほぼ定着 |
| h ≥ 30日 | 深緑 (#006400) | 完全定着 |

### 5.3 表示

- 各セルは1単語に対応
- マウスオーバー/タップで単語名・h・現在のステージを表示
- インタラクティブプロトタイプでは操作のたびにリアルタイム更新
- シミュレーターでは日次スナップショットのアニメーション再生

### 5.4 サマリー統計の併記

ヒートマップの上部に以下を表示：
- 総学習語数 / 1900
- 定着済み語数（h ≥ 14日）
- 現在のアクティブウェーブ番号
- 平均半減期の推移グラフ（折れ線）

---

## 6. パラメータ一覧

### 6.1 コアSRSパラメータ

| パラメータ | 変数名 | 初期値 | 説明 |
|---|---|---|---|
| 初期半減期 | `h0` | 1.0 日 | 新語の初期半減期 |
| 正解時倍率 | `alpha` | 2.0 | 正解時の半減期倍率（基本） |
| 不正解時倍率 | `beta` | 0.3 | 不正解時の半減期倍率 |
| 半減期下限 | `hMin` | h0 / 2 (= 0.5日) | h の最小値。death spiral 防止 |
| 半減期上限 | `hMax` | 365日 | h の最大値 |
| 初期不確実性 | `sigma0` | 1.0 | 半減期の初期不確実性 |
| 不確実性増加率 | `sigmaDecay` | 0.01 / 日 | 時間経過による不確実性増加 |
| 目標記憶保持率 | `targetRetention` | 0.85 | 目標とする記憶保持確率 |

### 6.2 カード種別パラメータ

| パラメータ | 変数名 | 初期値 | 説明 |
|---|---|---|---|
| Recognition重み | `recognitionWeight` | 0.8 | Recognition正解時のα倍率 |
| Recall重み | `recallWeight` | 1.0 | Recall正解時のα倍率（基準） |
| Dictation重み | `dictationWeight` | 1.3 | Dictation正解時のα倍率 |
| Handwrite重み | `handwriteWeight` | 1.6 | Handwrite正解時のα倍率 |
| Handwrite判読困難重み | `handwriteMessyWeight` | 1.3 | 判読困難だが正解の倍率 |
| Near miss重み | `nearMissWeight` | 0.9 | 惜しい正解時のα倍率 |
| Recognition昇格閾値 | `recognitionThresholdH` | 2.0 日 | Recognition → Recall 昇格の半減期閾値 |
| Dictation閾値 | `dictationThresholdH` | 4.0 日 | Recall → Dictation 昇格の半減期閾値 |
| 定着判定閾値 | `masteredThresholdH` | 14.0 日 | Dictation クリア かつ h ≥ この値で mastered（定着済み）と判定 |
| Handwrite停滞閾値 | `handwriteStuckThreshold` | 3 | 同一段階での累積不正解数がこの値以上で Handwrite 介入 |
| Handwrite上限 | `maxHandwritePerSession` | 2 | 1セッションのHandwrite上限 |

### 6.3 ウェーブパラメータ

| パラメータ | 変数名 | 初期値 | 説明 |
|---|---|---|---|
| ウェーブサイズ | `waveSize` | 50 | 1ウェーブの単語数 |
| 解放比率 | `waveUnlockRatio` | 0.7 | 次ウェーブ解放に必要な定着比率 |
| 解放閾値 | `waveUnlockH` | 2.0 日 | 定着と見なす半減期閾値 |
| 最大アクティブ数 | `maxActiveWaves` | 3 | 同時アクティブウェーブ上限 |

### 6.4 セッションパラメータ

| パラメータ | 変数名 | 初期値 | 説明 |
|---|---|---|---|
| セッションサイズ | `sessionSize` | 20 | 1セッションの最大カード数 |
| 新語上限 | `maxNewPerSession` | 5 | 1セッションの新語上限 |
| 1日のセッション数 | `sessionsPerDay` | 3 | 想定される1日のセッション数 |
| 不確実性閾値 | `uncertainThreshold` | 1.5 | Uncertain判定のσ閾値 |
| リトライ間隔 | `retryGap` | 4 | 不正解時の再挿入位置（現在位置+N枚後） |
| 最大リトライ回数 | `maxRetryPerCard` | 2 | 同一カードの最大再挿入回数/セッション |

---

## 7. 実装構成

### 7.1 ファイル構成

```
vocabflow-srs/
│
├── core/                        # ===== SRSコアモジュール（両フロントエンドが共有）=====
│   ├── config.js                # 全パラメータ定義（Section 6）、デフォルト値、バリデーション
│   ├── models.js                # データモデル: WordState, Card, Session, LearnerState
│   ├── srs-engine.js            # コアSRSロジック: h更新、p計算、ベイズ更新、判定ロジック
│   ├── wave-manager.js          # ウェーブ管理: 解放判定、アクティブウェーブ管理
│   ├── feed-generator.js        # フィード生成: 候補選出、混合比率、配置最適化
│   └── word-data.js             # 単語データ（1900語。プロトタイプ用にダミー or 実データ）
│
├── app/                         # ===== インタラクティブプロトタイプ =====
│   ├── app.html                 # エントリーポイント
│   ├── app.js                   # アプリ制御: セッション管理、時間進行、状態永続化
│   ├── ui-cards.js              # カード種別ごとのUI描画・インタラクション処理
│   ├── ui-heatmap.js            # Wave Heatmap リアルタイム描画（Canvas）
│   └── app.css                  # 縦スワイプUI用スタイル
│
├── sim/                         # ===== シミュレーター =====
│   ├── sim.html                 # エントリーポイント
│   ├── sim.js                   # シミュレーション制御: シナリオ実行、仮想学習者
│   ├── virtual-learner.js       # 仮想学習者モデル: 確率的応答生成
│   ├── scenarios.js             # シナリオA〜D定義
│   ├── charts.js                # グラフ描画（Chart.js or Canvas直描画）
│   └── sim.css                  # シミュレーターUI用スタイル
│
└── README.md                    # セットアップ手順、使い方
```

### 7.2 コアモジュール API設計

#### config.js

```javascript
// 全パラメータを1オブジェクトで管理。シミュレーターからオーバーライド可能。
export const DEFAULT_CONFIG = {
  // Core SRS
  h0: 1.0,
  alpha: 2.0,
  beta: 0.3,
  hMin: 0.5,             // h0 / 2。death spiral 防止
  hMax: 365,
  sigma0: 1.0,
  sigmaDecay: 0.01,
  targetRetention: 0.85,
  
  // Card weights
  recognitionWeight: 0.8,
  recallWeight: 1.0,
  dictationWeight: 1.3,
  handwriteWeight: 1.6,
  handwriteMessyWeight: 1.3,
  nearMissWeight: 0.9,
  
  // Stage thresholds
  recognitionThresholdH: 2.0, // Recognition → Recall 昇格の半減期閾値
  dictationThresholdH: 4.0,
  masteredThresholdH: 14.0,   // Dictation クリア かつ h ≥ 14日 で mastered
  handwriteStuckThreshold: 3,  // 同一段階での累積不正解数 ≥ 3 で Handwrite 介入
  maxHandwritePerSession: 2,
  
  // Wave
  waveSize: 50,
  waveUnlockRatio: 0.7,
  waveUnlockH: 2.0,
  maxActiveWaves: 3,
  
  // Session
  sessionSize: 20,
  maxNewPerSession: 5,
  sessionsPerDay: 3,
  uncertainThreshold: 1.5,
  retryGap: 4,
  maxRetryPerCard: 2,
};

export function createConfig(overrides = {}) {
  return { ...DEFAULT_CONFIG, ...overrides };
}
```

#### models.js

```javascript
export class WordState {
  constructor(wordId, word, waveNumber) {
    this.wordId = wordId;
    this.word = word;
    this.waveNumber = waveNumber;
    this.h = 0;            // 現在の半減期（日）。未学習時は0
    this.peakH = 0;        // 最大到達半減期。ウェーブ解放判定に使用
    this.mu = 0;           // log(h)の推定値
    this.sigma = 1.0;      // 不確実性
    this.lastReviewed = 0; // 最後の復習時刻（日数）
    this.stage = 'new';    // new|intro|recognition|recall|dictation|handwrite|mastered
    this.reviewCount = 0;
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.spellingFlag = false;
  }

  pRecall(currentTime) {
    if (this.h <= 0 || this.stage === 'new') return 0;
    const deltaT = currentTime - this.lastReviewed;
    return Math.pow(2, -deltaT / this.h);
  }

  currentSigma(currentTime) {
    const deltaT = currentTime - this.lastReviewed;
    return this.sigma + config.sigmaDecay * deltaT;
  }
}

export class Card {
  constructor(word, cardType, position) {
    this.word = word;       // WordState参照
    this.cardType = cardType;
    this.position = position;
  }
}

export class Session {
  constructor(cards, sessionTime) {
    this.cards = cards;
    this.sessionTime = sessionTime;
  }
}

export class LearnerState {
  constructor(words, config) {
    this.words = words;     // WordState[]
    this.config = config;
    this.currentTime = 0;   // シミュレーション上の現在時刻（日数）
    this.totalCardsConsumed = 0;
    this.sessionsCompleted = 0;
    this.waveUnlockEvents = []; // [{waveNumber, day}]
  }
}
```

#### srs-engine.js

```javascript
export class SRSEngine {
  constructor(config) {
    this.config = config;
  }

  // カード応答の処理 → h, μ, σ, stage を更新
  processResponse(word, cardType, result, currentTime) {
    // result: 'perfect' | 'near_miss' | 'phonetic' | 'correct_messy' | 'wrong'
    // → h更新、μ/σベイズ更新、stage遷移判定
  }

  // 半減期の更新
  updateHalfLife(word, cardType, isCorrect, resultQuality) {
    // isCorrect=true: h_new = h_old × α × cardWeight
    // isCorrect=false: h_new = h_old × β
  }

  // ベイズ更新（μ, σ）
  bayesianUpdate(word, isCorrect, currentTime) {
    // 正解 → μ↑, σ↓
    // 不正解 → μ↓, σやや↓
  }

  // ステージ遷移判定
  evaluateStageTransition(word) {
    // h閾値に基づいてstageを昇格 or 不正解時に降格
  }

  // Dictation入力の判定
  judgeDictation(input, expected) {
    // → 'perfect' | 'near_miss' | 'phonetic' | 'wrong'
    // レーベンシュタイン距離の計算
  }

  // レーベンシュタイン距離
  levenshteinDistance(a, b) { ... }
}
```

#### wave-manager.js

```javascript
export class WaveManager {
  constructor(config, learnerState) {
    this.config = config;
    this.state = learnerState;
  }

  // 現在のアクティブウェーブ番号のリストを返す
  getActiveWaves() { ... }

  // 次ウェーブの解放判定（peakH ベース）
  checkUnlock(currentTime) {
    // wave内の70%が peakH ≥ 2.0日 なら次を解放
    // 即時トリガー: 条件達成時に即座に解放
  }

  // アクティブウェーブ内の未学習単語を返す
  getNewWordsFromActiveWaves() { ... }

  // ウェーブの卒業判定
  checkGraduation(waveNumber) {
    // wave内の大半がh>8日ならアクティブ枠を解放
  }
}
```

#### feed-generator.js

```javascript
export class FeedGenerator {
  constructor(config, srsEngine, waveManager) {
    this.config = config;
    this.engine = srsEngine;
    this.waveManager = waveManager;
  }

  // 1セッション分のカード列を生成
  generateSession(learnerState, currentTime) {
    // 1. 候補プール構築（urgent / uncertain / new / filler）
    // 2. 混合比率決定
    // 3. カード種別割り当て
    // 4. 配置最適化
    // → Session を返す
  }

  // 候補プール構築
  buildCandidatePools(learnerState, currentTime) {
    // urgent: p < 0.5
    // uncertain: σ > threshold
    // new: アクティブウェーブ内の未学習
    // filler: p > 0.8
  }

  // 配置最適化
  arrangCards(cards) {
    // 配置ルール（Section 4.3）に従ってソート
  }
}
```

### 7.3 インタラクティブプロトタイプ仕様 (app/)

#### 画面構成

```
┌──────────────────────────────┐
│ ▼ Wave Heatmap (上部バー)     │  ← 常時表示、小さめ
│ ████████░░░░░░░░░░░░░░░░░░░  │
├──────────────────────────────┤
│                              │
│                              │
│      [カード表示エリア]        │  ← 全画面、縦スワイプ
│                              │
│      単語 / 問題 / 結果       │
│                              │
│                              │
├──────────────────────────────┤
│ Session 3/20  │ Wave 2       │  ← フッター（進捗）
│ 学習: 87語 │ 定着: 34語      │
└──────────────────────────────┘
```

#### 縦スワイプUI

- スワイプ上: 次のカード（CSS snap scrolling）
- カード種別ごとに異なるUI:
  - **Intro**: 単語（大）＋発音記号＋意味＋例文。TTS再生ボタン（Web Speech API）
  - **Recognition**: 単語表示＋4択ボタン。タップで即判定
  - **Recall**: 例文（___空欄___）＋4択 or 文字入力
  - **Dictation**: 音声再生ボタン＋テキスト入力欄＋送信ボタン
  - **Handwrite**: 音声再生＋「撮影」ボタン（プロトタイプでは手入力で代替可）
  - **Passive**: 例文表示のみ。既知語がハイライト

#### 時間の扱い

プロトタイプでは「時間を早送りする」UIが必要。

- 「次のセッションへ」ボタン: sessionsPerDay の間隔で時間を進める
- 「翌日へ」ボタン: 1日分時間を進める
- 「1週間後へ」ボタン: 7日分時間を進める
- 現在の「シミュレーション日数」を常時表示

#### 状態永続化

- localStorage に LearnerState を JSON シリアライズして保存
- セッション完了ごとに自動保存
- 「リセット」ボタンで初期状態に戻す

### 7.4 シミュレーター仕様 (sim/)

#### 仮想学習者モデル (virtual-learner.js)

```javascript
export class VirtualLearner {
  constructor(config) {
    this.ability = config.learnerAbility || 1.0;  // 0.5〜1.5
    this.categoryWeakness = config.categoryWeakness || {};
  }

  // カードへの応答をシミュレート
  respond(word, cardType, currentTime) {
    // 「真の」忘却曲線に基づく確率的応答
    const trueH = word.h * this.ability;
    const deltaT = currentTime - word.lastReviewed;
    const trueP = Math.pow(2, -deltaT / trueH);
    
    const difficultyMod = {
      recognition: 1.2,
      recall: 1.0,
      dictation: 0.8,
      handwrite: 0.75,
    };
    
    const adjustedP = Math.min(1.0, trueP * (difficultyMod[cardType] || 1.0));
    const isCorrect = Math.random() < adjustedP;
    
    // 判定の粒度（perfect / near_miss / wrong）
    if (!isCorrect) return 'wrong';
    if (cardType === 'dictation' || cardType === 'handwrite') {
      return Math.random() < 0.85 ? 'perfect' : 'near_miss';
    }
    return 'perfect';
  }
}
```

#### シナリオ定義 (scenarios.js)

```javascript
export const SCENARIOS = {
  A: {
    name: '混合比率の感度分析',
    description: '新語比率を変化させたときの定着効率を測定',
    variable: 'maxNewPerSession',
    values: [2, 3, 5, 7, 10],
    fixedOverrides: {},
    duration: 90,  // シミュレーション日数
  },
  B: {
    name: '忘却曲線パラメータの影響',
    description: 'α（正解時倍率）の違いが定着率に与える影響',
    variable: 'alpha',
    values: [1.5, 1.8, 2.0, 2.5, 3.0],
    fixedOverrides: {},
    duration: 90,
  },
  C: {
    name: '1000語到達シミュレーション',
    description: 'デフォルトパラメータで1000語定着までの日数を推定',
    variable: null,  // 単一実行
    values: [null],
    fixedOverrides: {},
    duration: 180,
  },
  D: {
    name: 'ウェーブパラメータの感度分析',
    description: 'wave_sizeとwave_unlock_ratioの組み合わせ比較',
    variable: ['waveSize', 'waveUnlockRatio'],  // 2変数グリッド
    values: {
      waveSize: [30, 50, 80, 100],
      waveUnlockRatio: [0.5, 0.6, 0.7, 0.8, 0.9],
    },
    fixedOverrides: {},
    duration: 180,
  },
};
```

#### シミュレーターUI (sim.html)

```
┌──────────────────────────────────────────────────────────┐
│ VocabFlow SRS Simulator                                  │
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│ Scenario │  [グラフ表示エリア]                             │
│ ○ A      │                                               │
│ ○ B      │  定着語数の推移（折れ線、パラメータ値ごとに色分け）│
│ ○ C      │                                               │
│ ● D      │                                               │
│          ├───────────────────────────────────────────────┤
│ Params   │                                               │
│ α: [2.0] │  [Wave Heatmap]                               │
│ β: [0.3] │  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│ wave: 50 │                                               │
│          ├───────────────────────────────────────────────┤
│ [Run]    │  復習/新語比率の推移（積み上げ面グラフ）         │
│ [Reset]  │                                               │
│          │  半減期の分布（ヒストグラム）                    │
│ Speed:   │                                               │
│ [▶ ██░]  │  復習回数の分布（ヒストグラム）                  │
│          │                                               │
└──────────┴───────────────────────────────────────────────┘
```

#### 出力グラフ一覧

1. **定着語数の推移**（折れ線）: X=日数、Y=定着語数（h≥14日）。パラメータ値ごとに色分け
2. **Wave Heatmap スナップショット**: スライダーで日数を選択して表示
3. **復習/新語比率の推移**（積み上げ面グラフ）: X=日数、Y=セッション内構成比
4. **半減期の分布**（ヒストグラム）: 特定日時点での全学習語のh分布
5. **1単語あたりの復習回数の分布**（ヒストグラム）: 定着までに要した復習回数
6. **Wave Heatmap アニメーション**: 再生/一時停止で波の進行を観察

---

## 8. 単語データ (word-data.js)

### 8.1 プロトタイプ用データ形式

```javascript
export const WORD_DATA = [
  {
    id: 1,
    word: 'abandon',
    meaning: '〜を捨てる、放棄する',
    pronunciation: '/əˈbændən/',
    exampleSentence: 'They had to ___ the sinking ship.',
    exampleTranslation: '彼らは沈みゆく船を放棄しなければならなかった。',
    distractors: ['aboard', 'absorb', 'abuse'],  // Recognition用ダミー選択肢
    category: 'verb',
  },
  // ... 1900語分
];
```

### 8.2 プロトタイプでの簡易対応

全1900語の実データが準備できるまでは、以下の簡易データで動作確認：
- 200語程度のサンプルデータを用意
- 残りはダミー生成（word: `word_001` 〜 `word_1900`）
- シミュレーターはダミーデータでも問題なく動作する（意味やスペルは参照しないため）

---

## 9. 技術詳細

### 9.1 技術スタック

- **言語**: JavaScript (ES Modules)
- **UI**: Vanilla HTML/CSS/JS（フレームワーク不使用）
- **グラフ**: Canvas API 直描画（外部ライブラリ不使用で軽量化）
  - 代替: Chart.js CDN利用も可
- **音声**: Web Speech API (SpeechSynthesis) — Intro/Dictation用
- **永続化**: localStorage
- **サーバー不要**: 静的ファイルのみ。file:// or ローカルサーバーで動作

### 9.2 ESモジュールの利用

```html
<!-- app.html -->
<script type="module" src="./app.js"></script>
```

```javascript
// app.js
import { createConfig } from '../core/config.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
```

### 9.3 レーベンシュタイン距離（Dictation判定用）

```javascript
function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
    Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}
```

---

## 10. 将来の拡張（メモ）

- **情報利得ベースのアイテム選択**: σが大きい単語群の中から、テスト結果の情報利得が最大のものを優先出題
- **カテゴリ間の相関モデル**: 「抽象名詞が弱い」等の学習者特性を推定し、同カテゴリの未テスト単語のσを連動更新
- **セッション長の動的調整**: ユーザーの離脱パターンから最適セッション長を学習
- **多読統合**: 記事読解中の辞書引き行動を観測データとしてSRSに統合
- **ソーシャル要素**: Wave到達のランキング、フレンド間の進捗共有
- **実動画統合**: AI動画生成（Veo 3等）で各単語のIntroカードを動画化
