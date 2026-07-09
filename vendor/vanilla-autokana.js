/*!
 * VanillaAutoKana local helper
 * License: MIT
 * A dependency-free AutoKana helper for Japanese name fields.
 */
(function attachVanillaAutoKana(global) {
  "use strict";

  const HIRAGANA_PATTERN = /^[ぁ-ゖーゝゞ\s　]+$/;
  const NON_HIRAGANA_PATTERN = /[^ぁ-ゖーゝゞ\s　]/g;

  const normalizeKana = (value) => String(value || "").replace(NON_HIRAGANA_PATTERN, "");
  const isHiraganaOnly = (value) => {
    const text = String(value || "").trim();
    return text.length > 0 && HIRAGANA_PATTERN.test(text);
  };

  const bind = (sourceInput, kanaInput, options = {}) => {
    if (!sourceInput || !kanaInput) {
      return null;
    }

    let reading = normalizeKana(kanaInput.value);
    let activeKanaSegment = "";
    let manualEdited = false;

    const updateKanaInput = () => {
      kanaInput.value = reading;

      if (typeof options.onUpdate === "function") {
        options.onUpdate(reading, kanaInput);
      }
    };

    const capture = () => {
      if (manualEdited) {
        return;
      }

      const sourceValue = sourceInput.value || "";
      const kana = normalizeKana(sourceValue);

      if (!kana) {
        activeKanaSegment = "";
        return;
      }

      if (isHiraganaOnly(sourceValue)) {
        reading = kana;
        activeKanaSegment = kana;
        updateKanaInput();
        return;
      }

      if (activeKanaSegment && kana.startsWith(activeKanaSegment) && reading.endsWith(activeKanaSegment)) {
        reading = `${reading.slice(0, -activeKanaSegment.length)}${kana}`;
      } else if (!reading.endsWith(kana)) {
        reading = `${reading}${kana}`;
      }

      activeKanaSegment = kana;
      updateKanaInput();
    };

    const markManualEdited = () => {
      manualEdited = true;
      kanaInput.dataset.kanaEdited = "true";
    };

    const reset = () => {
      reading = normalizeKana(kanaInput.value);
      activeKanaSegment = "";
      manualEdited = false;
      delete kanaInput.dataset.kanaEdited;
    };

    const destroy = () => {
      sourceInput.removeEventListener("input", capture);
      sourceInput.removeEventListener("keyup", capture);
      sourceInput.removeEventListener("change", capture);
      kanaInput.removeEventListener("input", markManualEdited);
    };

    sourceInput.addEventListener("input", capture);
    sourceInput.addEventListener("keyup", capture);
    sourceInput.addEventListener("change", capture);
    kanaInput.addEventListener("input", markManualEdited);

    return {
      capture,
      destroy,
      reset,
      getKana: () => reading,
      isManualEdited: () => manualEdited,
    };
  };

  global.VanillaAutoKana = {
    bind,
    normalizeKana,
    isHiraganaOnly,
  };
})(window);
