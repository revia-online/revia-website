(function (root, factory) {
  const config = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = config;
  }

  if (root) {
    root.REVIA_TEST_STUDY_DIAGNOSIS_CONFIG = config;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const standardOptions = [
    { id: "done", label: "できた", score: 3 },
    { id: "mostly_done", label: "だいたいできた", score: 2 },
    { id: "not_much", label: "あまりできなかった", score: 1 },
    { id: "not_done", label: "できなかった", score: 0 },
  ];

  const progressOptions = [
    { id: "gte_90", label: "90％以上", score: 3 },
    { id: "pct_70_89", label: "70〜89％", score: 2 },
    { id: "pct_50_69", label: "50〜69％", score: 1 },
    { id: "lt_50", label: "50％未満", score: 0 },
  ];

  const fields = [
    {
      id: "preparation",
      label: "準備・スタート",
      questions: ["q1", "q2", "q3", "q4"],
      advicePriority: ["q1", "q2", "q3", "q4"],
      strength: "テスト範囲・必要な教材・残り日数を確認して、勉強を始めるための土台を整える分野です。",
      improvement: "勉強を始める前の確認を一つ増やすと、その後の計画を立てやすくなります。",
    },
    {
      id: "planning",
      label: "計画・優先順位",
      questions: ["q5", "q6", "q7", "q8"],
      advicePriority: ["q5", "q6", "q7", "q8"],
      strength: "教材の締切や勉強量を決め、必要に応じて優先順位を見直す分野です。",
      improvement: "期限と勉強量を具体的にすると、何から進めるかを判断しやすくなります。",
    },
    {
      id: "execution",
      label: "進み具合・実行",
      questions: ["q9", "q10", "q11", "q12"],
      advicePriority: ["q9", "q11", "q12", "q10"],
      strength: "決めた範囲や計画を、テストまでに実際の行動へ移す分野です。",
      improvement: "計画と実際の進み具合を見比べる習慣を作ると、遅れを早めに調整できます。",
    },
    {
      id: "method",
      label: "勉強のやり方",
      questions: ["q13", "q14", "q15", "q16"],
      advicePriority: ["q13", "q14", "q15", "q16"],
      strength: "読むだけで終わらず、自分で答えたり解いたりして理解を確かめる分野です。",
      improvement: "答えや解説を閉じて自分で再現する時間を加えると、理解できたかを確認しやすくなります。",
    },
    {
      id: "mistakes",
      label: "間違えた問題への対応",
      questions: ["q17", "q18", "q19", "q20"],
      advicePriority: ["q17", "q18", "q19", "q20"],
      strength: "間違いの原因を確認し、時間をあけた解き直しや似た問題へつなげる分野です。",
      improvement: "間違えた後の行動を一つ決めておくと、同じつまずきを次の得点につなげやすくなります。",
    },
  ];

  const questions = [
    {
      id: "q1",
      number: 1,
      fieldId: "preparation",
      text: "テスト範囲が発表されたあと、すべての教科の範囲を確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q2",
      number: 2,
      fieldId: "preparation",
      text: "テスト勉強を始める前に、ワークや問題集など「やる必要があるもの」を確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q3",
      number: 3,
      fieldId: "preparation",
      text: "テスト勉強を始めた時点で、テストまでの日数と残っている勉強量を確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q4",
      number: 4,
      fieldId: "preparation",
      text: "「このままのペースで間に合うか」を考えてから勉強を始めましたか？",
      options: standardOptions,
    },
    {
      id: "q5",
      number: 5,
      fieldId: "planning",
      text: "テストまでに、どの教材をいつまでに終わらせるか決めましたか？",
      options: standardOptions,
    },
    {
      id: "q6",
      number: 6,
      fieldId: "planning",
      text: "教科ごとに「何ページ・何問・何単元やるか」など、勉強する量を決めましたか？",
      options: standardOptions,
    },
    {
      id: "q7",
      number: 7,
      fieldId: "planning",
      text: "苦手な教科や、準備が遅れている教科を優先して勉強しましたか？",
      options: standardOptions,
    },
    {
      id: "q8",
      number: 8,
      fieldId: "planning",
      text: "予定より勉強が遅れたとき、残りの日数に合わせて計画を組み直しましたか？",
      options: [
        { id: "not_delayed", label: "予定より遅れていなかった", score: 3 },
        { id: "replanned", label: "計画を組み直した", score: 3 },
        { id: "partly_replanned", label: "少しだけ組み直した", score: 2 },
        { id: "not_replanned", label: "組み直さなかった", score: 0 },
      ],
    },
    {
      id: "q9",
      number: 9,
      fieldId: "execution",
      text: "テスト範囲全体のうち、実際に勉強できた範囲はどのくらいでしたか？",
      options: progressOptions,
    },
    {
      id: "q10",
      number: 10,
      fieldId: "execution",
      text: "学校のワークや提出物を、提出するためだけでなく、テストでできるようになることを意識して取り組みましたか？",
      options: standardOptions,
    },
    {
      id: "q11",
      number: 11,
      fieldId: "execution",
      text: "自分で立てた勉強計画のうち、実際にできたのはどのくらいでしたか？",
      options: progressOptions,
    },
    {
      id: "q12",
      number: 12,
      fieldId: "execution",
      text: "テスト前日の時点で、予定していた勉強はどのくらい終わっていましたか？",
      options: progressOptions,
    },
    {
      id: "q13",
      number: 13,
      fieldId: "method",
      text: "教科書やノートを読むだけでなく、自分で問題を解いて確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q14",
      number: 14,
      fieldId: "method",
      text: "英単語・漢字・用語などの暗記では、答えを見ずに自分で答えられるか確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q15",
      number: 15,
      fieldId: "method",
      text: "英単語・漢字・用語などの暗記以外でも、問題や解説を見たあとに、何も見ず自分の力で解けるか確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q16",
      number: 16,
      fieldId: "method",
      text: "分からなかった問題や間違えた問題について、答えだけでなく「なぜその答えになるのか」「どう解けばよいのか」まで確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q17",
      number: 17,
      fieldId: "mistakes",
      text: "テスト勉強中に間違えた問題を、答えや解説を見ずに、もう一度自分で解き直しましたか？",
      options: standardOptions,
    },
    {
      id: "q18",
      number: 18,
      fieldId: "mistakes",
      text: "間違えたときに、「覚えていなかった」「計算ミス」「問題文の読み違い」など、間違えた原因を確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q19",
      number: 19,
      fieldId: "mistakes",
      text: "一度解き直してできた問題を、時間をあけてもう一度解きましたか？",
      options: standardOptions,
    },
    {
      id: "q20",
      number: 20,
      fieldId: "mistakes",
      text: "間違えた問題と似た問題にも取り組み、同じ考え方を使えるか確認しましたか？",
      options: standardOptions,
    },
    {
      id: "q21",
      number: 21,
      text: "今回のテスト結果は、前回と比べてどうでしたか？",
      shortLabel: "前回との比較",
      options: [
        { id: "much_higher", label: "大きく上がった" },
        { id: "slightly_higher", label: "少し上がった" },
        { id: "same", label: "ほぼ同じ" },
        { id: "slightly_lower", label: "少し下がった" },
        { id: "much_lower", label: "大きく下がった" },
        { id: "not_comparable", label: "比較できない" },
      ],
    },
    {
      id: "q22",
      number: 22,
      text: "今回のテスト結果にどのくらい満足していますか？",
      shortLabel: "今回の満足度",
      options: [
        { id: "very_satisfied", label: "とても満足している" },
        { id: "somewhat_satisfied", label: "まあ満足している" },
        { id: "not_very_satisfied", label: "あまり満足していない" },
        { id: "not_satisfied", label: "満足していない" },
      ],
    },
    {
      id: "q23",
      number: 23,
      text: "次のテストでは、今回と比べてどのくらい上の結果を目指したいですか？",
      shortLabel: "次回の目標",
      options: [
        { id: "raise_much", label: "大きく上げたい" },
        { id: "raise_some", label: "少し上げたい" },
        { id: "maintain", label: "今回と同じくらいを維持したい" },
        { id: "undecided", label: "まだ決めていない" },
      ],
    },
  ];

  return {
    fields,
    steps: [
      { id: "preparation", label: "準備・スタート", questionIds: ["q1", "q2", "q3", "q4"] },
      { id: "planning", label: "計画・優先順位", questionIds: ["q5", "q6", "q7", "q8"] },
      { id: "execution", label: "進み具合・実行", questionIds: ["q9", "q10", "q11", "q12"] },
      { id: "method", label: "勉強のやり方", questionIds: ["q13", "q14", "q15", "q16"] },
      { id: "mistakes", label: "間違えた問題への対応", questionIds: ["q17", "q18", "q19", "q20"] },
      { id: "reflection", label: "結果・目標", questionIds: ["q21", "q22", "q23"] },
    ],
    questions,
    advice: {
      q1: "テスト範囲表を受け取ったら、その日のうちに全教科へ目を通し、確認できた教科にチェックを付けましょう。",
      q2: "勉強を始める前に、教科書・ノート・ワーク・プリント・提出物を、教科ごとに一度書き出しましょう。",
      q3: "最初に「テストまであと何日か」と「残っているページ・単元」を並べ、1日あたりに進める量を出してみましょう。",
      q4: "始める前に、決めた1日分の量で期限までに終わるかを計算し、間に合わなければ開始日や1日分の量を調整しましょう。",
      q5: "教材ごとに「いつまでに終えるか」を決め、カレンダーや予定表に締切を書き込みましょう。",
      q6: "たとえば、「今日は数学をやる」だけでなく、「ワークを10ページ進める」のように、どこまでやるかを具体的に決めてみましょう。",
      q7: "全教科の進み具合を比べ、苦手な教科や準備が遅れている教科から、先に勉強時間を確保しましょう。",
      q8: "予定から遅れた日に、残り日数と残っている量を確認し、翌日以降の計画をその場で組み直しましょう。",
      q9: "テスト範囲を単元やページごとに分け、終わったところへ印を付けて、まだ勉強していない範囲を一つずつ減らしましょう。",
      q10: "提出物は、答えを埋めたあとに間違えた問題へ印を付け、答えを隠してもう一度解くところまでをセットにしましょう。",
      q11: "毎日の終わりに計画と実際にできた量を見比べ、できなかった分は翌日以降へ移して、実行できる量に調整しましょう。",
      q12: "テスト前日を見直しの時間にするため、予定した教材は前々日までに一度終える日程を組んでみましょう。",
      q13: "教科書やノートを読んだら一度閉じ、例題やワークを何も見ずに1問解いて確認しましょう。",
      q14: "英単語・漢字・用語は、答えを隠して書く・声に出すなど、自分だけで答えられるかを確認しましょう。",
      q15: "解き方を見た問題は、その場で終わらせず、解説を閉じて最初から自分の力で解き直しましょう。",
      q16: "分からなかった問題は、「なぜこの答えになるか」と「次に何をすれば解けるか」を、自分の言葉で1行説明してみましょう。",
      q17: "間違えた問題には印を付け、答えと解説を閉じて、途中式や考え方からもう一度解き直しましょう。",
      q18: "間違えた問題の横に、「暗記不足」「計算ミス」「読み違い」「解き方が分からなかった」など、原因を一つ書き残しましょう。",
      q19: "解き直してできた問題には、翌日や2〜3日後など再確認する日を決め、答えを見ずにもう一度解きましょう。",
      q20: "間違えた問題を解き直したら、同じ単元の似た問題をもう1問選び、同じ考え方で解けるか確認しましょう。",
    },
    adviceEmphasis: {
      q6: "どこまでやるかを具体的に決めてみましょう。",
    },
    comparisonCopy: {
      much_higher: "今回は、前回と比べて結果が大きく上がったと感じているのですね。",
      slightly_higher: "今回は、前回と比べて結果が少し上がったと感じているのですね。",
      same: "今回は、前回とほぼ同じ結果だったと感じているのですね。",
      slightly_lower: "今回は、前回と比べて結果が少し下がったと感じているのですね。",
      much_lower: "今回は、前回と比べて結果が大きく下がったと感じているのですね。",
      not_comparable: "今回は、前回との比較が難しいとのことです。",
    },
    satisfactionCopy: {
      satisfied:
        "今回の結果に満足できている部分を大切にしながら、この診断で見つかった「良かったところ」を次回も続けてみましょう。",
      not_satisfied:
        "今回の結果には、まだ改善したい部分があるようです。点数だけで自分を決めつけず、この診断で見つかった「最初に変えること」から一つずつ試してみましょう。",
    },
    goalCopy: {
      raise_much:
        "次回に大きく上げたいという目標に向けて、すべてを一度に変えず、まずは上の行動を一つ、いつ始めるかまで決めてみましょう。",
      raise_some:
        "次回に少し上げたいという目標に向けて、まずは上の行動を一つ、次のテスト勉強に取り入れてみましょう。",
      maintain:
        "今回と同じくらいを維持するため、できていた行動を続けながら、上の行動も無理のない範囲で一つ加えてみましょう。",
      undecided:
        "目標がまだ決まっていなくても大丈夫です。まずは上の行動を一つ試し、そのあとで次回の目標を考えてみましょう。",
    },
  };
});
