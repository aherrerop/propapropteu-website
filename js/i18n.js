/* ============================================================
   I18N — trilingual support (ca / es / en)
   UI strings live in lang/ca.json, lang/es.json, lang/en.json.
   Mark any HTML element with data-i18n="key.path" and it gets
   translated automatically. Long legal texts use .lang-block
   elements instead (see legal.html).
   ============================================================ */

const I18N = {
  lang: null,
  dict: {},

  detect() {
    const saved = localStorage.getItem("ppt-lang");
    if (saved && SITE_CONFIG.languages.includes(saved)) return saved;
    if (SITE_CONFIG.autoDetectLang) {
      const nav = (navigator.language || "").slice(0, 2).toLowerCase();
      if (SITE_CONFIG.languages.includes(nav)) return nav;
    }
    return SITE_CONFIG.defaultLang;
  },

  async load(lang) {
    const res = await fetch(`lang/${lang}.json`);
    this.dict = await res.json();
    this.lang = lang;
    document.documentElement.lang = lang;
    localStorage.setItem("ppt-lang", lang);
  },

  t(key) {
    return key.split(".").reduce((o, k) => (o ? o[k] : undefined), this.dict) ?? key;
  },

  /* Pick the right language from a {ca:..., es:..., en:...} object
     (used for product names/descriptions in products.json). */
  pick(obj) {
    if (obj == null) return "";
    if (typeof obj === "string") return obj;
    return obj[this.lang] ?? obj[SITE_CONFIG.defaultLang] ?? Object.values(obj)[0] ?? "";
  },

  apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(el => {
      el.innerHTML = this.t(el.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      el.placeholder = this.t(el.dataset.i18nPlaceholder);
    });
    root.querySelectorAll("[data-i18n-content]").forEach(el => {
      el.content = this.t(el.dataset.i18nContent);
    });
    /* Show only the current language's .lang-block sections */
    root.querySelectorAll(".lang-block").forEach(el => {
      el.classList.toggle("visible", el.dataset.lang === this.lang);
    });
    /* Update switcher state */
    document.querySelectorAll(".lang-switch button").forEach(b => {
      b.classList.toggle("active", b.dataset.lang === this.lang);
    });
  },

  async set(lang) {
    await this.load(lang);
    this.apply();
    document.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
  },

  async init() {
    await this.load(this.detect());
  }
};
