"""
Phase 1: API検証結果に基づく修正スクリプト
verification_results.json の error を解析し、実質的な誤りを修正する。

False positive（AIの誤検出）と判断したものはスキップ。
  - #52 skill etymology: Norse origin は正確
  - #235 wind tips: 異形異音異義語の説明は有用で正確
  - #311 rely etymology: religare が語源として定説
  - #354 wealth etymology: wela/well の語根共有は正確
  - #685 equivalent etymology: aequi- prefix は正確な combining form
  - #683 principal etymology: primus+capere は定説の語根分解
  - #709 urge trivia: テキストに「moment」の言及なし（APIの誤り）
  - #1008 forecast etymology: 「弓矢」の記述なし（APIの誤り）
  - #1045 compliment etymology: com+plere は正確な語根分析
  - #1062 poll trivia: tadpole の pol は poll と同語根（正確）
  - #1177 sculpture etymology: sculpt が逆成語は言語学的に正確
  - #1351 outbreak tips: outbreak を動詞として使う用法は非標準
  - #1602 exert trivia: x=/gz/ の説明は正確
  - #1773 premium etymology: prae+emere は定説の語根分解
  - #1807 torture trivia: torquere との関連は正確

実行: python3 scripts/phase1_fixes.py
"""

import json
import os

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
INPUT_FILE  = os.path.join(RESULTS_DIR, "word_data_phase3.json")
OUTPUT_FILE = os.path.join(RESULTS_DIR, "word_data_phase1_fixed.json")

