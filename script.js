const bookingForm = document.querySelector("#bookingForm");
const bookingMessage = document.querySelector("#bookingMessage");
const bookingComplete = document.querySelector("#bookingComplete");
const bookingCompleteTime = document.querySelector("#bookingCompleteTime");
const slotSelect = document.querySelector(".slot-select");
const dateSelect = document.querySelector(".date-select");
const availabilityStatus = document.querySelector("#availabilityStatus");
const reservationList = document.querySelector("#reservationList");
const clearReservationsButton = document.querySelector("#clearReservations");
const kanaSourceInputs = document.querySelectorAll("[data-kana-source]");
const kanaTargetInputs = document.querySelectorAll("[data-kana-target]");

// 初心者向けメモ:
// 開業後によく変更する値は、まずこの REVIA_SETTINGS だけを確認してください。
// 予約URLは Google Apps Script を公開したあと、そのウェブアプリURLを bookingEndpoint に貼り付けます。
// Zoom認証情報はブラウザ側に置かず、Google Apps Scriptのスクリプトプロパティで管理します。
const REVIA_SETTINGS = {
  reservationStorageKey: "reviaReservations",
    bookingEndpoint: "https://script.google.com/macros/s/AKfycbwVpTV3vvwNeyrdHWY0ajlyM6xkhV75P3KLrNwvEN-nB32Qu0uACSW4hEp6gBjaPBpidg/exec",
  contactEmail: "revia2026.mail@gmail.com",
  meetingMinutes: 30,
  prices: {
    60: { lesson: 5500, monthly: 22000 },
    80: { lesson: 6600, monthly: 26400 },
    100: { lesson: 8800, monthly: 35200 },
    120: { lesson: 9900, monthly: 39600 },
    advancedLesson: 2200,
  },
};

