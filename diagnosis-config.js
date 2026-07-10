// 初心者向けメモ:
// 診断の質問文、選択肢、点数配分、結果文、料金はこのファイルで変更できます。
// scores の数字を変えると、どの学習スタイルが出やすいかを調整できます。
window.REVIA_DIAGNOSIS_CONFIG = {
  styles: {
    self: {
      label: "自学自習中心でも可能",
      lead: "自分で調べ、計画を立てて進める力が比較的高いタイプです。",
      reason:
        "教材や学習計画が整理できていれば、自学自習でも力を伸ばしやすい状態です。必要に応じて、分からない単元だけ個別相談や短期サポートを使うと効率が上がります。",
    },
    group: {
      label: "集団塾向き",
      lead: "周囲の刺激を受けながら、決まったペースで学ぶことで力を伸ばしやすいタイプです。",
      reason:
        "同じ目標を持つ生徒の中で学ぶことが励みになりやすく、授業のペースに乗ることで学習習慣を作りやすい傾向があります。質問しづらい場合や苦手科目を重点的に見たい場合は、個別指導も選択肢になります。",
    },
    individual: {
      label: "個別指導塾向き",
      lead: "苦手単元や学校進度に合わせて、近くで見てもらう学び方が合いやすいタイプです。",
      reason:
        "分からないところをその場で確認しながら進めることで、つまずきを解消しやすい状態です。通塾の負担が大きい場合や家庭で落ち着いて受けられる場合は、オンライン家庭教師も検討できます。",
    },
    inPersonTutor: {
      label: "対面家庭教師向き",
      lead: "家庭での学習環境を整えながら、近くで細かく見てもらう学び方が合いやすいタイプです。",
      reason:
        "自宅での集中や学習管理に課題があり、直接そばで見守ってもらうことで安心して進めやすい傾向があります。移動時間を減らしたい場合は、オンラインで同じように1対1の伴走を受ける方法もあります。",
    },
    onlineTutor: {
      label: "オンライン家庭教師向き",
      lead: "移動時間を減らしながら、1対1で学習計画と理解を整える学び方が合いやすいタイプです。",
      reason:
        "家庭で授業を受ける環境があり、画面越しでも質問や課題共有ができそうな状態です。オンラインは便利な一方で、通信環境や宿題管理の仕組みを先に確認しておくと、より安定して続けやすくなります。",
    },
  },

  prices: {
    60: 5500,
    80: 6600,
    100: 8800,
  },

  weeklyPlans: {
    "週1回": 4,
    "週2回": 8,
    "週3回": 12,
    "週4回以上": 16,
  },

  advancedNote:
    "アドバンス講師を希望される場合は、月4回あたり＋8,800円が目安です。実際の必要回数・科目・学習状況は無料相談で確認します。",

  recommendationRules: {
    lessonMinutes: [
      { value: 100, conditions: [{ questionId: "supportLevel", optionIds: ["veryCareful"] }] },
      { value: 100, conditions: [{ questionId: "mainConcern", optionIds: ["exam", "topSchool"] }] },
      { value: 100, conditions: [{ questionId: "problem", optionIds: ["application", "noTime"] }] },
      { value: 80, conditions: [{ questionId: "achievement", optionIds: ["veryWeak", "belowAverage"] }] },
      { value: 80, conditions: [{ questionId: "mainConcern", optionIds: ["test", "weakness", "method"] }] },
      { value: 80, conditions: [{ questionId: "supportLevel", optionIds: ["weekly", "careful"] }] },
    ],
    weeklySessions: [
      { value: "週4回以上", conditions: [{ questionId: "supportLevel", optionIds: ["veryCareful"] }] },
      {
        value: "週3回",
        conditions: [
          { questionId: "achievement", optionIds: ["veryWeak"] },
          { questionId: "deadline", optionIds: ["oneMonth", "nextTest"] },
        ],
      },
      { value: "週2回", conditions: [{ questionId: "mainConcern", optionIds: ["exam", "topSchool"] }] },
      { value: "週2回", conditions: [{ questionId: "supportLevel", optionIds: ["careful"] }] },
      {
        value: "週2回",
        conditions: [
          { questionId: "homeStudy", optionIds: ["zero"] },
          { questionId: "planning", optionIds: ["weak", "none"] },
        ],
      },
    ],
    defaultLessonMinutes: 60,
    defaultWeeklySessions: "週1回",
  },

  onlineCautionRules: [
    {
      text: "静かに話せる場所を確保できるか、授業前に確認しておくと安心です。",
      conditions: [{ questionId: "quietPlace", optionIds: ["notMuch", "none"] }],
    },
    {
      text: "端末・通信環境・カメラや音声の接続確認を、初回前に一度行うことをおすすめします。",
      conditions: [{ questionId: "device", optionIds: ["anxious", "difficult"] }],
    },
    {
      text: "Zoomなどに慣れていない場合は、最初の面談で操作方法も確認してから始めると負担が少なくなります。",
      conditions: [{ questionId: "zoom", optionIds: ["strong", "never"] }],
    },
    {
      text: "画面越しの集中が心配な場合は、授業時間を短めから始めて、慣れてから伸ばす方法もあります。",
      conditions: [{ questionId: "screenFocus", optionIds: ["anxious", "veryAnxious"] }],
    },
    {
      text: "宿題や課題の提出方法を事前に決めておくと、オンラインでも学習管理がしやすくなります。",
      conditions: [{ questionId: "onlineHomework", optionIds: ["strong", "unknown"] }],
    },
  ],

  defaultOnlineCaution:
    "オンライン学習では、質問のタイミング、宿題の共有方法、通信環境を最初に決めておくと安定して続けやすくなります。",

  questions: [
    {
      id: "grade",
      title: "学年を選んでください。",
      type: "single",
      options: [
        { id: "elementary", label: "小学生" },
        { id: "junior", label: "中学生" },
        { id: "high", label: "高校生" },
        { id: "ronin", label: "浪人生" },
        { id: "other", label: "その他" },
      ],
    },
    {
      id: "subject",
      title: "主に相談したい科目を選んでください。",
      type: "subject",
      dependsOn: "grade",
      optionsByAnswer: {
        elementary: ["国語", "算数", "英語", "理科", "社会"],
        junior: ["英語", "数学", "国語", "理科", "社会"],
        high: ["英語", "数学IA", "数学IIB", "数学IIIC", "現代文", "古典", "物理", "化学", "生物", "社会"],
        ronin: ["英語", "数学IA", "数学IIB", "数学IIIC", "現代文", "古典", "物理", "化学", "生物", "社会", "小論文", "その他受験科目"],
        other: ["英語", "数学", "国語", "理科", "社会", "その他"],
      },
    },
    {
      id: "achievement",
      title: "現在の成績状況に近いものを選んでください。",
      options: [
        { id: "veryWeak", label: "かなり苦手", scores: { individual: 3, inPersonTutor: 3, onlineTutor: 1 } },
        { id: "belowAverage", label: "平均より下", scores: { individual: 3, inPersonTutor: 2, onlineTutor: 1 } },
        { id: "average", label: "平均くらい", scores: { group: 2, individual: 2, onlineTutor: 1 } },
        { id: "aboveAverage", label: "平均より上", scores: { self: 2, group: 2, onlineTutor: 1 } },
        { id: "topAim", label: "上位を目指している", scores: { self: 2, group: 2, onlineTutor: 1 } },
      ],
    },
    {
      id: "mainConcern",
      title: "今回一番相談したいことは何ですか？",
      options: [
        { id: "habit", label: "勉強習慣", scores: { inPersonTutor: 3, individual: 2, onlineTutor: 1 } },
        { id: "test", label: "定期テスト", scores: { group: 2, individual: 3, onlineTutor: 1 } },
        { id: "exam", label: "受験対策", scores: { group: 3, individual: 2, onlineTutor: 2 } },
        { id: "weakness", label: "苦手克服", scores: { individual: 3, inPersonTutor: 2, onlineTutor: 2 } },
        { id: "method", label: "勉強方法", scores: { individual: 3, onlineTutor: 2, self: 1 } },
        { id: "schoolPace", label: "学校の授業についていきたい", scores: { individual: 3, inPersonTutor: 2, onlineTutor: 1 } },
        { id: "topSchool", label: "上位校・難関校対策", scores: { group: 3, self: 2, onlineTutor: 2 } },
      ],
    },
    {
      id: "homeStudy",
      title: "家での学習時間はどれくらいですか？",
      options: [
        { id: "zero", label: "ほぼ0", scores: { inPersonTutor: 3, individual: 2 } },
        { id: "oneTwo", label: "週1〜2日", scores: { individual: 2, onlineTutor: 1 } },
        { id: "threeFour", label: "週3〜4日", scores: { group: 2, self: 1, onlineTutor: 1 } },
        { id: "daily", label: "ほぼ毎日", scores: { self: 3, onlineTutor: 1 } },
        { id: "many", label: "かなり多い", scores: { self: 4, group: 1 } },
      ],
    },
    {
      id: "homework",
      title: "学校の宿題・提出物はどの程度できていますか？",
      options: [
        { id: "late", label: "かなり遅れる", scores: { inPersonTutor: 3, individual: 2 } },
        { id: "barely", label: "なんとか出す", scores: { individual: 2, onlineTutor: 1 } },
        { id: "normal", label: "普通に出す", scores: { group: 2, onlineTutor: 1 } },
        { id: "careful", label: "丁寧に出す", scores: { self: 2, group: 1 } },
        { id: "easy", label: "余裕がある", scores: { self: 3, group: 1 } },
      ],
    },
    {
      id: "unknownProblem",
      title: "分からない問題が出たとき、どうすることが多いですか？",
      options: [
        { id: "leave", label: "放置する", scores: { inPersonTutor: 3, individual: 3 } },
        { id: "answer", label: "答えを見る", scores: { individual: 2, onlineTutor: 1 } },
        { id: "family", label: "家族に聞く", scores: { inPersonTutor: 2, individual: 1 } },
        { id: "teacherFriend", label: "先生や友人に聞く", scores: { group: 2, individual: 1 } },
        { id: "research", label: "自分で調べて解決する", scores: { self: 4, onlineTutor: 1 } },
      ],
    },
    {
      id: "problem",
      title: "勉強していて一番困っていることは何ですか？",
      options: [
        { id: "whatToDo", label: "何をすればいいか分からない", scores: { individual: 3, inPersonTutor: 2, onlineTutor: 2 } },
        { id: "continue", label: "続かない", scores: { inPersonTutor: 3, individual: 2, onlineTutor: 1 } },
        { id: "understoodButNo", label: "分かったつもりで解けない", scores: { individual: 3, onlineTutor: 2 } },
        { id: "memory", label: "暗記が苦手", scores: { group: 1, individual: 2, onlineTutor: 1 } },
        { id: "application", label: "応用問題が苦手", scores: { individual: 2, onlineTutor: 2, group: 1 } },
        { id: "noTime", label: "時間が足りない", scores: { onlineTutor: 2, self: 1, individual: 1 } },
      ],
    },
    {
      id: "methodConfidence",
      title: "今の勉強方法に自信はありますか？",
      options: [
        { id: "none", label: "ない", scores: { individual: 3, onlineTutor: 2 } },
        { id: "little", label: "あまりない", scores: { individual: 2, onlineTutor: 1 } },
        { id: "normal", label: "普通", scores: { group: 1, individual: 1 } },
        { id: "some", label: "ややある", scores: { self: 2, group: 1 } },
        { id: "much", label: "かなりある", scores: { self: 4 } },
      ],
    },
    {
      id: "lessonStyle",
      title: "授業はどちらが合うと思いますか？",
      options: [
        { id: "everyone", label: "みんなと一緒がよい", scores: { group: 4 } },
        { id: "small", label: "少人数がよい", scores: { individual: 3, group: 1 } },
        { id: "oneToOne", label: "1対1がよい", scores: { inPersonTutor: 3, individual: 3, onlineTutor: 2 } },
        { id: "unknown", label: "まだ分からない", scores: { individual: 1, onlineTutor: 1, group: 1 } },
      ],
    },
    {
      id: "aroundPeople",
      title: "周りに人がいると集中できますか？",
      options: [
        { id: "easy", label: "集中しやすい", scores: { group: 4 } },
        { id: "somewhat", label: "少し集中しやすい", scores: { group: 2, individual: 1 } },
        { id: "either", label: "どちらでもない", scores: { individual: 1, onlineTutor: 1 } },
        { id: "hard", label: "集中しにくい", scores: { inPersonTutor: 2, individual: 2, onlineTutor: 1 } },
      ],
    },
    {
      id: "asking",
      title: "自分から質問するのは得意ですか？",
      options: [
        { id: "good", label: "得意", scores: { self: 2, group: 2, onlineTutor: 1 } },
        { id: "ok", label: "まあまあできる", scores: { group: 1, individual: 1, onlineTutor: 1 } },
        { id: "weak", label: "苦手", scores: { individual: 3, inPersonTutor: 3, onlineTutor: 1 } },
        { id: "almostNo", label: "ほとんどできない", scores: { inPersonTutor: 3, individual: 3 } },
      ],
    },
    {
      id: "teacherCare",
      title: "先生に細かく見てもらいたいですか？",
      options: [
        { id: "much", label: "かなり見てほしい", scores: { inPersonTutor: 4, individual: 3, onlineTutor: 2 } },
        { id: "some", label: "ある程度見てほしい", scores: { individual: 2, onlineTutor: 1 } },
        { id: "whenNeed", label: "必要な時だけでよい", scores: { self: 2, group: 1 } },
        { id: "myself", label: "自分で進めたい", scores: { self: 4 } },
      ],
    },
    {
      id: "planning",
      title: "勉強計画は自分で立てられますか？",
      options: [
        { id: "can", label: "立てられる", scores: { self: 4 } },
        { id: "little", label: "少しできる", scores: { self: 2, group: 1, onlineTutor: 1 } },
        { id: "weak", label: "苦手", scores: { individual: 3, onlineTutor: 2 } },
        { id: "none", label: "ほとんどできない", scores: { inPersonTutor: 3, individual: 2, onlineTutor: 1 } },
      ],
    },
    {
      id: "quietPlace",
      title: "自宅に静かに授業を受けられる場所はありますか？",
      options: [
        { id: "yes", label: "ある", scores: { onlineTutor: 4, self: 1 } },
        { id: "mostly", label: "だいたいある", scores: { onlineTutor: 3 } },
        { id: "notMuch", label: "あまりない", scores: { individual: 3, group: 2, inPersonTutor: 2 } },
        { id: "none", label: "ない", scores: { group: 3, individual: 3, inPersonTutor: 1 } },
      ],
    },
    {
      id: "device",
      title: "パソコン・タブレット・スマホでオンライン授業を受けられますか？",
      options: [
        { id: "ok", label: "問題ない", scores: { onlineTutor: 4 } },
        { id: "probably", label: "たぶん大丈夫", scores: { onlineTutor: 2 } },
        { id: "anxious", label: "少し不安", scores: { individual: 2, inPersonTutor: 2 } },
        { id: "difficult", label: "難しい", scores: { individual: 3, inPersonTutor: 3, group: 2 } },
      ],
    },
    {
      id: "zoom",
      title: "Zoomなどのオンライン通話に抵抗はありますか？",
      options: [
        { id: "none", label: "ない", scores: { onlineTutor: 4 } },
        { id: "little", label: "少しある", scores: { individual: 2, onlineTutor: 1 } },
        { id: "strong", label: "かなりある", scores: { inPersonTutor: 3, individual: 3 } },
        { id: "never", label: "使ったことがない", scores: { individual: 2, inPersonTutor: 2 } },
      ],
    },
    {
      id: "screenFocus",
      title: "画面越しでも先生の話を集中して聞けそうですか？",
      options: [
        { id: "can", label: "できる", scores: { onlineTutor: 4 } },
        { id: "probably", label: "たぶんできる", scores: { onlineTutor: 2 } },
        { id: "anxious", label: "少し不安", scores: { individual: 3, inPersonTutor: 2 } },
        { id: "veryAnxious", label: "かなり不安", scores: { inPersonTutor: 4, individual: 3 } },
      ],
    },
    {
      id: "onlineHomework",
      title: "宿題や課題をオンラインでやり取りすることに抵抗はありますか？",
      options: [
        { id: "none", label: "ない", scores: { onlineTutor: 4, self: 1 } },
        { id: "little", label: "少しある", scores: { individual: 2, onlineTutor: 1 } },
        { id: "strong", label: "かなりある", scores: { individual: 3, inPersonTutor: 2 } },
        { id: "unknown", label: "分からない", scores: { individual: 2 } },
      ],
    },
    {
      id: "parentStatus",
      title: "保護者の方は学習状況をどの程度把握していますか？",
      options: [
        { id: "much", label: "かなり把握している", scores: { self: 1, onlineTutor: 2 } },
        { id: "some", label: "ある程度把握している", scores: { onlineTutor: 2, individual: 1 } },
        { id: "little", label: "あまり把握していない", scores: { inPersonTutor: 2, individual: 2 } },
        { id: "student", label: "本人に任せている", scores: { self: 2, group: 1 } },
      ],
    },
    {
      id: "commute",
      title: "通塾・移動時間についてどう感じていますか？",
      options: [
        { id: "ok", label: "問題ない", scores: { group: 2, individual: 2 } },
        { id: "little", label: "少し負担", scores: { onlineTutor: 2, inPersonTutor: 1 } },
        { id: "heavy", label: "かなり負担", scores: { onlineTutor: 4 } },
        { id: "noMove", label: "できれば移動したくない", scores: { onlineTutor: 4, inPersonTutor: 2 } },
      ],
    },
    {
      id: "homeTime",
      title: "家庭で勉強時間を確保しやすいですか？",
      options: [
        { id: "easy", label: "しやすい", scores: { self: 2, onlineTutor: 2 } },
        { id: "ok", label: "まあまあ", scores: { onlineTutor: 1, individual: 1 } },
        { id: "littleHard", label: "少し難しい", scores: { group: 2, individual: 1 } },
        { id: "hard", label: "かなり難しい", scores: { group: 2, individual: 2, inPersonTutor: 2 } },
      ],
    },
    {
      id: "supportLevel",
      title: "どれくらいのサポートを希望しますか？",
      options: [
        { id: "light", label: "軽く相談したい", scores: { self: 3, onlineTutor: 1 } },
        { id: "weekly", label: "週1で整えたい", scores: { individual: 2, onlineTutor: 2 } },
        { id: "careful", label: "しっかり伴走してほしい", scores: { individual: 3, inPersonTutor: 3, onlineTutor: 2 } },
        { id: "veryCareful", label: "かなり手厚く見てほしい", scores: { inPersonTutor: 4, individual: 3, onlineTutor: 2 } },
      ],
    },
    {
      id: "deadline",
      title: "いつまでに成果を出したいですか？",
      options: [
        { id: "oneMonth", label: "1か月以内", scores: { individual: 2, inPersonTutor: 1, onlineTutor: 1 } },
        { id: "nextTest", label: "次の定期テストまで", scores: { individual: 2, group: 1, onlineTutor: 1 } },
        { id: "threeMonths", label: "3か月以内", scores: { onlineTutor: 1, individual: 1 } },
        { id: "halfYear", label: "半年以上かけて", scores: { self: 1, group: 1 } },
        { id: "exam", label: "受験まで", scores: { group: 2, individual: 1, onlineTutor: 1 } },
      ],
    },
  ],
};
