// 初心者向けメモ:
// Google Apps Script側で普段変更する値は、このREVIA_SETTINGSにまとめています。
// Zoomの認証情報とZOOM_USER_IDはここへ書かず、スクリプトプロパティへ保存してください。
const REVIA_SETTINGS = {
  calendarId: "primary",
  adminEmail: "revia2026.mail@gmail.com",
  spreadsheetId: "",
  sheetName: "無料相談予約",
  meetingMinutes: 30,
  timezone: "Asia/Tokyo",

  availability: {
    // 今日から何日先まで予約候補を出すか。
    daysAhead: 30,

    // 予約開始の何時間前で受付を締め切るか。24なら24時間以内の枠は表示しません。
    cutoffHours: 24,

    // 面談の前後に確保する準備・記録時間です。利用者へは面談30分だけを案内します。
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,

    // 曜日ごとの受付時間です。0=日、1=月、2=火、3=水、4=木、5=金、6=土。
    // ここで指定する時間は、利用者が選べる実際の面談開始・終了時間です。
    weeklyRanges: {
      0: [],
      1: [
        { start: "10:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
      2: [
        { start: "10:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
      3: [],
      4: [],
      5: [
        { start: "10:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
      6: [{ start: "10:00", end: "12:00" }],
    },

    // 手動でブロックする日時です。判定には上の前後バッファも含まれます。
    // 終日不可: { date: "2026-07-15", allDay: true, reason: "研修" }
    // 一部不可: { date: "2026-07-18", start: "13:00", end: "15:00", reason: "予定あり" }
    manualBlocks: [
      { date: "2026-07-15", allDay: true, reason: "手動ブロック" },
      { date: "2026-07-18", start: "13:00", end: "15:00", reason: "手動ブロック" },
    ],

    // 通常は休みの日を臨時受付日にする場合に使います。
    // 例: { date: "2026-07-16", ranges: [{ start: "10:00", end: "12:00" }] }
    specialOpenDays: [],
  },

  zoom: {
    waitingRoom: true,
    joinBeforeHost: false,
    autoRecording: "none",
  },
};

const ZOOM_PROPERTY_NAMES = [
  "ZOOM_ACCOUNT_ID",
  "ZOOM_CLIENT_ID",
  "ZOOM_CLIENT_SECRET",
  "ZOOM_USER_ID",
];
const RESERVATION_SHEET_HEADERS = [
  "受付日時",
  "予約ID",
  "確定日時",
  "保護者名",
  "保護者ふりがな",
  "生徒名",
  "生徒ふりがな",
  "学年",
  "メールアドレス",
  "相談科目",
  "相談内容",
  "ZoomミーティングID",
  "Zoom参加URL",
  "Zoom作成日時",
  "面談開始時刻",
  "面談終了時刻",
  "確保開始時刻",
  "確保終了時刻",
];

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};

  try {
    if (params.mode === "availability") {
      return json_(getAvailabilityResponse_(), params.callback);
    }

    return json_(
      {
        ok: true,
        message: "REVIA booking endpoint is running.",
      },
      params.callback,
    );
  } catch (error) {
    console.error(`空き時間取得エラー: ${safeErrorMessage_(error)}`);
    return json_(
      {
        ok: false,
        message: "空き時間を取得できませんでした。",
      },
      params.callback,
    );
  }
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  let zoomMeeting = null;
  let calendarEvent = null;
  let sheetWrite = null;

  try {
    const contents = event && event.postData ? event.postData.contents : "{}";
    const reservation = normalizeReservation_(JSON.parse(contents || "{}"));

    lock.waitLock(30000);
    lockAcquired = true;

    let slot = findAvailableSlot_(reservation.slotId);

    if (!slot) {
      throw bookingError_(
        "slot_unavailable",
        "申し訳ありません。この時間は直前に予約が入りました。別の日時を選択してください。",
      );
    }

    applyConfirmedSlot_(reservation, slot);

    try {
      // Zoomが作れない限り、カレンダー・シート・メールへ進みません。
      zoomMeeting = createZoomMeeting_(reservation, slot);
      applyZoomMeeting_(reservation, zoomMeeting);

      // Zoom作成中にカレンダーへ別予定が入った場合も、ここで再確認します。
      slot = findAvailableSlot_(reservation.slotId);
      if (!slot) {
        throw bookingError_(
          "slot_unavailable",
          "申し訳ありません。この時間は直前に予約が入りました。別の日時を選択してください。",
        );
      }
      applyConfirmedSlot_(reservation, slot);

      calendarEvent = createCalendarEvent_(reservation, slot);
      sheetWrite = saveToSheet_(reservation);
      sendAdminNotification_(reservation);
      sendAutoReply_(reservation);
    } catch (processingError) {
      rollbackSheetWrite_(sheetWrite);
      rollbackCalendarEvent_(calendarEvent);
      rollbackZoomMeeting_(zoomMeeting);
      throw processingError;
    }

    return json_({
      ok: true,
      message: "無料相談のご予約が確定しました。",
      confirmedSlotId: reservation.confirmedSlotId,
      confirmedSlotLabel: reservation.confirmedSlotLabel,
      meetingStartIso: reservation.meetingStart.toISOString(),
      meetingEndIso: reservation.meetingEnd.toISOString(),
      zoomJoinUrl: reservation.zoomJoinUrl,
    });
  } catch (error) {
    console.error(`予約処理エラー: ${safeErrorMessage_(error)}`);

    if (error && error.bookingCode === "slot_unavailable") {
      return json_({
        ok: false,
        code: "slot_unavailable",
        message: error.message,
      });
    }

    console.error(error.stack);
    return json_({
      ok: false,
      code: "booking_failed",
      message: "予約処理中にエラーが発生しました。恐れ入りますが、時間をおいて再度お試しください。",
    });
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function normalizeReservation_(reservation) {
  const legacySlotIds = Array.isArray(reservation.preferenceIds) ? reservation.preferenceIds : [];
  const normalized = {
    reservationId: clean_(reservation.id) || Utilities.getUuid(),
    guardian: clean_(reservation.guardian),
    guardianKana: clean_(reservation.guardianKana),
    student: clean_(reservation.student),
    studentKana: clean_(reservation.studentKana),
    email: clean_(reservation.email),
    grade: clean_(reservation.grade),
    subject: clean_(reservation.subject),
    memo: clean_(reservation.memo),
    slotId: clean_(reservation.slotId || legacySlotIds[0]),
    createdAt: reservation.createdAt ? new Date(reservation.createdAt) : new Date(),
  };

  if (
    !normalized.guardian ||
    !normalized.guardianKana ||
    !normalized.student ||
    !normalized.studentKana ||
    !normalized.email ||
    !normalized.grade ||
    !normalized.subject ||
    !normalized.slotId
  ) {
    throw new Error("必須項目が不足しています。");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw new Error("メールアドレスの形式が正しくありません。");
  }

  if (Number.isNaN(normalized.createdAt.getTime())) {
    normalized.createdAt = new Date();
  }

  return normalized;
}

function applyConfirmedSlot_(reservation, slot) {
  reservation.confirmedSlotId = slot.id;
  reservation.confirmedSlotLabel = formatMeetingLabel_(slot);
  reservation.meetingStart = slot.meetingStart;
  reservation.meetingEnd = slot.meetingEnd;
  reservation.reservedStart = slot.reservedStart;
  reservation.reservedEnd = slot.reservedEnd;
}

function applyZoomMeeting_(reservation, zoomMeeting) {
  reservation.zoomMeetingId = String(zoomMeeting.id);
  reservation.zoomJoinUrl = zoomMeeting.joinUrl;
  reservation.zoomCreatedAt = zoomMeeting.createdAt;
}

function getAvailabilityResponse_() {
  const slots = getAvailableSlots_();
  const dateMap = {};
  const dates = [];

  slots.forEach((slot) => {
    if (!dateMap[slot.date]) {
      dateMap[slot.date] = true;
      dates.push({
        date: slot.date,
        label: slot.dateLabel,
      });
    }
  });

  return {
    ok: true,
    timezone: REVIA_SETTINGS.timezone,
    meetingMinutes: REVIA_SETTINGS.meetingMinutes,
    generatedAt: new Date().toISOString(),
    dates,
    slots: slots.map(publicSlot_),
  };
}

function publicSlot_(slot) {
  return {
    id: slot.id,
    date: slot.date,
    dateLabel: slot.dateLabel,
    time: slot.time,
    timeLabel: formatTimeRange_(slot.meetingStart, slot.meetingEnd),
    label: formatMeetingLabel_(slot),
    startIso: slot.meetingStart.toISOString(),
    endIso: slot.meetingEnd.toISOString(),
  };
}

function getAvailableSlots_() {
  const calendar = CalendarApp.getCalendarById(REVIA_SETTINGS.calendarId);

  if (!calendar) {
    throw new Error("Googleカレンダーが見つかりません。calendarIdを確認してください。");
  }

  const candidateSlots = buildCandidateSlots_();

  if (candidateSlots.length === 0) {
    return [];
  }

  const windowStart = candidateSlots[0].reservedStart;
  const windowEnd = candidateSlots[candidateSlots.length - 1].reservedEnd;
  const busyEvents = calendar.getEvents(windowStart, windowEnd).filter(isBusyCalendarEvent_);

  return candidateSlots.filter((slot) => !isManuallyBlocked_(slot) && !hasOverlappingEvent_(slot, busyEvents));
}

function buildCandidateSlots_() {
  const slots = [];
  const availability = REVIA_SETTINGS.availability;
  const todayId = formatDateId_(new Date());
  const cutoff = new Date(new Date().getTime() + availability.cutoffHours * 60 * 60 * 1000);
  const beforeMs = availability.bufferBeforeMinutes * 60 * 1000;
  const afterMs = availability.bufferAfterMinutes * 60 * 1000;

  for (let offset = 0; offset <= availability.daysAhead; offset += 1) {
    const dateId = addDaysToDateId_(todayId, offset);
    const ranges = getRangesForDate_(dateId);

    ranges.forEach((range) => {
      const startMinutes = timeToMinutes_(range.start);
      const endMinutes = timeToMinutes_(range.end);

      for (
        let minutes = startMinutes;
        minutes + REVIA_SETTINGS.meetingMinutes <= endMinutes;
        minutes += REVIA_SETTINGS.meetingMinutes
      ) {
        const time = minutesToTime_(minutes);
        const meetingStart = jstDateTime_(dateId, time);
        const meetingEnd = new Date(meetingStart.getTime() + REVIA_SETTINGS.meetingMinutes * 60 * 1000);

        if (meetingStart.getTime() < cutoff.getTime()) {
          continue;
        }

        slots.push({
          id: `${dateId}-${time}`,
          date: dateId,
          dateLabel: formatDateLabel_(meetingStart),
          time,
          meetingStart,
          meetingEnd,
          reservedStart: new Date(meetingStart.getTime() - beforeMs),
          reservedEnd: new Date(meetingEnd.getTime() + afterMs),
        });
      }
    });
  }

  return slots;
}

function getRangesForDate_(dateId) {
  const specialDay = REVIA_SETTINGS.availability.specialOpenDays.find((day) => day.date === dateId);

  if (specialDay) {
    return specialDay.ranges || [];
  }

  const weekday = getJstWeekday_(dateId);
  return REVIA_SETTINGS.availability.weeklyRanges[weekday] || [];
}

function findAvailableSlot_(slotId) {
  return getAvailableSlots_().find((slot) => slot.id === slotId) || null;
}

function isManuallyBlocked_(slot) {
  return REVIA_SETTINGS.availability.manualBlocks.some((block) => {
    if (!block.date) {
      return false;
    }

    let blockStart;
    let blockEnd;

    if (block.allDay) {
      blockStart = jstDateTime_(block.date, "00:00");
      blockEnd = jstDateTime_(addDaysToDateId_(block.date, 1), "00:00");
    } else if (block.start && block.end) {
      blockStart = jstDateTime_(block.date, block.start);
      blockEnd = jstDateTime_(block.date, block.end);
    } else {
      return false;
    }

    return overlaps_(slot.reservedStart, slot.reservedEnd, blockStart, blockEnd);
  });
}

function hasOverlappingEvent_(slot, events) {
  return events.some((event) => overlaps_(slot.reservedStart, slot.reservedEnd, event.getStartTime(), event.getEndTime()));
}

function isBusyCalendarEvent_(event) {
  if (event.isAllDayEvent()) {
    return true;
  }

  try {
    if (typeof event.getTransparency === "function") {
      return event.getTransparency() !== CalendarApp.EventTransparency.TRANSPARENT;
    }
  } catch (error) {
    console.error(`予定の公開状態確認エラー: ${safeErrorMessage_(error)}`);
  }

  return true;
}

function overlaps_(startA, endA, startB, endB) {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

function createZoomMeeting_(reservation, slot) {
  const credentials = getZoomCredentials_();
  const authorization = getZoomAuthorization_(credentials);
  const apiBase = String(authorization.apiBase || "https://api.zoom.us").replace(/\/$/, "");
  const userId = encodeURIComponent(credentials.userId);
  const duration =
    REVIA_SETTINGS.availability.bufferBeforeMinutes +
    REVIA_SETTINGS.meetingMinutes +
    REVIA_SETTINGS.availability.bufferAfterMinutes;
  const topicDate = Utilities.formatDate(slot.meetingStart, REVIA_SETTINGS.timezone, "yyyy年M月d日 HH:mm");
  const requestBody = {
    topic: `REVIA 無料相談｜${topicDate}`,
    type: 2,
    start_time: Utilities.formatDate(slot.reservedStart, REVIA_SETTINGS.timezone, "yyyy-MM-dd'T'HH:mm:ss"),
    duration,
    timezone: REVIA_SETTINGS.timezone,
    password: createZoomPasscode_(),
    agenda: "オンライン家庭教師REVIA 無料相談",
    settings: {
      waiting_room: REVIA_SETTINGS.zoom.waitingRoom,
      join_before_host: REVIA_SETTINGS.zoom.joinBeforeHost,
      auto_recording: REVIA_SETTINGS.zoom.autoRecording,
      mute_upon_entry: true,
    },
  };
  const response = UrlFetchApp.fetch(`${apiBase}/v2/users/${userId}/meetings`, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${authorization.accessToken}`,
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
  });
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode !== 201) {
    console.error(`Zoomミーティング作成エラー (${responseCode}): ${truncate_(responseBody, 1000)}`);
    throw new Error("Zoomミーティングを作成できませんでした。");
  }

  const zoomData = JSON.parse(responseBody || "{}");

  if (!zoomData.id || !zoomData.join_url) {
    console.error("Zoomミーティング作成エラー: meeting IDまたはjoin_urlがありません。");
    throw new Error("Zoomミーティング情報が不足しています。");
  }

  return {
    id: String(zoomData.id),
    joinUrl: zoomData.join_url,
    createdAt: new Date(),
    apiBase,
    accessToken: authorization.accessToken,
  };
}

function getZoomCredentials_() {
  const properties = PropertiesService.getScriptProperties();
  const values = properties.getProperties();
  const missing = ZOOM_PROPERTY_NAMES.filter((name) => !clean_(values[name]));

  if (missing.length > 0) {
    console.error(`Zoom認証情報が未設定です: ${missing.join(", ")}`);
    throw new Error("Zoom認証情報が未設定です。");
  }

  const userId = clean_(values.ZOOM_USER_ID);

  if (userId.toLowerCase() === "me") {
    console.error('ZOOM_USER_IDに"me"は使用できません。ZoomのユーザーIDまたは登録メールアドレスを設定してください。');
    throw new Error("Zoom作成先ユーザーの設定が正しくありません。");
  }

  return {
    accountId: clean_(values.ZOOM_ACCOUNT_ID),
    clientId: clean_(values.ZOOM_CLIENT_ID),
    clientSecret: clean_(values.ZOOM_CLIENT_SECRET),
    userId,
  };
}

function getZoomAuthorization_(credentials) {
  const basicToken = Utilities.base64Encode(`${credentials.clientId}:${credentials.clientSecret}`);
  const response = UrlFetchApp.fetch("https://zoom.us/oauth/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    headers: {
      Authorization: `Basic ${basicToken}`,
    },
    payload: {
      grant_type: "account_credentials",
      account_id: credentials.accountId,
    },
    muteHttpExceptions: true,
  });
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode !== 200) {
    console.error(`Zoom OAuthエラー (${responseCode}): ${truncate_(responseBody, 1000)}`);
    throw new Error("Zoomの認証に失敗しました。");
  }

  const tokenData = JSON.parse(responseBody || "{}");

  if (!tokenData.access_token) {
    console.error("Zoom OAuthエラー: access_tokenがありません。");
    throw new Error("Zoomのアクセストークンを取得できませんでした。");
  }

  return {
    accessToken: tokenData.access_token,
    apiBase: tokenData.api_url || "https://api.zoom.us",
  };
}

function createZoomPasscode_() {
  const randomPart = Utilities.getUuid().replace(/-/g, "").slice(0, 5);
  return `Rv${randomPart}@7Z`;
}

function createCalendarEvent_(reservation, slot) {
  const calendar = CalendarApp.getCalendarById(REVIA_SETTINGS.calendarId);

  if (!calendar) {
    throw new Error("Googleカレンダーが見つかりません。calendarIdを確認してください。");
  }

  const meetingTime = formatMeetingLabel_(slot);
  const reservedTime = formatReservedLabel_(slot);
  const titleTime = formatTimeRange_(slot.meetingStart, slot.meetingEnd);
  const description = [
    "オンライン家庭教師REVIA 無料相談予約",
    "",
    `予約ID: ${reservation.reservationId}`,
    `申込者氏名: ${reservation.guardian}`,
    `申込者ふりがな: ${reservation.guardianKana}`,
    `生徒氏名: ${reservation.student}`,
    `生徒ふりがな: ${reservation.studentKana}`,
    `学年: ${reservation.grade}`,
    `相談科目: ${reservation.subject}`,
    `実際の面談時間: ${meetingTime}`,
    `確保時間: ${reservedTime}`,
    `Zoom参加URL: ${reservation.zoomJoinUrl}`,
    `ZoomミーティングID: ${reservation.zoomMeetingId}`,
    `相談内容: ${reservation.memo || "未入力"}`,
    `連絡先: ${reservation.email}`,
  ].join("\n");

  return calendar.createEvent(`【無料相談】${reservation.guardian}様｜面談 ${titleTime}`, slot.reservedStart, slot.reservedEnd, {
    description,
  });
}

function saveToSheet_(reservation) {
  const properties = PropertiesService.getScriptProperties();
  const configuredSpreadsheetId = clean_(REVIA_SETTINGS.spreadsheetId);
  const storedSpreadsheetId = clean_(properties.getProperty("SPREADSHEET_ID"));
  let spreadsheet = null;

  if (configuredSpreadsheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(configuredSpreadsheetId);
    } catch (error) {
      console.error(`REVIA_SETTINGS.spreadsheetIdを開けませんでした: ${safeErrorMessage_(error)}`);
    }
  }

  if (!spreadsheet && storedSpreadsheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(storedSpreadsheetId);
    } catch (error) {
      console.error(`スクリプトプロパティSPREADSHEET_IDを開けませんでした: ${safeErrorMessage_(error)}`);
      properties.deleteProperty("SPREADSHEET_ID");
    }
  }

  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create("REVIA 無料相談予約");
    properties.setProperty("SPREADSHEET_ID", spreadsheet.getId());
  }

  if (!spreadsheet) {
    throw new Error("保存先のGoogleスプレッドシートが見つかりません。");
  }

  const sheet = spreadsheet.getSheetByName(REVIA_SETTINGS.sheetName) || spreadsheet.insertSheet(REVIA_SETTINGS.sheetName);
  const headers = ensureReservationSheetHeaders_(sheet);
  const values = {
    "受付日時": formatRecordDateTime_(reservation.createdAt),
    "予約ID": reservation.reservationId,
    "確定日時": reservation.confirmedSlotLabel,
    "保護者名": reservation.guardian,
    "保護者ふりがな": reservation.guardianKana,
    "生徒名": reservation.student,
    "生徒ふりがな": reservation.studentKana,
    "学年": reservation.grade,
    "メールアドレス": reservation.email,
    "相談科目": reservation.subject,
    "相談内容": reservation.memo || "",
    "ZoomミーティングID": reservation.zoomMeetingId,
    "Zoom参加URL": reservation.zoomJoinUrl,
    "Zoom作成日時": formatRecordDateTime_(reservation.zoomCreatedAt),
    "面談開始時刻": formatRecordDateTime_(reservation.meetingStart),
    "面談終了時刻": formatRecordDateTime_(reservation.meetingEnd),
    "確保開始時刻": formatRecordDateTime_(reservation.reservedStart),
    "確保終了時刻": formatRecordDateTime_(reservation.reservedEnd),
  };
  const row = headers.map((header) => (Object.prototype.hasOwnProperty.call(values, header) ? values[header] : ""));

  sheet.appendRow(row);
  return {
    sheet,
    rowNumber: sheet.getLastRow(),
  };
}

function ensureReservationSheetHeaders_(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, RESERVATION_SHEET_HEADERS.length).setValues([RESERVATION_SHEET_HEADERS]);
    return RESERVATION_SHEET_HEADERS.slice();
  }

  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(clean_);
  const missingHeaders = RESERVATION_SHEET_HEADERS.filter((header) => currentHeaders.indexOf(header) === -1);

  if (missingHeaders.length > 0) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }

  return currentHeaders.concat(missingHeaders);
}

function sendAdminNotification_(reservation) {
  const body = [
    "以下の内容で無料相談の予約が確定しました。",
    "",
    `予約ID：${reservation.reservationId}`,
    `面談日時：${reservation.confirmedSlotLabel}`,
    `確保時間：${formatRecordDateTime_(reservation.reservedStart)}〜${formatTime_(reservation.reservedEnd)}`,
    `保護者名：${reservation.guardian}`,
    `保護者ふりがな：${reservation.guardianKana}`,
    `生徒名：${reservation.student}`,
    `生徒ふりがな：${reservation.studentKana}`,
    `学年：${reservation.grade}`,
    `メールアドレス：${reservation.email}`,
    `相談科目：${reservation.subject}`,
    `相談内容：${reservation.memo || "未入力"}`,
    `ZoomミーティングID：${reservation.zoomMeetingId}`,
    `Zoom参加URL：${reservation.zoomJoinUrl}`,
  ].join("\n");

  MailApp.sendEmail({
    to: REVIA_SETTINGS.adminEmail,
    subject: "【REVIA】無料相談の予約が確定しました",
    body,
    replyTo: reservation.email,
  });
}

function sendAutoReply_(reservation) {
  const body = [
    `${reservation.guardian}様`,
    "",
    "このたびは、オンライン家庭教師REVIAの無料相談へお申し込みいただき、ありがとうございます。",
    "",
    "以下の日時でご予約を承りました。",
    "",
    "面談日時：",
    reservation.confirmedSlotLabel,
    "",
    "Zoom参加URL：",
    reservation.zoomJoinUrl,
    "",
    "開始時刻になりましたら、上記URLからご参加ください。",
    "待機室でお待ちいただく場合があります。",
    "",
    "持ち物：成績表があればご準備ください。",
    "面談時間：30分程度",
    "",
    "ご都合が悪くなった場合は、REVIAまでご連絡ください。",
    "",
    "オンライン家庭教師REVIA",
    "代表　原田 靖也",
    `Mail：${REVIA_SETTINGS.adminEmail}`,
    "HP：https://revia.website/",
  ].join("\n");

  MailApp.sendEmail({
    to: reservation.email,
    subject: "【REVIA】無料相談のご予約が確定しました",
    body,
  });
}

function rollbackSheetWrite_(sheetWrite) {
  if (!sheetWrite || !sheetWrite.sheet || !sheetWrite.rowNumber) {
    return;
  }

  try {
    if (sheetWrite.rowNumber <= sheetWrite.sheet.getLastRow()) {
      sheetWrite.sheet.deleteRow(sheetWrite.rowNumber);
    }
  } catch (error) {
    console.error(`スプレッドシート巻き戻しエラー: ${safeErrorMessage_(error)}`);
  }
}

function rollbackCalendarEvent_(calendarEvent) {
  if (!calendarEvent) {
    return;
  }

  try {
    calendarEvent.deleteEvent();
  } catch (error) {
    console.error(`カレンダー巻き戻しエラー: ${safeErrorMessage_(error)}`);
  }
}

function rollbackZoomMeeting_(zoomMeeting) {
  if (!zoomMeeting || !zoomMeeting.id || !zoomMeeting.accessToken) {
    return;
  }

  try {
    const apiBase = String(zoomMeeting.apiBase || "https://api.zoom.us").replace(/\/$/, "");
    const response = UrlFetchApp.fetch(`${apiBase}/v2/meetings/${encodeURIComponent(zoomMeeting.id)}`, {
      method: "delete",
      headers: {
        Authorization: `Bearer ${zoomMeeting.accessToken}`,
      },
      muteHttpExceptions: true,
    });
    const responseCode = response.getResponseCode();

    if (responseCode !== 204 && responseCode !== 404) {
      console.error(`Zoom巻き戻しエラー (${responseCode}): ${truncate_(response.getContentText(), 1000)}`);
    }
  } catch (error) {
    console.error(`Zoom巻き戻しエラー: ${safeErrorMessage_(error)}`);
  }
}

function bookingError_(code, message) {
  const error = new Error(message);
  error.bookingCode = code;
  return error;
}

function clean_(value) {
  return String(value || "").trim();
}

function jstDateTime_(dateId, timeText) {
  return new Date(`${dateId}T${timeText}:00+09:00`);
}

function formatDateId_(date) {
  return Utilities.formatDate(date, REVIA_SETTINGS.timezone, "yyyy-MM-dd");
}

function addDaysToDateId_(dateId, days) {
  const date = jstDateTime_(dateId, "00:00");
  return formatDateId_(new Date(date.getTime() + days * 24 * 60 * 60 * 1000));
}

function getJstWeekday_(dateId) {
  const date = jstDateTime_(dateId, "12:00");
  return date.getUTCDay();
}

function formatDateLabel_(date) {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const monthDay = Utilities.formatDate(date, REVIA_SETTINGS.timezone, "M/d");
  const weekday = weekdays[getJstWeekday_(formatDateId_(date))];
  return `${monthDay}（${weekday}）`;
}

function formatMeetingLabel_(slot) {
  const date = Utilities.formatDate(slot.meetingStart, REVIA_SETTINGS.timezone, "yyyy年M月d日");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const weekday = weekdays[getJstWeekday_(formatDateId_(slot.meetingStart))];
  return `${date}（${weekday}） ${formatTimeRange_(slot.meetingStart, slot.meetingEnd)}`;
}

function formatReservedLabel_(slot) {
  return `${formatRecordDateTime_(slot.reservedStart)}〜${formatTime_(slot.reservedEnd)}`;
}

function formatTimeRange_(start, end) {
  return `${formatTime_(start)}〜${formatTime_(end)}`;
}

function formatTime_(date) {
  return Utilities.formatDate(date, REVIA_SETTINGS.timezone, "HH:mm");
}

function formatRecordDateTime_(date) {
  return Utilities.formatDate(date, REVIA_SETTINGS.timezone, "yyyy-MM-dd HH:mm");
}

function timeToMinutes_(timeText) {
  const parts = String(timeText || "").split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function minutesToTime_(minutes) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function safeErrorMessage_(error) {
  return error && error.message ? error.message : String(error || "不明なエラー");
}

function truncate_(text, maxLength) {
  const value = String(text || "");
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function json_(payload, callback) {
  const body = JSON.stringify(payload);
  const callbackName = clean_(callback);

  if (callbackName && /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callbackName)) {
    return ContentService.createTextOutput(`${callbackName}(${body});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
