const bookingForm = document.querySelector("#bookingForm");
const bookingMessage = document.querySelector("#bookingMessage");
const bookingComplete = document.querySelector("#bookingComplete");
const slotSelects = document.querySelectorAll(".slot-select");
const reservationList = document.querySelector("#reservationList");
const clearReservationsButton = document.querySelector("#clearReservations");
const kanaSourceInputs = document.querySelectorAll("[data-kana-source]");
const kanaTargetInputs = document.querySelectorAll("[data-kana-target]");

// 初心者向けメモ:
// 開業後によく変更する値は、まずこの REVIA_SETTINGS だけを確認してください。
// 予約URLは Google Apps Script を公開したあと、そのウェブアプリURLを bookingEndpoint に貼り付けます。
// ZoomURL、連絡先メール、料金もここを変えるとサイト表示とメール文面に反映されます。
const REVIA_SETTINGS = {
  reservationStorageKey: "reviaReservations",
  bookingEndpoint: "https://script.google.com/macros/s/AKfycbyUlvcRULNhChQLCBXgbmdXk51614H_lQL9q6Kae_Eeq9__kQ2W-SCA4a3F9-kWy3FRXA/exec",
  contactEmail: "revia2026.mail@gmail.com",
  zoomUrl: "https://us06web.zoom.us/j/3796718185?pwd=gJDNJ5d2zhQNGXL7mboKV7HjGMVQSa.1",
  meetingMinutes: 30,
  prices: {
    60: { lesson: 5500, monthly: 22000 },
    80: { lesson: 6600, monthly: 26400 },
    100: { lesson: 8800, monthly: 35200 },
    120: { lesson: 9900, monthly: 39600 },
    advancedLesson: 2200,
  },
};

const FORM_SUCCESS_MESSAGE = "無料相談のお申し込みありがとうございます。\n内容を確認し、1〜2営業日以内にご連絡いたします。";
const FORM_FAILURE_MESSAGE = "送信に失敗しました。時間をおいて再度お試しください。";
const HIRAGANA_PATTERN = /^[ぁ-ゖーゝゞ\s　]+$/;
const kanaAssistInstances = [];

const readReservations = () => JSON.parse(localStorage.getItem(REVIA_SETTINGS.reservationStorageKey) || "[]");
const saveReservations = (reservations) => {
  localStorage.setItem(REVIA_SETTINGS.reservationStorageKey, JSON.stringify(reservations));
};
const formatYen = (amount) => `¥${Number(amount).toLocaleString("ja-JP")}`;
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
const toLocalDateId = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isHiraganaText = (value) => HIRAGANA_PATTERN.test(String(value || "").trim());

const validateKanaInput = (input) => {
  if (!input.value || isHiraganaText(input.value)) {
    input.setCustomValidity("");
    return true;
  }

  input.setCustomValidity("ふりがなは、ひらがなで入力してください。");
  return false;
};

const setupKanaAssist = () => {
  kanaTargetInputs.forEach((input) => {
    input.addEventListener("input", () => validateKanaInput(input));
  });

  if (!window.VanillaAutoKana) {
    console.warn("VanillaAutoKana が読み込まれていないため、ふりがな自動入力は無効です。");
    return;
  }

  kanaSourceInputs.forEach((sourceInput) => {
    const targetInput = bookingForm?.elements[sourceInput.dataset.kanaSource];

    if (!targetInput) {
      return;
    }

    const assist = window.VanillaAutoKana.bind(sourceInput, targetInput, {
      onUpdate: (_value, input) => validateKanaInput(input),
    });

    if (assist) {
      kanaAssistInstances.push(assist);
    }
  });
};

const resetKanaAssistState = () => {
  kanaTargetInputs.forEach((input) => {
    delete input.dataset.kanaEdited;
    input.setCustomValidity("");
  });

  kanaAssistInstances.forEach((assist) => assist.reset());
};

const formatDate = (date) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);

const renderPricing = () => {
  Object.entries(REVIA_SETTINGS.prices).forEach(([minutes, price]) => {
    if (!price.lesson) {
      return;
    }

    const lessonElement = document.querySelector(`[data-price-lesson="${minutes}"]`);
    const monthlyElement = document.querySelector(`[data-price-monthly="${minutes}"]`);

    if (lessonElement) {
      lessonElement.textContent = formatYen(price.lesson);
    }

    if (monthlyElement) {
      monthlyElement.textContent = formatYen(price.monthly);
    }
  });

  const advancedLessonElement = document.querySelector("[data-advanced-lesson]");
  const advancedMonthlyElement = document.querySelector("[data-advanced-monthly]");

  if (advancedLessonElement) {
    advancedLessonElement.textContent = `+${formatYen(REVIA_SETTINGS.prices.advancedLesson)}〜`;
  }

  if (advancedMonthlyElement) {
    advancedMonthlyElement.textContent = `+${formatYen(REVIA_SETTINGS.prices.advancedLesson * 4)}〜`;
  }
};

