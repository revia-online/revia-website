// REVIA 法人・メディア問い合わせ専用Webアプリ
// 無料相談予約用のApps Scriptとは別の新規プロジェクトへ、このファイルだけを貼り付けます。
const BUSINESS_CONTACT_SETTINGS = {
  emailPropertyName: "BUSINESS_CONTACT_EMAIL",
  fallbackEmail: "revia2026.mail@gmail.com",
  timezone: "Asia/Tokyo",
  allowedTypes: ["取材・メディア掲載", "出演依頼", "業務提携", "営業", "その他"],
  maxLengths: {
    organization: 150,
    name: 100,
    email: 254,
    phone: 50,
    subject: 200,
    message: 5000,
  },
};

const BUSINESS_CONTACT_SUCCESS_MESSAGE =
  "お問い合わせを受け付けました。\n内容を確認のうえ、必要に応じてご連絡いたします。";
const BUSINESS_CONTACT_FAILURE_MESSAGE =
  "送信できませんでした。時間をおいて再度お試しいただくか、メールにてお問い合わせください。";

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};

  if (params.mode === "business-contact-config") {
    return json_(
      {
        ok: true,
        contactEmail: getBusinessContactEmail_(),
      },
      params.callback,
    );
  }

  return json_(
    {
      ok: true,
      message: "REVIA business contact endpoint is running.",
    },
    params.callback,
  );
}

function doPost(event) {
  const contactEmail = getBusinessContactEmail_();

  try {
    const contents = event && event.postData ? event.postData.contents : "{}";
    const request = JSON.parse(contents || "{}");

    // botがhoneypotへ入力した場合は、メールを送らず通常の完了応答だけを返します。
    if (clean_(request.website)) {
      console.warn("法人問い合わせのhoneypotを検知したため、メール送信を省略しました。");
      return successResponse_(contactEmail);
    }

    if (clean_(request.mode) !== "business-contact") {
      throw new Error("問い合わせモードが不正です。");
    }

    const inquiry = normalizeAndValidateInquiry_(request);
    sendAdminNotification_(inquiry, contactEmail);

    return successResponse_(contactEmail);
  } catch (error) {
    console.error(`法人問い合わせ処理エラー: ${safeErrorMessage_(error)}`);
    if (error && error.stack) {
      console.error(error.stack);
    }

    return json_({
      ok: false,
      code: "business_contact_failed",
      message: BUSINESS_CONTACT_FAILURE_MESSAGE,
      contactEmail,
    });
  }
}

function normalizeAndValidateInquiry_(request) {
  const inquiry = {
    type: clean_(request.inquiryType),
    organization: clean_(request.organization),
    name: clean_(request.name),
    email: clean_(request.email),
    phone: clean_(request.phone),
    subject: clean_(request.subject),
    message: clean_(request.message),
    privacyAccepted: request.privacyAccepted === true || clean_(request.privacyAccepted) === "true",
    receivedAt: new Date(),
  };

  const requiredValuesPresent =
    BUSINESS_CONTACT_SETTINGS.allowedTypes.indexOf(inquiry.type) !== -1 &&
    inquiry.name &&
    inquiry.email &&
    inquiry.subject &&
    inquiry.message &&
    inquiry.privacyAccepted;

  if (!requiredValuesPresent) {
    throw new Error("必須項目が不足しています。");
  }

  if (!isValidEmail_(inquiry.email)) {
    throw new Error("メールアドレスの形式が不正です。");
  }

  const limits = BUSINESS_CONTACT_SETTINGS.maxLengths;
  const lengthsAreValid =
    inquiry.organization.length <= limits.organization &&
    inquiry.name.length <= limits.name &&
    inquiry.email.length <= limits.email &&
    inquiry.phone.length <= limits.phone &&
    inquiry.subject.length <= limits.subject &&
    inquiry.message.length <= limits.message;

  if (!lengthsAreValid) {
    throw new Error("入力できる文字数を超えています。");
  }

  return inquiry;
}

function sendAdminNotification_(inquiry, recipientEmail) {
  const subjectLabel = sanitizeMailHeader_(inquiry.organization || inquiry.name, 100);
  const body = [
    "以下の内容で法人・メディア向け問い合わせを受け付けました。",
    "",
    `お問い合わせ種別：${inquiry.type}`,
    `会社・団体名：${inquiry.organization || "未入力"}`,
    `お名前：${inquiry.name}`,
    `メールアドレス：${inquiry.email}`,
    `電話番号：${inquiry.phone || "未入力"}`,
    `件名：${inquiry.subject}`,
    "お問い合わせ内容：",
    inquiry.message,
    "",
    `受付日時：${formatReceivedAt_(inquiry.receivedAt)}`,
  ].join("\n");

  MailApp.sendEmail({
    to: recipientEmail,
    subject: `【REVIA法人問い合わせ｜${inquiry.type}】${subjectLabel}`,
    body,
    replyTo: inquiry.email,
  });
}

function successResponse_(contactEmail) {
  return json_({
    ok: true,
    code: "business_contact_received",
    message: BUSINESS_CONTACT_SUCCESS_MESSAGE,
    contactEmail,
  });
}

function getBusinessContactEmail_() {
  const propertyValue = clean_(
    PropertiesService.getScriptProperties().getProperty(BUSINESS_CONTACT_SETTINGS.emailPropertyName),
  );
  return propertyValue || BUSINESS_CONTACT_SETTINGS.fallbackEmail;
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeMailHeader_(value, maxLength) {
  return truncate_(clean_(value).replace(/[\r\n]+/g, " "), maxLength);
}

function formatReceivedAt_(date) {
  return Utilities.formatDate(date, BUSINESS_CONTACT_SETTINGS.timezone, "yyyy-MM-dd HH:mm:ss");
}

function clean_(value) {
  return String(value || "").trim();
}

function truncate_(text, maxLength) {
  const value = String(text || "");
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function safeErrorMessage_(error) {
  return error && error.message ? error.message : String(error || "不明なエラー");
}

function json_(payload, callback) {
  const body = JSON.stringify(payload);
  const callbackName = clean_(callback);

  if (callbackName && /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callbackName)) {
    return ContentService.createTextOutput(`${callbackName}(${body});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