# -----------------------------------------------------------------
# 修正データ: {id: {field: new_text, ...}, ...}
#   field は "tips", "confusables", "trivia", "etymology" のいずれか
# -----------------------------------------------------------------
FIXES = {

    # #51 environment — tips
    # 「珍しい単語」は誤り。可算/不可算両用は一般的。
    51: {"tips": (
        "environment は可算・不可算両方で使える。"
        "'a work environment'（職場環境）、'the business environment'（ビジネス環境）のように"
        "具体的な場面で可算として使い、'protect the environment'（環境を守る）では不可算として使う。"
        "environmentally friendly（環境に優しい）も重要。"
    )},

    # #96 due — trivia
    # due /djuː/ と dew /djuː/ は同音。do /duː/ は別発音。
    96: {"trivia": (
        "'due' と 'dew'（露）は /djuː/ で同音の同音異義語。"
        "ただし 'do'（する）は /duː/ と発音が異なり、同音ではない。"
        "due と dew の混同がよくあり、ネイティブの子どもたちもスペルを間違えやすい曲者単語。"
    )},

    # #100 despite — tips
    # 「despite that SV」は「文語的」ではなく「非文法的（前置詞なので節は取れない）」。
    100: {"tips": (
        "'despite' は前置詞なので後には名詞・動名詞（-ing形）が続く。"
        "'despite that SV' という形は文法的に誤りで、節を続けたいときは "
        "'although' や 'even though' を使う。"
        "日本人は 'despite of' と言いがちだが 'of' は不要。"
    )},

    # #143 industry — trivia
    # 「今では誤解必至」と古い例文を挙げることの論理的矛盾を解消。
    143: {"trivia": (
        "「industry」にはもともと「勤勉」という意味があり、"
        "辞書の古い例文に「彼の成功は industry によるものだ」という文が載っていた。"
        "現代英語では「産業」の意味が主流になっているため、"
        "「勤勉」の意味で使うと誤解されることがある。"
        "産業革命（Industrial Revolution）が「勤勉」と「産業」を結びつけた歴史が背景にある。"
    )},

    # #243 device — etymology
    # videre は「見る」であって「分ける」ではない。
    243: {"etymology": (
        "古フランス語 devis（計画・考案）、ラテン語 dividere（分ける・区分する）から。"
        "「分けて設計したもの」→「考案されたもの・道具」が原義。"
        "同根語に divide がある。"
    )},

    # #245 contrast — etymology
    # contrahere（引く）ではなく contrastare（向かい合って立つ）が語源。
    245: {"etymology": (
        "イタリア語 contrasto、中世ラテン語 contrastare（向かい合って立つ）から。"
        "contra-（反対に）＋ stare（立つ）が語根。"
        "「反対に立たせる＝対比させる」が原義。"
    )},

    # #275 gene — trivia
    # jeans（複数形）は /dʒiːnz/、gene は /dʒiːn/。同音ではない。
    # jean（単数形）と gene が同音。
    275: {"trivia": (
        "'jean'（デニム生地、単数形）と 'gene'（遺伝子）は /dʒiːn/ と同じ発音の同音異義語。"
        "日常的に使われる 'jeans' は複数形なので /dʒiːnz/ と末尾に z 音が加わり gene とは別。"
        "ジーンズの語源はイタリアの都市ジェノバ（Genoa）で、遺伝子とは全く無関係。"
    )},

    # #366 crisis — trivia
    # JFK 演説の年が不確か。年号を外し「1950年代後半」に変更。
    366: {"trivia": (
        "「危機＝危険＋機会」という解釈はジョン・F・ケネディが1950年代後半の演説で広めたが、"
        "これは俗説で学術的には誤りとされる。"
        "漢字「機」の本来の意味は「きざし・転換点」であり「チャンス（好機）」ではない。"
        "英語圏では今もこの誤訳が motivational speech でしばしば引用される。"
    )},

    # #372 court — trivia
    # 「王の中庭で裁判も試合も行われた」という単純化を修正。
    372: {"trivia": (
        "英語の 'court' はスポーツの「コート」、王様の「宮廷」、「裁判所」すべてを表す。"
        "語源はラテン語 cohors（囲い・中庭）。"
        "王の中庭（courtyard）が政治・法律の中心地となり「裁判所」の意味が生まれ、"
        "「コート」は囲まれた競技場・施設に使われるようになった。"
    )},

    # #389 nuclear — tips
    # 誤った発音しか示しておらず、正しい発音記号が不明。
    389: {"tips": (
        "発音は /ˈnjuːkliər/（英）または /ˈnuːkliər/（米）。"
        "「ニュークヤー」のような /njuːkjələr/ は誤りで「nukular 問題」と呼ばれる有名な発音ミス。"
        "アメリカの大統領でさえ間違えたことで知られるほどよくある誤り。"
    )},

    # #438 breathe — etymology
    # 「名詞から動詞が派生」という方向の記述を中立的に改める。
    438: {"etymology": (
        "古英語 brǣþ（息・蒸気）が語根。"
        "名詞 breath と動詞 breathe は同じ語根から発展した。"
        "語末の -e が動詞であることを示し、子音の違い（breath は th 無声音、"
        "breathe は th 有声音 /ð/）も併せて覚えておくと区別しやすい。"
    )},

    # #551 democracy — trivia
    # デモの demo は demo(nstration) でラテン語 de+monstrare。demos（人民）とは別語源。
    551: {"trivia": (
        "「デモ（demo）」という略語は 'demonstration'（示威運動）の略で、"
        "ラテン語 de-（完全に）＋ monstrare（示す）から来ている。"
        "democracy の demos（人民）とは語源が異なる偶然の一致。"
        "それでもデモ活動が「民衆の意思を示す行動」である点はたまたまぴったりなのが面白い。"
    )},

    # #612 bother — etymology
    # アイルランド語起源は諸説あり、確定的でない。
    612: {"etymology": (
        "語源は諸説あり確定していない。"
        "アイルランド語 buaidhirt（悩み・不安）から英語に入ったとする説があるが、"
        "古ノルド語や中世英語に由来する可能性も指摘されている。"
        "語源が不明確な単語の一つ。"
    )},

    # #661 shelter — etymology
    # 中英語 sheltron を経由している点を補足。
    661: {"etymology": (
        "中英語 sheltron（盾で守られた隊列）を経て、"
        "古英語 scieldtruma（盾の部隊）にさかのぼる。"
        "scield（盾）＋ truma（隊列）から「盾で守る」→「保護・避難」へと意味が発展した。"
    )},

    # #671 fault — etymology
    # fallere は間接的な語根。直接の語源は古フランス語 faute。
    671: {"etymology": (
        "古フランス語 faute（不足・欠如）が直接の語源。"
        "さらに遡ると Vulgar Latin *fallita（失敗）、ラテン語 fallere（誤る・失敗する）と関連する。"
        "fall（失敗）と同根語。"
    )},

    # #788 subtle — trivia
    # 中世英語のスペルは "suttle" ではなく "sotil" や "sutil"。
    788: {"trivia": (
        "subtle の b はサイレントだが、なぜ残っているの？"
        "中世英語では 'sotil' や 'sutil' と書いていたが（古フランス語 sotil から）、"
        "ルネサンス期にラテン語語源（subtilis）に合わせて 'b' が追加されたのに"
        "発音はそのまま変わらなかったという面白い歴史がある！"
    )},

    # #871 luxury — trivia
    # 英語発音は英国式「ラクシャリ」米国式「ラグジュアリ」の両方を示す。
    871: {"trivia": (
        "'luxury tax'（贅沢税）は宝石や高級車などにかかる税金で、"
        "アメリカではスポーツ選手の高額年俸にも適用されることがある。"
        "「ラグジュアリー」はすでに日本語のカタカナ語として定着しているが、"
        "英語の発音は英国式 /ˈlʌkʃəri/（ラクシャリ）、米国式 /ˈlʌɡʒəri/（ラグジュアリ）と異なる。"
    )},

    # #895 collective — tips
    # 英米の単数/複数の違いは傾向であり絶対ではない。
    895: {"tips": (
        "'collective noun'（集合名詞）は文法用語としても重要。例えば 'team', 'family' など。"
        "英国英語では複数扱いが多く（\"The team are playing\"）、"
        "米国英語では単数扱いが基本（\"The team is playing\"）。"
        "ただし絶対的なルールではなく、文脈や文体によって使い分けられる。"
    )},

    # #1051 adolescent — trivia
    # adolescere は「成長する」の意味。「燃え上がる」は誤り。
    1051: {"trivia": (
        "ラテン語 adolescere（成長する）が語源。"
        "ad-（向かって）＋ alere（育てる・養う）の合成で「成長していく」が原義。"
        "同語根に adult（大人）、alimentary（栄養の）がある。"
        "思春期は「燃えるような感情」の時期でもあるが、語源には「燃える」の意味は含まれない。"
    )},

    # #1065 fatigue — tips
    # 「グ（gの音のみ）」という表現が意味不明。明確に言い直す。
    1065: {"tips": (
        "発音は /fəˈtiːɡ/。語尾の '-gue' は g 音で終わり、母音を付けて「グー」とは読まない。"
        "日本人は「ファティーグ」と発音しがちだが、アクセントは第2音節（faˈtigue）。"
        "また軍事用語として 'fatigues'（戦闘服）という複数形も頻出。"
    )},

    # #1071 file — trivia
    # nail file と document file は語源が異なる別語。
    1071: {"trivia": (
        "実は 'file'（書類・ファイル）と 'nail file'（爪やすり）は語源が異なる別語が"
        "偶然同じ綴りになった例。"
        "書類の file は古フランス語 filer（糸に通す）→文書を糸や針金で綴じた習慣から。"
        "やすりの file は古英語 fēol（やすり）から来ている。"
        "同じ綴りで全く無関係な語が存在する英語の面白さが詰まった例。"
    )},

    # #1151 caution — etymology
    # cave（洞窟）は cavus（空洞）由来で cavere（警戒する）とは別語根。
    1151: {"etymology": (
        "ラテン語 cautio（用心）← cavere（気をつける・警戒する）が語源。"
        "同根語に precaution（予防措置）がある。"
        "なお 'cave'（洞窟）はラテン語 cavus（空洞）から来ており、caution とは語根が異なる別語。"
    )},

    # #1161 reef — trivia
    # グレートバリアリーフが月から見えるという記述は誤り。
    1161: {"trivia": (
        "Great Barrier Reef（グレートバリアリーフ）は世界最大のサンゴ礁。"
        "総面積は約34万km²（日本の約90%）で、生物由来の構造物としては地球最大のもの。"
        "「宇宙からも見える」「月から見える」と言われることがあるが、これは誇張であり科学的には誤り。"
        "ただし宇宙ステーションから撮影された写真には映ることがある。"
    )},

    # #1214 drag — tips
    # drug は drag の方言的過去形（dialectal）として一部地域で存在するが、薬の drug とは別。
    1214: {"tips": (
        "PC のドラッグ＆ドロップの「ドラッグ」はこの語。"
        "活用は 'dragged / dragging'（g を重ねる）。"
        "一部方言・口語では過去形に 'drug' を使う（\"He drug it home\"）例があるが標準的でなく、"
        "薬を意味する 'drug' とは全く別の語なので混同しないよう注意。"
    )},

    # #1256 priest — trivia
    # Harry Potter の記述が事実誤認で論理破綻。語源の正確な trivia に差し替え。
    1256: {"trivia": (
        "ラテン語 presbyter（長老・司祭）← ギリシャ語 presbyteros（年長者）が語源で、"
        "古英語で 'preost' → 'priest' へと変化した。"
        "同語根に Presbyterian（長老派）がある。"
        "英国国教会では今も priest（司祭）の称号が使われており、"
        "宗教改革後1000年以上の歴史を持つ称号が現代まで続いている。"
    )},

    # #1395 hostile — etymology
    # hostis と hospes は別語根とも言われるが、PIE 共通祖語からの派生とする説も。
    1395: {"etymology": (
        "ラテン語 hostis（敵・外国人）が語源。"
        "hostis と host（主人）はともに印欧祖語 *ghos-ti-（見知らぬ人・客人）から派生したとされる。"
        "「見知らぬ人」が状況によって「敵」にも「客」にもなり得たという"
        "古代の世界観が hostis / hospes の両語に反映されている。"
    )},

    # #1413 sigh — confusables
    # sight /saɪt/ と sigh /saɪ/ は同音ではない（末尾のt音の有無）。
    1413: {"confusables": (
        "sign（サイン /saɪn/）や sight（視力 /saɪt/）と混同されやすいが、"
        "発音は sigh /saɪ/、sign /saɪn/、sight /saɪt/ とそれぞれ異なる。"
        "いずれも綴りが似ているため、スペルと発音の両方を意識して覚えよう。"
    )},

    # #1449 dairy — confusables
    # dairy の発音は /ˈdɛri/ ではなく /ˈdeəri/（英）または /ˈderi/（米）。
    1449: {"confusables": (
        "dairy（乳製品・酪農）と diary（日記）は日本人学習者が最も混同しやすいペア。"
        "発音は dairy /ˈdeəri/（英）/ˈderi/（米）、diary /ˈdaɪəri/ と明確に異なる。"
        "また綴りも dairy vs. diary と紛らわしいので意識して覚えよう。"
    )},

    # #1621 coincide — trivia
    # coin（コイン）とは無関係。co- + incidere（起きる）が語源。
    1621: {"trivia": (
        "「コインシデンス（偶然の一致）」は日本語にもカタカナで入ってきている。"
        "語源はラテン語 co-（共に）＋ incidere（落ちる・起きる）の合成で「同時に起きる」が原義。"
        "「コイン」とは無関係なので注意。"
    )},

    # #1703 console — trivia
    # 慰める console も家具/操作台の console も同じラテン語語根から。
    1703: {"trivia": (
        "PlayStation などの「ゲームコンソール」も同じ語。"
        "元々は壁に取り付ける「支持台・飾り台」を指す建築用語が、"
        "やがて操作卓・制御盤全般を指すように拡大した。"
        "慰める動詞 console もラテン語 consolari（共に力づける）に由来し、同じ語根をもつ。"
    )},

    # #1721 plug — confusables
    # 「plug out」は誤り。正しくは unplug。
    1721: {"confusables": (
        "plug in（差し込む）の逆は 'plug out' ではなく unplug（抜く）が正しい。"
        "'plug out' は標準的な英語として存在しない表現なので注意。"
        "また plug（宣伝する）は promote より口語的なニュアンス。"
    )},

    # #1752 grid — etymology
    # gridiron は中英語（Middle English）。古英語ではない。
    1752: {"etymology": (
        "中英語 gridiron（格子状の焼き網）を短縮したもの。"
        "gridiron は Old French から来ており、"
        "さらに Vulgar Latin *graticulam（小さな格子）に遡る。"
        "アメリカンフットボールのフィールドも格子状のラインから 'gridiron' と呼ばれる。"
    )},

    # #1782 vocational — etymology
    # vocatio＋-al が正確。vocare に直接 -al をつけると -al が二重になる印象。
    1782: {"etymology": (
        "ラテン語 vocatio（召命・呼びかけ）← vocare（呼ぶ）から。"
        "vocatio＋-al（形容詞化）で「天職に関する」という意味。"
        "「神に呼ばれた仕事＝天職」という概念が語源で、vocation（職業・使命）と同語根。"
    )},

    # #1788 ripe — etymology
    # ripe と reap は語源が異なる。reap との同語根説は不確か。
    1788: {"etymology": (
        "古英語 rīpe（熟した）から。"
        "ゲルマン系語根 *rīpaz（熟した・収穫の準備ができた）に由来し、「収穫できる状態」を意味した。"
        "ripeness（熟度）、ripen（熟させる）も同語根。"
    )},

    # #1803 merge — etymology
    # mergere は「沈める（他動詞）」。自動詞「沈む」は原義ではない。
    1803: {"etymology": (
        "ラテン語 mergere（沈める・浸す）から。"
        "物を液体に沈める・浸すイメージから「一つに溶け込む＝合わさる」という意味へと発展した。"
        "同根語に emerge（浮かび上がる）、submerge（水没させる）がある。"
    )},

    # #1843 diplomacy — trivia
    # shuttle は宇宙船の意味もある。「宇宙ではなく」という記述は不正確。
    1843: {"trivia": (
        "「シャトル外交（shuttle diplomacy）」という言葉は、"
        "1970年代に米国務長官キッシンジャーが中東諸国を往復して交渉したことが起源。"
        "ここでの 'shuttle' は機織り機の往復する梭（ひ）のイメージ。"
        "往復運動全般を表す語として、スペースシャトルにも同じ語が使われている。"
    )},

    # #1869 mold — etymology
    # カビの mold は古ノルド語 mygla 由来。mucor との直接関連は不確か。
    1869: {"etymology": (
        "2つの異なる語源がある。"
        "カビの mold は中英語 moulde から来ており、古ノルド語 mygla（かびる）と関連する。"
        "型の mold は古フランス語 modle（型）から、さらにラテン語 modulus（基準・尺度）に由来。"
        "同じ綴りで異なる語源を持つ典型例。"
    )},
}


def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        data = json.load(f)

    index = {e["id"]: e for e in data}
    changed = []

    passive_fields = {"tips", "confusables", "trivia", "etymology"}

    for entry_id, field_fixes in sorted(FIXES.items()):
        entry = index.get(entry_id)
        if not entry:
            print(f"[WARN] id={entry_id} が見つかりません")
            continue

        for field, new_text in field_fixes.items():
            if field in passive_fields:
                old = entry["passive"].get(field, "")
                entry["passive"][field] = new_text
            else:
                old = entry.get(field, "")
                entry[field] = new_text

            word = entry.get("word", "")
            print(f"  [id={entry_id:4d}] {word:20s} ({field}): 修正完了")

        changed.append(entry_id)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n=== Phase 1 修正完了: {len(changed)} エントリ ===")
    print(f"  出力: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