const createSlots = () => {
  const slots = [];
  const today = new Date();
  const times = ["10:00", "14:00", "19:00"];

  for (let offset = 1; slots.length < 18 && offset < 21; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    if (date.getDay() === 0) {
      continue;
    }

    const dateId = toLocalDateId(date);
    times.forEach((time) => {
      slots.push({
        id: `${dateId}-${time}`,
        label: `${formatDate(date)} ${time}`,
      });
    });
  }

  return slots.slice(0, 18);
};

const getReservedSlotIds = () => {
  const reservations = readReservations();
  return new Set(reservations.flatMap((reservation) => reservation.preferenceIds || [reservation.slotId]).filter(Boolean));
};

const renderSlotSelects = () => {
  if (slotSelects.length === 0) {
    return;
  }

  const reservedSlotIds = getReservedSlotIds();
  const slots = createSlots();

  slotSelects.forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">選択してください</option>';

    slots.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slot.id;
      option.textContent = reservedSlotIds.has(slot.id) ? `${slot.label}（受付済み）` : slot.label;
      option.dataset.label = slot.label;
      option.disabled = reservedSlotIds.has(slot.id);
      select.append(option);
    });

    if (currentValue && [...select.options].some((option) => option.value === currentValue && !option.disabled)) {
      select.value = currentValue;
    }
  });
};

