const config = window.REVIA_DIAGNOSIS_CONFIG;
const diagnosisForm = document.querySelector("#diagnosisForm");
const questionsRoot = document.querySelector("#diagnosisQuestions");
const resultRoot = document.querySelector("#diagnosisResult");
const progressText = document.querySelector("#diagnosisProgress");
const messageRoot = document.querySelector("#diagnosisMessage");

const styleIds = Object.keys(config.styles);
const questionsById = new Map(config.questions.map((question) => [question.id, question]));

const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });

const formatYen = (amount) => `¥${Number(amount).toLocaleString("ja-JP")}`;

const getSelectedValue = (questionId) => {
  const checked = diagnosisForm.querySelector(`input[name="${questionId}"]:checked`);
  return checked ? checked.value : "";
};

const getOptionsForQuestion = (question, answers = {}) => {
  if (question.type !== "subject") {
    return question.options || [];
  }

  const parentAnswer = answers[question.dependsOn] || getSelectedValue(question.dependsOn);
  const subjectLabels = question.optionsByAnswer[parentAnswer] || [];
  return subjectLabels.map((label) => ({ id: label, label }));
};

const findOption = (question, optionId, answers = {}) => getOptionsForQuestion(question, answers).find((option) => option.id === optionId);

const renderOptions = (question, currentValue = "") => {
  const options = getOptionsForQuestion(question);

  if (question.type === "subject" && options.length === 0) {
    return '<p class="diagnosis-empty">先に学年を選択してください。</p>';
  }

  return options
    .map((option, optionIndex) => {
      const inputId = `${question.id}-${optionIndex}`;
      const checked = option.id === currentValue ? " checked" : "";
      return `
        <label class="diagnosis-option" for="${escapeHtml(inputId)}">
          <input id="${escapeHtml(inputId)}" type="radio" name="${escapeHtml(question.id)}" value="${escapeHtml(option.id)}"${checked} />
          <span>${escapeHtml(option.label)}</span>
        </label>
      `;
    })
    .join("");
};

const renderQuestions = () => {
  questionsRoot.innerHTML = config.questions
    .map(
      (question, index) => `
        <fieldset class="diagnosis-question-card" data-question-id="${escapeHtml(question.id)}">
          <legend>
            <span>Q${index + 1}</span>
            ${escapeHtml(question.title)}
          </legend>
          <div class="diagnosis-options">
            ${renderOptions(question)}
          </div>
        </fieldset>
      `,
    )
    .join("");
};

const updateSubjectOptions = () => {
  const subjectQuestion = questionsById.get("subject");
  const subjectFieldset = questionsRoot.querySelector('[data-question-id="subject"]');

  if (!subjectQuestion || !subjectFieldset) {
    return;
  }

  const currentSubject = getSelectedValue("subject");
  const validSubjectIds = getOptionsForQuestion(subjectQuestion).map((option) => option.id);
  const nextValue = validSubjectIds.includes(currentSubject) ? currentSubject : "";
  subjectFieldset.querySelector(".diagnosis-options").innerHTML = renderOptions(subjectQuestion, nextValue);
};

const collectAnswers = () => {
  const answers = {};
  const missing = [];

  config.questions.forEach((question) => {
    const value = getSelectedValue(question.id);

    if (!value) {
      missing.push(question);
      return;
    }

    answers[question.id] = value;
  });

  return { answers, missing };
};

const updateProgress = () => {
  const { answers } = collectAnswers();
  const answeredCount = Object.keys(answers).length;
  progressText.textContent = `${answeredCount}/${config.questions.length}問 回答済み`;
};

const scoreAnswers = (answers) => {
  const scores = Object.fromEntries(styleIds.map((styleId) => [styleId, 0]));

  config.questions.forEach((question) => {
    const option = findOption(question, answers[question.id], answers);

    if (!option || !option.scores) {
      return;
    }

    Object.entries(option.scores).forEach(([styleId, score]) => {
      scores[styleId] += score;
    });
  });

  return styleIds
    .map((styleId) => ({
      id: styleId,
      score: scores[styleId],
      ...config.styles[styleId],
    }))
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return styleIds.indexOf(first.id) - styleIds.indexOf(second.id);
    });
};

const conditionMatches = (condition, answers) => {
  const answer = answers[condition.questionId];

  if (!answer) {
    return false;
  }

  if (condition.optionIds) {
    return condition.optionIds.includes(answer);
  }

  if (condition.notOptionIds) {
    return !condition.notOptionIds.includes(answer);
  }

  return true;
};

const ruleMatches = (rule, answers) => rule.conditions.every((condition) => conditionMatches(condition, answers));

const pickRuleValue = (rules, answers, defaultValue) => {
  const matchedRule = rules.find((rule) => ruleMatches(rule, answers));
  return matchedRule ? matchedRule.value : defaultValue;
};

