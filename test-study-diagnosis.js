(function () {
  const isCommonJs = typeof module === "object" && module.exports;
  const config = isCommonJs ? require("./test-study-diagnosis-config.js") : window.REVIA_TEST_STUDY_DIAGNOSIS_CONFIG;

  if (!config) {
    if (typeof document !== "undefined") {
      const message = document.querySelector("#testDiagnosisMessage");
      if (message) {
        message.textContent = "診断を読み込めませんでした。ページを再読み込みしてください。";
      }
    }
    return;
  }

  const questionsById = new Map(config.questions.map((question) => [question.id, question]));

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return entities[character];
    });

  const getOption = (question, answerId) => question?.options.find((option) => option.id === answerId);

  const validateAnswers = (answers, questionIds = config.questions.map((question) => question.id)) => {
    for (const questionId of questionIds) {
      const question = questionsById.get(questionId);
      if (!question || !getOption(question, answers[questionId])) {
        return { valid: false, missingId: questionId };
      }
    }

    return { valid: true, missingId: "" };
  };

  const getFieldRating = (score) => {
    if (score >= 10) {
      return { symbol: "◎", label: "10〜12点" };
    }
    if (score >= 7) {
      return { symbol: "○", label: "7〜9点" };
    }
    if (score >= 4) {
      return { symbol: "△", label: "4〜6点" };
    }
    return { symbol: "▲", label: "0〜3点" };
  };

  const getStrengthLead = (score) => {
    if (score >= 10) {
      return "特に安定して取り組めていた分野です。";
    }
    if (score >= 7) {
      return "できていた行動が多かった分野です。";
    }
    if (score >= 4) {
      return "今回できていた行動が見つかった分野です。";
    }
    return "次回につなげるための現在地を確認できた分野です。";
  };

  const getImprovementLead = (score) => {
    if (score >= 10) {
      return "よく取り組めています。さらに安定させるなら、次の一歩を一つ選びましょう。";
    }
    if (score >= 7) {
      return "できていることを残しながら、一つだけ整えるとさらに進めやすくなります。";
    }
    return "次回に向けて、まず一つ整えてみたい分野です。";
  };

  const getOverallComment = (answers) => {
    const satisfactionGroup = ["very_satisfied", "somewhat_satisfied"].includes(answers.q22)
      ? "satisfied"
      : "not_satisfied";

    return [
      config.comparisonCopy[answers.q21],
      config.satisfactionCopy[satisfactionGroup],
      config.goalCopy[answers.q23],
    ].join("");
  };

  const calculateResult = (answers) => {
    const validation = validateAnswers(answers);
    if (!validation.valid) {
      throw new Error(`Invalid or missing answer: ${validation.missingId}`);
    }

    const itemScores = {};
    config.questions.slice(0, 20).forEach((question) => {
      const option = getOption(question, answers[question.id]);
      if (!Number.isInteger(option.score) || option.score < 0 || option.score > 3) {
        throw new Error(`Invalid score configuration: ${question.id}`);
      }
      itemScores[question.id] = option.score;
    });

    const fieldResults = config.fields.map((field) => {
      const score = field.questions.reduce((sum, questionId) => sum + itemScores[questionId], 0);
      return { ...field, score, rating: getFieldRating(score) };
    });
    const total = fieldResults.reduce((sum, field) => sum + field.score, 0);
    const highestScore = Math.max(...fieldResults.map((field) => field.score));
    const lowestScore = Math.min(...fieldResults.map((field) => field.score));
    const highestFields = fieldResults.filter((field) => field.score === highestScore);
    const lowestFields = fieldResults.filter((field) => field.score === lowestScore);
    const allFieldsTied = highestFields.length === fieldResults.length;

    let actionQuestion = questionsById.get("q1");
    let actionScore = itemScores.q1;
    let perfectScore = false;

    if (total === 60) {
      perfectScore = true;
    } else {
      const actionField = config.fields.find((field) => lowestFields.some((candidate) => candidate.id === field.id));
      const lowestQuestionScore = Math.min(...actionField.questions.map((questionId) => itemScores[questionId]));
      const actionQuestionId = actionField.advicePriority.find(
        (questionId) => itemScores[questionId] === lowestQuestionScore,
      );
      actionQuestion = questionsById.get(actionQuestionId);
      actionScore = itemScores[actionQuestionId];
    }

    return {
      total,
      itemScores,
      fieldResults,
      highestFields,
      lowestFields,
      allFieldsTied,
      actionQuestion,
      actionScore,
      perfectScore,
      overallComment: getOverallComment(answers),
    };
  };

  const formatAdvice = (questionId) => {
    const advice = config.advice[questionId] || "";
    const emphasis = config.adviceEmphasis[questionId];

    if (!emphasis || !advice.includes(emphasis)) {
      return escapeHtml(advice);
    }

    const emphasisIndex = advice.indexOf(emphasis);
    const before = advice.slice(0, emphasisIndex);
    const after = advice.slice(emphasisIndex + emphasis.length);
    return `${escapeHtml(before)}<strong>${escapeHtml(emphasis)}</strong>${escapeHtml(after)}`;
  };

  const renderFieldCards = (fields, type) =>
    fields
      .map((field) => {
        const lead = type === "strength" ? getStrengthLead(field.score) : getImprovementLead(field.score);
        const detail = type === "strength" ? field.strength : field.improvement;
        return `
          <article class="test-diagnosis-reflection-card">
            <span>${escapeHtml(field.label)}｜${field.score} / 12点</span>
            <p><strong>${escapeHtml(lead)}</strong>${escapeHtml(detail)}</p>
          </article>
        `;
      })
      .join("");

  const renderStrengthSection = (result) => {
    if (result.allFieldsTied) {
      const copy =
        result.total === 0
          ? "今回は、次につなげるための現在地を5分野すべてで確認できました。まず一つ変える行動を選ぶところから始めましょう。"
          : result.total === 60
            ? "5分野すべてで、今回できていた行動を確認できました。次回も同じ進め方を一つずつ続けていきましょう。"
            : "5分野が同じ得点でした。今回できていた行動を確認し、次回も一つずつ続けていきましょう。";
      return `<p class="test-diagnosis-neutral-copy">${escapeHtml(copy)}</p>`;
    }

    return `<div class="test-diagnosis-reflection-grid">${renderFieldCards(result.highestFields, "strength")}</div>`;
  };

  const renderImprovementSection = (result) => {
    if (result.total === 60) {
      return '<p class="test-diagnosis-neutral-copy">今回は5分野すべてが満点でした。大きく変える必要はありません。できていた行動を次回も続けましょう。</p>';
    }

    if (result.allFieldsTied) {
      return '<p class="test-diagnosis-neutral-copy">分野ごとの大きな偏りはありません。次に変える行動は、勉強の土台となる項目から一つ選びます。</p>';
    }

    return `<div class="test-diagnosis-reflection-grid">${renderFieldCards(result.lowestFields, "improvement")}</div>`;
  };

  const renderAction = (result) => {
    if (result.perfectScore) {
      return `
        <p class="test-diagnosis-action-question">次回も、準備から始める</p>
        <p>今回は5分野すべてが満点でした。大きく変える必要はありません。次回も、テスト範囲が発表された日に全教科の範囲を確認するところから始めましょう。</p>
      `;
    }

    const introduction =
      result.actionScore <= 1
        ? "次は、ここから変えてみましょう。"
        : "あと一歩整えるなら、ここから始めてみましょう。";

    return `
      <p class="test-diagnosis-action-question">Q${result.actionQuestion.number}｜${escapeHtml(result.actionQuestion.text)}</p>
      <p><strong>${escapeHtml(introduction)}</strong>${formatAdvice(result.actionQuestion.id)}</p>
    `;
  };

  const core = {
    validateAnswers,
    getFieldRating,
    calculateResult,
    getOverallComment,
    formatAdvice,
  };

  if (isCommonJs) {
    module.exports = core;
  }

  if (typeof document === "undefined") {
    return;
  }

  const startButton = document.querySelector("#testDiagnosisStart");
  const diagnosisForm = document.querySelector("#testDiagnosisForm");
  const questionsRoot = document.querySelector("#testDiagnosisQuestions");
  const resultRoot = document.querySelector("#testDiagnosisResult");
  const pageText = document.querySelector("#testDiagnosisPage");
  const stepLabel = document.querySelector("#testDiagnosisStepLabel");
  const progressBar = document.querySelector("#testDiagnosisProgress");
  const progressFill = progressBar?.querySelector("span");
  const stepHeading = document.querySelector("#testDiagnosisStepHeading");
  const stepNote = document.querySelector("#testDiagnosisStepNote");
  const messageRoot = document.querySelector("#testDiagnosisMessage");
  const backButton = document.querySelector("#testDiagnosisBack");
  const nextButton = document.querySelector("#testDiagnosisNext");
  const submitButton = document.querySelector("#testDiagnosisSubmit");

  if (
    !startButton ||
    !diagnosisForm ||
    !questionsRoot ||
    !resultRoot ||
    !pageText ||
    !stepLabel ||
    !progressBar ||
    !progressFill ||
    !stepHeading ||
    !stepNote ||
    !messageRoot ||
    !backButton ||
    !nextButton ||
    !submitButton
  ) {
    return;
  }

  const answers = {};
  let currentStepIndex = 0;

  const getScrollBehavior = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

  const renderQuestion = (question) => {
    const selectedAnswer = answers[question.id] || "";
    const legendPrefix = question.shortLabel ? `${question.shortLabel}｜` : "";
    return `
      <fieldset class="diagnosis-question-card test-diagnosis-question" data-question-id="${escapeHtml(question.id)}">
        <legend><span>Q${question.number}</span>${escapeHtml(legendPrefix + question.text)}</legend>
        <div class="diagnosis-options">
          ${question.options
            .map((option, optionIndex) => {
              const inputId = `${question.id}-${optionIndex}`;
              const checked = option.id === selectedAnswer ? " checked" : "";
              return `
                <label class="diagnosis-option" for="${escapeHtml(inputId)}">
                  <input id="${escapeHtml(inputId)}" type="radio" name="${escapeHtml(question.id)}" value="${escapeHtml(option.id)}"${checked} />
                  <span>${escapeHtml(option.label)}</span>
                </label>
              `;
            })
            .join("")}
        </div>
      </fieldset>
    `;
  };

  const renderStep = ({ focusHeading = false } = {}) => {
    const step = config.steps[currentStepIndex];
    const questions = step.questionIds.map((questionId) => questionsById.get(questionId));
    const pageNumber = currentStepIndex + 1;
    const progress = (pageNumber / config.steps.length) * 100;

    pageText.textContent = `${pageNumber} / ${config.steps.length}`;
    stepLabel.textContent = step.label;
    stepHeading.textContent = step.label;
    progressBar.setAttribute("aria-valuenow", String(pageNumber));
    progressFill.style.width = `${progress}%`;
    stepNote.hidden = step.id !== "reflection";
    questionsRoot.innerHTML = questions.map(renderQuestion).join("");
    backButton.hidden = currentStepIndex === 0;
    nextButton.hidden = currentStepIndex === config.steps.length - 1;
    submitButton.hidden = currentStepIndex !== config.steps.length - 1;
    messageRoot.textContent = "";

    if (focusHeading) {
      requestAnimationFrame(() => stepHeading.focus({ preventScroll: true }));
    }
  };

  const focusMissingQuestion = (questionId) => {
    const fieldset = questionsRoot.querySelector(`[data-question-id="${questionId}"]`);
    fieldset?.setAttribute("data-error", "true");
    fieldset?.scrollIntoView({ behavior: getScrollBehavior(), block: "center" });
    requestAnimationFrame(() => fieldset?.querySelector("input")?.focus({ preventScroll: true }));
  };

  const validateCurrentStep = () => {
    const step = config.steps[currentStepIndex];
    const validation = validateAnswers(answers, step.questionIds);

    if (!validation.valid) {
      const question = questionsById.get(validation.missingId);
      messageRoot.textContent = `未回答の質問があります。Q${question.number}を選択してください。`;
      focusMissingQuestion(validation.missingId);
    }

    return validation.valid;
  };

  const showStep = (stepIndex) => {
    currentStepIndex = Math.max(0, Math.min(stepIndex, config.steps.length - 1));
    renderStep({ focusHeading: true });
    diagnosisForm.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
  };

  const renderResult = (result) => {
    resultRoot.innerHTML = `
      <header class="test-diagnosis-result-header">
        <p class="eyebrow">診断結果</p>
        <h2>今回のテスト勉強を、次の一歩につなげましょう</h2>
        <p>総合点だけで良し悪しを決めず、5分野の得点から、続けたいことと最初に変えることを確認します。</p>
      </header>

      <section class="test-diagnosis-total" aria-labelledby="test-diagnosis-total-title">
        <h3 id="test-diagnosis-total-title">総合点</h3>
        <p><strong>${result.total}</strong><span> / 60点</span></p>
        <small>この点数は、今回のテスト勉強の進め方を振り返るための目安です。</small>
      </section>

      <section class="test-diagnosis-result-section" aria-labelledby="test-diagnosis-fields-title">
        <h3 id="test-diagnosis-fields-title">5項目の得点</h3>
        <div class="test-diagnosis-score-grid">
          ${result.fieldResults
            .map(
              (field) => `
                <article class="test-diagnosis-score-card">
                  <div class="test-diagnosis-score-heading">
                    <span class="test-diagnosis-rating" aria-label="判定 ${field.rating.symbol}">${field.rating.symbol}</span>
                    <div>
                      <h4>${escapeHtml(field.label)}</h4>
                      <p>${field.score} / 12点</p>
                    </div>
                  </div>
                  <div
                    class="test-diagnosis-score-meter"
                    role="progressbar"
                    aria-label="${escapeHtml(field.label)} ${field.score}点（12点満点）"
                    aria-valuemin="0"
                    aria-valuemax="12"
                    aria-valuenow="${field.score}"
                  ><span style="width: ${(field.score / 12) * 100}%"></span></div>
                </article>
              `,
            )
            .join("")}
        </div>
        <p class="test-diagnosis-rating-guide">判定の目安：10〜12点 ◎ ／ 7〜9点 ○ ／ 4〜6点 △ ／ 0〜3点 ▲</p>
      </section>

      <section class="test-diagnosis-result-section" aria-labelledby="test-diagnosis-strength-title">
        <h3 id="test-diagnosis-strength-title">今回よかったところ</h3>
        ${renderStrengthSection(result)}
      </section>

      <section class="test-diagnosis-result-section" aria-labelledby="test-diagnosis-improvement-title">
        <h3 id="test-diagnosis-improvement-title">次に改善したいところ</h3>
        ${renderImprovementSection(result)}
      </section>

      <section class="test-diagnosis-result-section test-diagnosis-action" aria-labelledby="test-diagnosis-action-title">
        <h3 id="test-diagnosis-action-title">次のテストで最初に変えること</h3>
        ${renderAction(result)}
      </section>

      <aside class="test-diagnosis-screenshot-note" aria-label="スクリーンショットのご案内">
        <strong>この結果は、次のテスト前にもう一度見返してみてください。スクリーンショットしておくと便利です。</strong>
        <span>テスト勉強ステップアップ診断｜オンライン家庭教師REVIA</span>
      </aside>

      <section class="test-diagnosis-result-section" aria-labelledby="test-diagnosis-comment-title">
        <h3 id="test-diagnosis-comment-title">今回の結果と次回の目標から</h3>
        <p class="test-diagnosis-overall-comment">${escapeHtml(result.overallComment)}</p>
      </section>

      <section class="diagnosis-result-cta enhanced-result-cta test-diagnosis-cta" aria-labelledby="test-diagnosis-cta-title">
        <div>
          <h3 id="test-diagnosis-cta-title">次のテストでは、今回より一歩前へ。</h3>
          <p>診断では、今回のテスト勉強の良かったところと、次に改善したいところを確認しました。</p>
          <p>「自分の場合、具体的にどんな計画を立てればいい？」</p>
          <p>「何から変えればいいか、もう少し詳しく知りたい」</p>
          <p>そんな方は、オンライン家庭教師REVIAの無料相談をご利用ください。</p>
        </div>
        <a class="button primary" href="index.html#booking">次のテストに向けて無料相談する</a>
      </section>

      <div class="test-diagnosis-restart">
        <button class="button secondary" id="testDiagnosisRestart" type="button">もう一度診断する</button>
      </div>
    `;

    diagnosisForm.hidden = true;
    resultRoot.hidden = false;
    resultRoot.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
    requestAnimationFrame(() => resultRoot.focus({ preventScroll: true }));
  };

  const resetDiagnosis = () => {
    Object.keys(answers).forEach((questionId) => delete answers[questionId]);
    currentStepIndex = 0;
    resultRoot.hidden = true;
    resultRoot.innerHTML = "";
    diagnosisForm.hidden = false;
    startButton.hidden = true;
    renderStep({ focusHeading: true });
    diagnosisForm.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
  };

  startButton.addEventListener("click", () => {
    startButton.hidden = true;
    diagnosisForm.hidden = false;
    renderStep({ focusHeading: true });
    diagnosisForm.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
  });

  questionsRoot.addEventListener("change", (event) => {
    const input = event.target.closest('input[type="radio"]');
    if (!input) {
      return;
    }

    const question = questionsById.get(input.name);
    if (!question || !getOption(question, input.value)) {
      return;
    }

    answers[input.name] = input.value;
    input.closest("fieldset")?.removeAttribute("data-error");
    messageRoot.textContent = "";
  });

  backButton.addEventListener("click", () => showStep(currentStepIndex - 1));

  nextButton.addEventListener("click", () => {
    if (!validateCurrentStep()) {
      return;
    }
    showStep(currentStepIndex + 1);
  });

  diagnosisForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!validateCurrentStep()) {
      return;
    }

    const validation = validateAnswers(answers);
    if (!validation.valid) {
      const missingStepIndex = config.steps.findIndex((step) => step.questionIds.includes(validation.missingId));
      showStep(missingStepIndex);
      const question = questionsById.get(validation.missingId);
      messageRoot.textContent = `未回答の質問があります。Q${question.number}を選択してください。`;
      focusMissingQuestion(validation.missingId);
      return;
    }

    renderResult(calculateResult(answers));
  });

  resultRoot.addEventListener("click", (event) => {
    if (event.target.closest("#testDiagnosisRestart")) {
      resetDiagnosis();
    }
  });

  renderStep();
})();