const slotIdToGoogleDate = (slotId, extraMinutes = 0) => {
  const date = slotId.slice(0, 10).replaceAll("-", "");
  const [hourText, minuteText] = slotId.slice(11).split(":");
  const minutes = Number(hourText) * 60 + Number(minuteText) + extraMinutes;
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${date}T${hour}${minute}00`;
};

const buildCalendarUrl = (reservation) => {
  const preferenceIds = reservation.preferenceIds || [reservation.slotId];
  const preferenceLabels = reservation.preferenceLabels || [reservation.slotLabel || "-", "-", "-"];
  const firstSlot = preferenceIds[0];
  const dates = `${slotIdToGoogleDate(firstSlot)}/${slotIdToGoogleDate(firstSlot, REVIA_SETTINGS.meetingMinutes)}`;
    const details = [
    `保護者氏名: ${reservation.guardian}`,
    `保護者氏名（ふりがな）: ${reservation.guardianKana || "未入力"}`,
    `生徒氏名: ${reservation.student}`,
    `生徒氏名（ふりがな）: ${reservation.studentKana || "未入力"}`,
    `学年: ${reservation.grade}`,
    `希望科目: ${reservation.subject}`,
    `相談内容: ${reservation.memo || "未入力"}`,
    `第1希望: ${preferenceLabels[0]}`,
    `第2希望: ${preferenceLabels[1]}`,
    `第3希望: ${preferenceLabels[2]}`,
    `ZoomURL: ${REVIA_SETTINGS.zoomUrl}`,
    "持ち物: 成績表があればご準備ください",
    `面談時間: ${REVIA_SETTINGS.meetingMinutes}分程度`,
  ].join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `REVIA 面談予約: ${reservation.student}様`,
    dates,
    ctz: "Asia/Tokyo",
    details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const buildMailUrl = (reservation) => {
  const body = [
    `${reservation.guardian}様`,
    "",
    "この度はオンライン家庭教師REVIAの無料相談にお申し込みいただき、誠にありがとうございます。",
    "",
    "内容を確認のうえ、1〜2営業日以内にご連絡いたします。",
    "",
    "無料相談では、",
    "・現在の学習状況",
    "・お悩みや課題",
    "・今後の学習方針",
    "・オンライン授業について",
    "などをお話しさせていただきます。",
    "",
    "なお、体験授業は2,200円（税込）となります。",
    "無料相談後、ご希望の場合に日程をご案内いたします。",
    "",
    "どうぞよろしくお願いいたします。",
    "",
    "オンライン家庭教師REVIA",
    "代表　原田 靖也",
    "Mail：revia2026.mail@gmail.com",
    "HP：https://revia.website/",
  ].join("\n");
  const params = new URLSearchParams({
    subject: "【オンライン家庭教師REVIA】無料相談のお申し込みありがとうございます",
    body,
  });

  return `mailto:${encodeURIComponent(reservation.email)}?cc=${encodeURIComponent(REVIA_SETTINGS.contactEmail)}&${params.toString()}`;
};

const sendReservation = async (reservation) => {
  if (!REVIA_SETTINGS.bookingEndpoint) {
    throw new Error("Google Apps Script のウェブアプリURLが未設定です。");
  }

  await fetch(REVIA_SETTINGS.bookingEndpoint, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(reservation),
  });
};

const renderReservations = () => {
  if (!reservationList) {
    return;
  }

  const reservations = readReservations();

  if (reservations.length === 0) {
    reservationList.innerHTML = '<div class="empty-reservation">まだ予約はありません。</div>';
    return;
  }

  reservationList.innerHTML = reservations
    .map(
      (reservation) => `
        <article class="reservation-item">
          <strong>${escapeHtml(reservation.preferenceLabels?.[0] || reservation.slotLabel)}</strong>
          <span>第2希望: ${escapeHtml(reservation.preferenceLabels?.[1] || "-")}</span>
          <span>第3希望: ${escapeHtml(reservation.preferenceLabels?.[2] || "-")}</span>
          <span>${escapeHtml(reservation.guardian)}様（${escapeHtml(reservation.guardianKana || "-")}） / 生徒: ${escapeHtml(reservation.student)}（${escapeHtml(reservation.studentKana || "-")}）</span>
          <span>${escapeHtml(reservation.grade)} / ${escapeHtml(reservation.subject)} / ${escapeHtml(reservation.email)}</span>
          <div class="reservation-tools">
            <a href="${buildCalendarUrl(reservation)}" target="_blank" rel="noopener">Googleカレンダーに追加</a>
            <a href="${buildMailUrl(reservation)}">確認メールを作成</a>
          </div>
        </article>
      `,
    )
    .join("");
};

const updateDuplicateOptions = () => {
  const selectedValues = new Set([...slotSelects].map((select) => select.value).filter(Boolean));

  slotSelects.forEach((select) => {
    [...select.options].forEach((option) => {
      if (!option.value || getReservedSlotIds().has(option.value)) {
        return;
      }

      option.disabled = option.value !== select.value && selectedValues.has(option.value);
    });
  });
};

bookingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!bookingForm.checkValidity()) {
    bookingForm.reportValidity();
    return;
  }

  const data = new FormData(bookingForm);
  const preferenceIds = [
    data.get("preferredSlot1")?.toString(),
    data.get("preferredSlot2")?.toString(),
    data.get("preferredSlot3")?.toString(),
  ];
  const preferenceLabels = [...slotSelects].map((select) => select.selectedOptions[0]?.dataset.label || "");
  const uniquePreferenceIds = new Set(preferenceIds);
  const reservedSlotIds = getReservedSlotIds();

  if (uniquePreferenceIds.size !== preferenceIds.length) {
    bookingMessage.textContent = "第1〜第3希望は別々の日時を選択してください。";
    return;
  }

  if (preferenceIds.some((slotId) => reservedSlotIds.has(slotId))) {
    bookingMessage.textContent = "選択した日時に受付済みの枠があります。別の日時を選択してください。";
    renderSlotSelects();
    return;
  }

  const reservation = {
    id: crypto.randomUUID(),
    preferenceIds,
    preferenceLabels,
    guardian: data.get("guardian")?.toString().trim(),
    guardianKana: data.get("guardianKana")?.toString().trim(),
    student: data.get("student")?.toString().trim(),
    studentKana: data.get("studentKana")?.toString().trim(),
    email: data.get("bookingEmail")?.toString().trim(),
    grade: data.get("studentGrade"),
    subject: data.get("subject"),
    memo: data.get("bookingMemo")?.toString().trim(),
    createdAt: new Date().toISOString(),
  };
  const reservations = readReservations();

  const submitButton = bookingForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  bookingMessage.textContent = "送信しています。しばらくお待ちください。";

  try {
    await sendReservation(reservation);
  } catch (error) {
    console.error(error);
    bookingMessage.textContent = FORM_FAILURE_MESSAGE;
    submitButton.disabled = false;
    return;
  }

  saveReservations([reservation, ...reservations]);
  bookingMessage.textContent = FORM_SUCCESS_MESSAGE;
  bookingForm.reset();
  resetKanaAssistState();
  bookingForm.hidden = true;
  bookingComplete.hidden = false;
  submitButton.disabled = false;
  renderSlotSelects();
  renderReservations();
});

slotSelects.forEach((select) => {
  select.addEventListener("change", updateDuplicateOptions);
});

clearReservationsButton?.addEventListener("click", () => {
  saveReservations([]);
  bookingMessage.textContent = "予約一覧をクリアしました。";
  resetKanaAssistState();
  bookingForm.hidden = false;
  bookingComplete.hidden = true;
  renderSlotSelects();
  renderReservations();
});

renderPricing();
setupKanaAssist();
renderSlotSelects();
renderReservations();