const calculateRecommendation = (answers) => {
  const lessonMinutes = pickRuleValue(
    config.recommendationRules.lessonMinutes,
    answers,
    config.recommendationRules.defaultLessonMinutes,
  );
  const weeklySessions = pickRuleValue(
    config.recommendationRules.weeklySessions,
    answers,
    config.recommendationRules.defaultWeeklySessions,
  );
  const sessionsPerMonth = config.weeklyPlans[weeklySessions];
  const pricePerLesson = config.prices[lessonMinutes];

  return {
    lessonMinutes,
    weeklySessions,
    sessionsPerMonth,
    pricePerLesson,
    monthlyEstimate: pricePerLesson * sessionsPerMonth,
  };
};

const getOnlineCautions = (answers) => {
  const cautions = config.onlineCautionRules
    .filter((rule) => ruleMatches(rule, answers))
    .map((rule) => rule.text)
    .slice(0, 3);

  return cautions.length > 0 ? cautions : [config.defaultOnlineCaution];
};

const sendAnalyticsEvent = (topCandidate, secondCandidate, recommendation) => {
  if (typeof window.gtag !== "function") {
    return;
  }

  window.gtag("event", "diagnosis_complete", {
    first_candidate: topCandidate.label,
    second_candidate: secondCandidate.label,
    lesson_minutes: recommendation.lessonMinutes,
    weekly_sessions: recommendation.weeklySessions,
  });
};

const sendClickAnalyticsEvent = (eventName) => {
  if (!eventName || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("event", eventName);
};

const renderResult = (rankedStyles, answers) => {
  const first = rankedStyles[0];
  const second = rankedStyles[1];
  const recommendation = calculateRecommendation(answers);
  const cautions = getOnlineCautions(answers);

  resultRoot.hidden = false;
  resultRoot.innerHTML = `
    <div class="diagnosis-result-header">
      <p class="eyebrow">診断結果</p>
      <h2>今の状況に合いやすい学習スタイル</h2>
      <p>この診断は、現在の学習状況や環境から見た目安です。最終的には、本人の性格・目標・生活リズムを合わせて判断してください。</p>
    </div>

    <div class="diagnosis-result-candidates">
      <article class="diagnosis-candidate primary-candidate">
        <span>第1候補</span>
        <h3>${escapeHtml(first.label)}</h3>
        <p>${escapeHtml(first.lead)}</p>
      </article>
      <article class="diagnosis-candidate">
        <span>第2候補</span>
        <h3>${escapeHtml(second.label)}</h3>
        <p>${escapeHtml(second.lead)}</p>
      </article>
    </div>

    <div class="diagnosis-result-grid">
      <section class="diagnosis-result-panel">
        <h3>その理由</h3>
        <p>${escapeHtml(first.reason)}</p>
        <p>第2候補としては「${escapeHtml(second.label)}」も考えられます。${escapeHtml(second.lead)}</p>
      </section>

      <section class="diagnosis-result-panel">
        <h3>オンライン学習を始める場合の注意点</h3>
        <ul>
          ${cautions.map((caution) => `<li>${escapeHtml(caution)}</li>`).join("")}
        </ul>
      </section>
    </div>

    <section class="diagnosis-recommendation" aria-label="おすすめ授業量と料金目安">
      <div>
        <span>おすすめ授業時間</span>
        <strong>${recommendation.lessonMinutes}分</strong>
      </div>
      <div>
        <span>おすすめ週回数</span>
        <strong>${escapeHtml(recommendation.weeklySessions)}</strong>
      </div>
      <div>
        <span>月額目安</span>
        <strong>${formatYen(recommendation.monthlyEstimate)}</strong>
        <small>${recommendation.lessonMinutes}分 ${formatYen(recommendation.pricePerLesson)} × 月${recommendation.sessionsPerMonth}回</small>
      </div>
    </section>

    <p class="diagnosis-advanced-note">${escapeHtml(config.advancedNote)}</p>

    <div class="diagnosis-result-cta enhanced-result-cta">
      <div>
        <h3>この診断結果をもとに、無料相談で詳しく確認できます</h3>
        <p>
          診断結果はあくまで目安です。実際に必要な授業時間・週回数・科目は、現在の学習状況や目標によって変わります。
          無料相談では、診断結果をもとに、無理のない学習プランを一緒に確認します。
        </p>
        <small>無料相談時に、診断結果をお伝えいただくとスムーズです。</small>
      </div>
      <a class="button primary" href="index.html#booking" data-ga-event="diagnosis_result_booking_click">この結果をもとに無料相談する</a>
    </div>
  `;

  sendAnalyticsEvent(first, second, recommendation);
  resultRoot.scrollIntoView({ behavior: "smooth", block: "start" });
};

renderQuestions();
updateProgress();

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-ga-event]");

  if (!target) {
    return;
  }

  sendClickAnalyticsEvent(target.dataset.gaEvent);
});

diagnosisForm.addEventListener("change", (event) => {
  if (event.target.name === "grade") {
    updateSubjectOptions();
  }

  messageRoot.textContent = "";
  updateProgress();
});

diagnosisForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const { answers, missing } = collectAnswers();

  if (missing.length > 0) {
    const firstMissing = missing[0];
    messageRoot.textContent = `未回答の質問があります。「${firstMissing.title}」を選択してください。`;
    questionsRoot.querySelector(`[data-question-id="${firstMissing.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const rankedStyles = scoreAnswers(answers);
  renderResult(rankedStyles, answers);
});
