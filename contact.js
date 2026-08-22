const businessContactForm = document.querySelector("#businessContactForm");
const businessContactMessage = document.querySelector("#businessContactMessage");
const businessContactFallback = document.querySelector("#businessContactFallback");
const businessContactEmail = document.querySelector("#businessContactEmail");
const businessContactSubmit = document.querySelector(".business-contact-submit");

// 法人問い合わせ専用Apps Scriptをデプロイした後、発行された /exec URLをこの1か所へ設定します。
// 無料相談予約用のURLは設定しないでください。
const BUSINESS_CONTACT_ENDPOINT = "https://script.google.com/macros/s/AKfycbweR8EhINziLN9__aTJPZ3ilsGahe_WAo5wkY8fIeKqm4jVZQdG7B3eiNOxcHuVDfEm/exec";
const BUSINESS_CONTACT_SETTINGS = {
  fallbackEmail: "revia2026.mail@gmail.com",
  requestTimeoutMs: 15000,
};

const BUSINESS_CONTACT_FAILURE_MESSAGE =
  "送信できませんでした。時間をおいて再度お試しいただくか、メールにてお問い合わせください。";
let configuredContactEmail = BUSINESS_CONTACT_SETTINGS.fallbackEmail;

const setBusinessContactEmail = (email) => {
  const normalizedEmail = String(email || "").trim();

  if (!normalizedEmail || !businessContactEmail) {
    return;
  }

  configuredContactEmail = normalizedEmail;
  businessContactEmail.textContent = normalizedEmail;
  businessContactEmail.href = `mailto:${normalizedEmail}`;
};

setBusinessContactEmail(BUSINESS_CONTACT_SETTINGS.fallbackEmail);

const getBusinessContactConfigUrl = (callbackName) => {
  const url = new URL(BUSINESS_CONTACT_ENDPOINT);
  url.searchParams.set("mode", "business-contact-config");
  url.searchParams.set("callback", callbackName);
  url.searchParams.set("_", Date.now().toString());
  return url.toString();
};

const fetchBusinessContactConfig = () =>
  new Promise((resolve, reject) => {
    const callbackName = `reviaBusinessContact_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      delete window[callbackName];
      script.remove();
      reject(new Error("問い合わせ先情報の取得がタイムアウトしました。"));
    }, BUSINESS_CONTACT_SETTINGS.requestTimeoutMs);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      resolve(payload);
    };

    script.src = getBusinessContactConfigUrl(callbackName);
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      reject(new Error("問い合わせ先情報を取得できませんでした。"));
    };
    document.body.append(script);
  });

const loadBusinessContactConfig = async () => {
  if (!BUSINESS_CONTACT_ENDPOINT) {
    return configuredContactEmail;
  }

  const result = await fetchBusinessContactConfig();
  if (result && result.ok && result.contactEmail) {
    setBusinessContactEmail(result.contactEmail);
  }
  return configuredContactEmail;
};

const setBusinessContactStatus = (message, status = "") => {
  if (!businessContactMessage) {
    return;
  }

  businessContactMessage.textContent = message;
  businessContactMessage.classList.toggle("is-success", status === "success");
  businessContactMessage.classList.toggle("is-error", status === "error");
};

const showBusinessContactFallback = async (email = "") => {
  setBusinessContactEmail(email);

  if (!configuredContactEmail) {
    try {
      await loadBusinessContactConfig();
    } catch (error) {
      console.error(error);
    }
  }

  if (businessContactFallback) {
    businessContactFallback.hidden = !configuredContactEmail;
  }
};

const buildBusinessContactPayload = (form) => {
  const formData = new FormData(form);
  return {
    mode: "business-contact",
    inquiryType: formData.get("inquiryType"),
    organization: formData.get("organization"),
    name: formData.get("contactName"),
    email: formData.get("contactEmail"),
    phone: formData.get("phone"),
    subject: formData.get("contactSubject"),
    message: formData.get("contactMessage"),
    privacyAccepted: formData.get("privacyAccepted") === "true",
    website: formData.get("website"),
  };
};

const sendBusinessContact = async (payload) => {
  if (!BUSINESS_CONTACT_ENDPOINT) {
    throw new Error("法人問い合わせ専用のWebアプリURLが未設定です。");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BUSINESS_CONTACT_SETTINGS.requestTimeoutMs);

  try {
    const response = await fetch(BUSINESS_CONTACT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(BUSINESS_CONTACT_FAILURE_MESSAGE);
    }

    const result = await response.json();
    setBusinessContactEmail(result.contactEmail);

    if (!result.ok) {
      const error = new Error(result.message || BUSINESS_CONTACT_FAILURE_MESSAGE);
      error.result = result;
      throw error;
    }

    return result;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

if (businessContactForm) {
  loadBusinessContactConfig().catch((error) => {
    console.error(error);
  });

  businessContactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!businessContactForm.reportValidity()) {
      return;
    }

    if (businessContactSubmit) {
      businessContactSubmit.disabled = true;
      businessContactSubmit.textContent = "送信しています…";
    }
    if (businessContactFallback) {
      businessContactFallback.hidden = true;
    }
    setBusinessContactStatus("送信しています。");

    try {
      const result = await sendBusinessContact(buildBusinessContactPayload(businessContactForm));
      businessContactForm.reset();
      setBusinessContactStatus(result.message, "success");
    } catch (error) {
      const result = error && error.result ? error.result : null;
      const message = result && result.message ? result.message : BUSINESS_CONTACT_FAILURE_MESSAGE;
      setBusinessContactStatus(message, "error");
      await showBusinessContactFallback(result && result.contactEmail ? result.contactEmail : "");
      console.error(error);
    } finally {
      if (businessContactSubmit) {
        businessContactSubmit.disabled = false;
        businessContactSubmit.textContent = "問い合わせを送信する";
      }
    }
  });
}