const FORM_SUCCESS_MESSAGE = "無料相談のご予約が確定しました。\nZoom参加URLを、ご登録のメールアドレスへお送りしました。";
const FORM_FAILURE_MESSAGE = "送信に失敗しました。時間をおいて再度お試しください。";
const SLOT_UNAVAILABLE_MESSAGE = "申し訳ありません。この時間は直前に予約が入りました。別の日時を選択してください。";
const HIRAGANA_PATTERN = /^[ぁ-ゖーゝゞ\s　]+$/;
const kanaAssistInstances = [];
let availabilitySlots = [];
let availabilityDates = [];
let availabilityLoadFailed = false;

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
const sendClickAnalyticsEvent = (eventName) => {
  if (!eventName || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("event", eventName);
};
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

const setAvailabilityStatus = (message, isError = false) => {
  if (!availabilityStatus) {
    return;
  }

  availabilityStatus.textContent = message;
  availabilityStatus.classList.toggle("is-error", isError);
};

const getAvailabilityUrl = (callbackName = "") => {
  const url = new URL(REVIA_SETTINGS.bookingEndpoint);
  url.searchParams.set("mode", "availability");
  url.searchParams.set("_", Date.now().toString());

  if (callbackName) {
    url.searchParams.set("callback", callbackName);
  }

  return url.toString();
};

const fetchAvailabilityJsonp = () =>
  new Promise((resolve, reject) => {
    const callbackName = `reviaAvailability_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      delete window[callbackName];
      script.remove();
      reject(new Error("空き時間の取得がタイムアウトしました。"));
    }, 12000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      resolve(payload);
    };

    script.src = getAvailabilityUrl(callbackName);
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      reject(new Error("空き時間を取得できませんでした。"));
    };
    document.body.append(script);
  });

const fetchAvailability = async () => {
  try {
    const response = await fetch(getAvailabilityUrl(), {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("空き時間の取得に失敗しました。");
    }

    return await response.json();
  } catch (error) {
    console.warn(error);
    return fetchAvailabilityJsonp();
  }
};

const getSlotsByDate = () =>
  availabilitySlots.reduce((groups, slot) => {
    if (!groups.has(slot.date)) {
      groups.set(slot.date, []);
    }

    groups.get(slot.date).push(slot);
    return groups;
  }, new Map());

const getSlotById = (slotId) => availabilitySlots.find((slot) => slot.id === slotId);

const setBookingControlsDisabled = (disabled) => {
  if (dateSelect) {
    dateSelect.disabled = disabled;
  }

  if (slotSelect) {
    slotSelect.disabled = disabled;
  }

  bookingForm?.querySelector('button[type="submit"]')?.toggleAttribute("disabled", disabled);
};

const renderSlotPicker = () => {
  if (!slotSelect || !dateSelect) {
    return;
  }

  const slotsByDate = getSlotsByDate();
  const hasSlots = availabilitySlots.length > 0;
  const currentDate = dateSelect.value;
  const currentSlot = slotSelect.value;

  dateSelect.innerHTML = '<option value="">日付を選択</option>';

  availabilityDates.forEach((dateItem) => {
    const option = document.createElement("option");
    option.value = dateItem.date;
    option.textContent = dateItem.label;
    dateSelect.append(option);
  });

  if (currentDate && slotsByDate.has(currentDate)) {
    dateSelect.value = currentDate;
  }

  const selectedDate = dateSelect.value;
  const daySlots = slotsByDate.get(selectedDate) || [];
  slotSelect.innerHTML = '<option value="">時間を選択</option>';

  daySlots.forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot.id;
    option.textContent = slot.timeLabel || slot.time;
    option.dataset.label = slot.label;
    slotSelect.append(option);
  });

  if (currentSlot && daySlots.some((slot) => slot.id === currentSlot)) {
    slotSelect.value = currentSlot;
  }

  const shouldDisableAll = availabilityLoadFailed || !hasSlots;
  dateSelect.disabled = shouldDisableAll;
  slotSelect.disabled = shouldDisableAll || !selectedDate || daySlots.length === 0;

  bookingForm?.querySelector('button[type="submit"]')?.toggleAttribute("disabled", shouldDisableAll);

  if (!hasSlots && !availabilityLoadFailed) {
    setAvailabilityStatus("現在選べる日時がありません。お手数ですが、メールまたは無料相談フォームからお問い合わせください。", true);
  } else if (hasSlots) {
    setAvailabilityStatus("空いている日時だけを表示しています。日付を選ぶと、その日の時間を選べます。");
  }
};

const loadAvailability = async () => {
  if (!bookingForm || !slotSelect || !dateSelect) {
    return;
  }

  availabilityLoadFailed = false;
  setBookingControlsDisabled(true);
  setAvailabilityStatus("空き時間を読み込み中です。");

  try {
    const payload = await fetchAvailability();

    if (!payload.ok) {
      throw new Error(payload.message || "空き時間を取得できませんでした。");
    }

    availabilitySlots = payload.slots || [];
    availabilityDates = payload.dates || [];
    availabilityLoadFailed = false;
    renderSlotPicker();
  } catch (error) {
    console.error(error);
    availabilitySlots = [];
    availabilityDates = [];
    availabilityLoadFailed = true;
    setAvailabilityStatus("空き時間を取得できませんでした。時間をおいて再度お試しください。", true);
    renderSlotPicker();
  }
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
  const firstSlot = reservation.confirmedSlotId || reservation.slotId || reservation.preferenceIds?.[0];
  const dates = `${slotIdToGoogleDate(firstSlot)}/${slotIdToGoogleDate(firstSlot, REVIA_SETTINGS.meetingMinutes)}`;
  const details = [
    `保護者氏名: ${reservation.guardian}`,
    `保護者氏名（ふりがな）: ${reservation.guardianKana || "未入力"}`,
    `生徒氏名: ${reservation.student}`,
    `生徒氏名（ふりがな）: ${reservation.studentKana || "未入力"}`,
    `学年: ${reservation.grade}`,
    `希望科目: ${reservation.subject}`,
    `相談内容: ${reservation.memo || "未入力"}`,
    `確定日時: ${reservation.confirmedSlotLabel || reservation.slotLabel || reservation.preferenceLabels?.[0] || "-"}`,
    `Zoom参加URL: ${reservation.zoomJoinUrl || "確認メールをご確認ください"}`,
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
    "以下の日時でご予約を承りました。",
    `面談日時：${reservation.confirmedSlotLabel || reservation.slotLabel || "-"}`,
    `Zoom参加URL：${reservation.zoomJoinUrl || "確認メールをご確認ください"}`,
    "",
    "開始時刻になりましたら、上記URLからご参加ください。",
    "待機室でお待ちいただく場合があります。",
    "",
    "ご都合が悪くなった場合は、REVIAまでご連絡ください。",
    "",
    "どうぞよろしくお願いいたします。",
    "",
    "オンライン家庭教師REVIA",
    "代表　原田 靖也",
    "Mail：revia2026.mail@gmail.com",
    "HP：https://revia.website/",
  ].join("\n");
  const params = new URLSearchParams({
    subject: "【REVIA】無料相談のご予約が確定しました",
    body,
  });

  return `mailto:${encodeURIComponent(reservation.email)}?cc=${encodeURIComponent(REVIA_SETTINGS.contactEmail)}&${params.toString()}`;
};

const sendReservation = async (reservation) => {
  if (!REVIA_SETTINGS.bookingEndpoint) {
    throw new Error("Google Apps Script のウェブアプリURLが未設定です。");
  }

  const response = await fetch(REVIA_SETTINGS.bookingEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(reservation),
  });

  if (!response.ok) {
    throw new Error(FORM_FAILURE_MESSAGE);
  }

  const result = await response.json();

  if (!result.ok) {
    const error = new Error(result.message || FORM_FAILURE_MESSAGE);
    error.code = result.code;
    error.result = result;
    throw error;
  }

  return result;
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
      (reservation) => {
        const zoomLink = reservation.zoomJoinUrl
          ? `<a href="${escapeHtml(reservation.zoomJoinUrl)}" target="_blank" rel="noopener">Zoomに参加</a>`
          : "";

        return `
        <article class="reservation-item">
          <strong>${escapeHtml(reservation.confirmedSlotLabel || reservation.slotLabel || reservation.preferenceLabels?.[0])}</strong>
          <span>${escapeHtml(reservation.guardian)}様（${escapeHtml(reservation.guardianKana || "-")}） / 生徒: ${escapeHtml(reservation.student)}（${escapeHtml(reservation.studentKana || "-")}）</span>
          <span>${escapeHtml(reservation.grade)} / ${escapeHtml(reservation.subject)} / ${escapeHtml(reservation.email)}</span>
          <div class="reservation-tools">
            <a href="${buildCalendarUrl(reservation)}" target="_blank" rel="noopener">Googleカレンダーに追加</a>
            ${zoomLink}
            <a href="${buildMailUrl(reservation)}">確認メールを作成</a>
          </div>
        </article>
      `;
      },
    )
    .join("");
};

bookingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (availabilityLoadFailed || availabilitySlots.length === 0) {
    bookingMessage.textContent = "空き時間を取得できていません。時間をおいて再度お試しください。";
    return;
  }

  if (!bookingForm.checkValidity()) {
    bookingForm.reportValidity();
    return;
  }

  const data = new FormData(bookingForm);
  const slotId = data.get("bookingSlot")?.toString() || "";
  const selectedSlot = getSlotById(slotId);

  if (!selectedSlot) {
    bookingMessage.textContent = SLOT_UNAVAILABLE_MESSAGE;
    await loadAvailability();
    return;
  }

  const reservation = {
    id: crypto.randomUUID(),
    slotId,
    slotLabel: selectedSlot.label,
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

  let result;

  try {
    result = await sendReservation(reservation);
  } catch (error) {
    console.error(error);
    bookingMessage.textContent = error.code === "slot_unavailable" ? SLOT_UNAVAILABLE_MESSAGE : error.message || FORM_FAILURE_MESSAGE;
    submitButton.disabled = false;
    await loadAvailability();
    return;
  }

  const confirmedReservation = {
    ...reservation,
    confirmedSlotId: result.confirmedSlotId || reservation.slotId,
    confirmedSlotLabel: result.confirmedSlotLabel || reservation.slotLabel,
    meetingStartIso: result.meetingStartIso || selectedSlot.startIso,
    meetingEndIso: result.meetingEndIso || selectedSlot.endIso,
    zoomJoinUrl: result.zoomJoinUrl || "",
  };

  saveReservations([confirmedReservation, ...reservations]);
  bookingMessage.textContent = FORM_SUCCESS_MESSAGE;
  if (bookingCompleteTime) {
    bookingCompleteTime.textContent = `面談日時：${confirmedReservation.confirmedSlotLabel}`;
  }
  bookingForm.reset();
  resetKanaAssistState();
  bookingForm.hidden = true;
  bookingComplete.hidden = false;
  submitButton.disabled = false;
  await loadAvailability();
  renderReservations();
});

dateSelect?.addEventListener("change", () => {
  if (slotSelect) {
    slotSelect.value = "";
  }

  renderSlotPicker();
});

clearReservationsButton?.addEventListener("click", () => {
  saveReservations([]);
  bookingMessage.textContent = "予約一覧をクリアしました。";
  resetKanaAssistState();
  bookingForm.hidden = false;
  bookingComplete.hidden = true;
  if (bookingCompleteTime) {
    bookingCompleteTime.textContent = "";
  }
  loadAvailability();
  renderReservations();
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-ga-event]");

  if (!target) {
    return;
  }

  sendClickAnalyticsEvent(target.dataset.gaEvent);
});

renderPricing();
setupKanaAssist();
loadAvailability();
renderReservations();
