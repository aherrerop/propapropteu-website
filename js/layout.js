/* ============================================================
   LAYOUT — shared header, footer, cookie banner, WhatsApp
   button and Snipcart loader. Edit the nav or footer ONCE here
   and every page updates.
   ============================================================ */

const Layout = {

  // Top nav: HOME · SHOP · REQUEST A PROP · ABOUT · CONTACT.
  // Production Packs and FAQ stay reachable from the footer.
  navItems: [
    { href: "./",                key: "nav.home" },
    { href: "shop.html",         key: "nav.catalog" },
    { href: "custom-props.html", key: "nav.request" },
    { href: "about.html",        key: "nav.about" },
    { href: "contact.html",      key: "nav.contact" }
  ],

  socialIcons: {
    instagram: '<svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8 0 3.2 0 3.6-.1 4.8-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1-3.2 0-3.6 0-4.8-.1-3.3-.1-4.8-1.7-4.9-4.9-.1-1.3-.1-1.6-.1-4.8 0-3.2 0-3.6.1-4.8C2.4 4 4 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8A6.2 6.2 0 1 0 18.2 12 6.2 6.2 0 0 0 12 5.8zm0 10.2A4 4 0 1 1 16 12a4 4 0 0 1-4 4zm6.4-11.8a1.4 1.4 0 1 0 1.4 1.4 1.4 1.4 0 0 0-1.4-1.4z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M19.6 6.7a5 5 0 0 1-3.8-1.7 5 5 0 0 1-1.2-3.3h-3.3v13.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.3 6.3 0 0 0-.9-.1 6.2 6.2 0 1 0 6.2 6.2V8.9a8.3 8.3 0 0 0 5 1.6z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.5 15.5v-7L15.8 12z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7a18 18 0 0 1 2.7.2v3h-1.5a1.7 1.7 0 0 0-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z"/></svg>'
  },

  currentPage() {
    return location.pathname.split("/").pop() || "index.html";
  },

  toggleNav() {
    const h = document.getElementById("site-header");
    const open = h.classList.toggle("nav-open");
    const btn = h.querySelector(".nav-toggle");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  },
  closeNav() {
    const h = document.getElementById("site-header");
    h.classList.remove("nav-open");
    const btn = h.querySelector(".nav-toggle");
    if (btn) btn.setAttribute("aria-expanded", "false");
  },
  toggleLang(e) {
    if (e) e.stopPropagation();
    const l = document.querySelector(".lang");
    if (!l) return;
    const open = l.classList.toggle("open");
    if (open) {
      const close = () => { l.classList.remove("open"); document.removeEventListener("click", close); };
      setTimeout(() => document.addEventListener("click", close), 0);
    }
  },

  // Current language code on the header button (EN / CA / ES).
  showLang() {
    document.querySelectorAll(".lang-code").forEach(el => el.textContent = (I18N.lang || "").toUpperCase());
  },

  renderHeader() {
    const cur = this.currentPage();
    const isHome = c => c === "index.html" || c === "";
    const nav = this.navItems.map(i => {
      const active = (i.href === "./" ? isHome(cur) : cur === i.href) ? "active" : "";
      return `<a href="${i.href}" class="${active}" data-i18n="${i.key}"></a>`;
    }).join("");
    // Language menu: each row = short code + full name; the current one gets a tick.
    const tick = '<svg class="tick" viewBox="0 0 12 10" width="12" height="10" aria-hidden="true"><path d="M1 5l3.5 3.5L11 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const langs = SITE_CONFIG.languages.map(l =>
      `<button data-lang="${l}" role="menuitem" onclick="I18N.set('${l}')"><span class="lm-code">${l.toUpperCase()}</span><span class="lm-name">${{ ca: "Català", es: "Español", en: "English" }[l] || l}</span>${tick}</button>`
    ).join("");
    const globe = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z"/></svg>';

    document.getElementById("site-header").innerHTML = `
      <div class="container header-inner">
        <a href="./" class="logo-link" aria-label="${SITE_CONFIG.businessName}">
          <img class="logo-mark" src="${SITE_CONFIG.logo}" alt="">
          <span class="logo-type"><span class="lt-a">PROP<img class="lt-fig" src="assets/logo_a.svg" alt="a">PROP</span><span class="lt-b">TEU</span></span>
        </a>
        <nav class="main-nav" onclick="Layout.closeNav()">${nav}</nav>
        <div class="header-tools">
          <div class="lang">
            <button class="lang-globe" aria-label="Language" aria-haspopup="true" onclick="Layout.toggleLang(event)">${globe}<span class="lang-code"></span><svg class="caret" viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="lang-menu" role="menu">${langs}</div>
          </div>
          <a class="login-link" href="acceso.html" data-i18n-aria="ui.team">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            <span data-i18n="nav.login"></span>
          </a>
          <button class="cart-btn" onclick="Cart.open()">
            <span data-i18n="nav.cart"></span>
            <span class="cart-count">0</span>
          </button>
          <button class="nav-toggle" aria-label="Menu" aria-expanded="false" onclick="Layout.toggleNav()">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>`;
  },

  renderFooter() {
    const s = SITE_CONFIG.social;
    const socials = Object.keys(s)
      .filter(k => s[k])
      .map(k => `<a href="${s[k]}" target="_blank" rel="noopener" aria-label="${k}">${this.socialIcons[k] || k}</a>`)
      .join("");

    document.getElementById("site-footer").innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <h4>${SITE_CONFIG.businessName}</h4>
            <p data-i18n="footer.blurb"></p>
            <div class="social-row">${socials}</div>
          </div>
          <div>
            <h4 data-i18n="footer.shop"></h4>
            <a href="shop.html" data-i18n="nav.catalog"></a>
            <a href="custom-props.html" data-i18n="nav.request"></a>
            <a href="packs.html" data-i18n="nav.packs"></a>
            <a href="envios.html" data-i18n="ship.title"></a>
            <a href="faq.html" data-i18n="nav.faq"></a>
          </div>
          <div>
            <h4 data-i18n="footer.company"></h4>
            <a href="./" data-i18n="nav.home"></a>
            <a href="about.html" data-i18n="nav.about"></a>
            <a href="contact.html" data-i18n="nav.contact"></a>
          </div>
          <div>
            <h4 data-i18n="footer.legal"></h4>
            <a href="legal.html#aviso" data-i18n="footer.legalNotice"></a>
            <a href="legal.html#privacidad" data-i18n="footer.privacy"></a>
            <a href="legal.html#cookies" data-i18n="footer.cookies"></a>
            <a href="legal.html#condiciones" data-i18n="footer.terms"></a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} ${SITE_CONFIG.businessName}</span>
          <span>${SITE_CONFIG.email} · ${SITE_CONFIG.phoneDisplay} · <a href="acceso.html">Acceso</a></span>
        </div>
      </div>`;
  },

  renderWhatsApp() {
    if (!SITE_CONFIG.whatsapp) return;
    const a = document.createElement("a");
    a.className = "whatsapp-fab";
    a.href = `https://wa.me/${SITE_CONFIG.whatsapp}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "WhatsApp");
    a.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07a8.18 8.18 0 0 1-2.4-1.48 9 9 0 0 1-1.66-2.07c-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.62-.93-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 1 1 8.38 4.63zM12.05 0A11.82 11.82 0 0 0 1.85 17.75L.19 24l6.4-1.68a11.8 11.8 0 0 0 5.45 1.39A11.85 11.85 0 1 0 12.05 0z"/></svg>';
    document.body.appendChild(a);
  },

  renderCookieBanner() {
    if (localStorage.getItem("ppt-cookies-ok")) return;
    const div = document.createElement("div");
    div.className = "cookie-banner";
    div.innerHTML = `
      <span data-i18n="cookies.text"></span>
      <a href="legal.html#cookies" data-i18n="cookies.more"></a>
      <button class="btn" style="padding:7px 16px;font-size:0.85rem"
              onclick="Layout.acceptCookies()"
              data-i18n="cookies.accept"></button>`;
    document.body.appendChild(div);
    document.body.classList.add("has-cookie");
    const setH = () =>
      document.documentElement.style.setProperty("--cookie-h", div.offsetHeight + "px");
    setH();
    window.addEventListener("resize", setH);
  },

  acceptCookies() {
    localStorage.setItem("ppt-cookies-ok", "1");
    const b = document.querySelector(".cookie-banner");
    if (b) b.remove();
    document.body.classList.remove("has-cookie");
  },

  loadSnipcart() {
    const key = SITE_CONFIG.snipcartApiKey;
    if (!key || key.startsWith("PUT_")) return; // not configured yet
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdn.snipcart.com/themes/v3.4.1/default/snipcart.css";
    document.head.appendChild(css);
    const div = document.createElement("div");
    div.hidden = true;
    div.id = "snipcart";
    div.dataset.apiKey = key;
    div.dataset.currency = SITE_CONFIG.currency;
    div.dataset.configModalStyle = "side";
    document.body.appendChild(div);
    const js = document.createElement("script");
    js.async = true;
    js.src = "https://cdn.snipcart.com/themes/v3.4.1/default/snipcart.js";
    document.body.appendChild(js);
  },

  // Accessibility: keyboard skip-link to the main content.
  renderSkipLink() {
    const main = document.querySelector("main");
    if (!main) return;
    if (!main.id) main.id = "maincontent";
    main.setAttribute("tabindex", "-1");
    if (!document.querySelector(".skip-link")) {
      const a = document.createElement("a");
      a.className = "skip-link";
      // Full address + #: product pages use <base href="/">, where a bare #id would jump to the home page.
      a.href = location.pathname + location.search + "#" + main.id;
      a.setAttribute("data-i18n", "ui.skip");
      document.body.insertBefore(a, document.body.firstChild);
    }
  },

  // SEO: a canonical URL for the current page.
  renderCanonical() {
    try {
      let c = document.querySelector('link[rel="canonical"]');
      if (!c) { c = document.createElement("link"); c.rel = "canonical"; document.head.appendChild(c); }
      const path = location.pathname.replace(/index\.html$/, "");
      const q = new URLSearchParams(location.search), keep = new URLSearchParams();
      if (path.endsWith("product.html") && q.get("id")) keep.set("id", q.get("id"));
      if (q.get("lang") && q.get("lang") !== SITE_CONFIG.defaultLang) keep.set("lang", q.get("lang"));
      c.href = location.origin + path + (keep.toString() ? "?" + keep : "");
    } catch (e) {}
  },

  // Page title and description in the current language (texts: meta.* in lang/*.json).
  pageKey() {
    const map = { "index.html": "home", "shop.html": "shop", "custom-props.html": "request", "about.html": "about", "contact.html": "contact",
      "faq.html": "faq", "legal.html": "legal", "envios.html": "shipping", "packs.html": "packs", "pack-config.html": "packConfig", "404.html": "notfound" };
    return document.body.dataset.product ? "product" : (map[this.currentPage()] || "");
  },
  setMeta() {
    const k = this.pageKey();
    if (!k || k === "product") return;              // product pages set their own
    const m = I18N.t("meta." + k);
    if (!m || typeof m !== "object") return;
    document.title = SITE_CONFIG.businessName + " — " + m.title;
    const set = (sel, v) => { const el = document.querySelector(sel); if (el && v) el.setAttribute("content", v); };
    set('meta[name="description"]', m.desc); set('meta[property="og:title"]', document.title); set('meta[property="og:description"]', m.desc);
  },

  async init() {
    await I18N.init();
    this.renderCanonical();
    this.renderSkipLink();
    this.renderHeader();
    this.renderFooter();
    this.renderWhatsApp();
    this.renderCookieBanner();
    this.loadSnipcart();
    I18N.apply();
    this.showLang();
    this.setMeta();
    document.addEventListener("langchange", () => { this.showLang(); this.setMeta(); this.renderCanonical(); });
    Cart.updateCount();
    Cart.handlePaymentReturn();
  }
};

/* ---------- shared catalog helpers ---------- */

const Catalog = {
  data: null,

  async load() {
    if (this.data) return this.data;
    const res = await fetch("data/products.json", { cache: "no-cache" });
    this.data = await res.json();
    return this.data;
  },

  formatPrice(p) {
    return p.toLocaleString(I18N.lang === "en" ? "en-GB" : "es-ES",
      { style: "currency", currency: "EUR" });
  },

  badge(type) {
    const map = {
      own:  { cls: "badge-own",  key: "badge.own"  },
      std:  { cls: "badge-std",  key: "badge.std"  },
      tool: { cls: "badge-tool", key: "badge.tool" }
    };
    return map[type] || map.std;
  },

  stock(product) {
    if (product.stock === 0)  return { cls: "stock-out", key: "stock.out" };
    if (product.stock !== undefined && product.stock <= (product.lowStockAt ?? 3))
      return { cls: "stock-low", key: "stock.low" };
    return { cls: "stock-in", key: "stock.in" };
  },

  // Delivery dates — the same rule as the engine (backend/Website.gs deliveryEta_):
  // ready = now + printing time + 24 h (weekend -> Monday); shipping = +1 to 2 working days.
  eta(printMin, delivery) {
    const addWork = (d, n) => { d = new Date(d); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6 !== 0) n--; } return d; };
    const ready = new Date(Date.now() + (Number(printMin) || 0) * 60000 + 24 * 3600000);
    while (ready.getDay() % 6 === 0) ready.setDate(ready.getDate() + 1);
    const [a, b] = SITE_CONFIG.shipDays || [1, 2];
    return delivery === "pickup" ? { from: ready, to: ready } : { from: addWork(ready, a), to: addWork(ready, b) };
  },
  dayText(d) {
    const loc = { es: "es-ES", ca: "ca-ES", en: "en-GB" }[I18N.lang] || "es-ES";
    return d.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
  },
  etaText(printMin, delivery) {
    const e = this.eta(printMin, delivery);
    return I18N.t(delivery === "pickup" ? "eta.pickup" : "eta.ship").replace("{a}", this.dayText(e.from)).replace("{b}", this.dayText(e.to));
  },
  // VAT included in every price: split it for display.
  vat(total) {
    const p = SITE_CONFIG.vatRate || 21, base = total / (1 + p / 100);
    return { p, base, vat: total - base };
  },

  // Each product has its own page, p/<id>.html, so shared links show its picture and name.
  url(p) { return "p/" + encodeURIComponent(p.id) + ".html"; },

  mainImage(p) {
    return (p.images && p.images[0]) || "assets/img/placeholder.svg";
  },

  // Transparent "cutout" image for the home hero + shop featured band.
  // Falls back to the first product photo if no dedicated hero image is set.
  heroImage(p) {
    return p.heroImage || this.mainImage(p);
  },
  // true  -> image is a cutout (no background): show it "contain" on the panel
  // false -> image is a photo (has its own background): show it "cover", filling the frame
  isCutout(p) {
    return p.cutout === true;
  },

  /* Snipcart buy-button attributes for a product.
     Add class "snipcart-add-item" on the button yourself. */
  snipcartAttrs(p) {
    if (p.stock === 0) return "disabled";
    const name = I18N.pick(p.name).replace(/"/g, "&quot;");
    return `data-item-id="${p.id}"
      data-item-price="${p.price}"
      data-item-url="product.html?id=${p.id}"
      data-item-name="${name}"
      data-item-image="${this.mainImage(p)}"
      ${p.stock !== undefined ? `data-item-max-quantity="${p.stock}"` : ""}`;
  }
};

/* ---------- multi-item cart (localStorage + slide-over drawer) ---------- */
const Cart = {
  key: "ppt-cart",
  byId: {},
  get items() { try { return JSON.parse(localStorage.getItem(this.key) || "[]"); } catch (e) { return []; } },
  write(items) { try { localStorage.setItem(this.key, JSON.stringify(items)); } catch (e) {} this.updateCount(); },
  count() { return this.items.reduce((n, i) => n + i.qty, 0); },
  updateCount() { const n = this.count(); document.querySelectorAll(".cart-count").forEach(el => el.textContent = n); },
  async add(id, qty = 1) {
    const items = this.items, e = items.find(x => x.id === id);
    if (e) e.qty += qty; else items.push({ id: id, qty: qty });
    this.write(items); await this.open();
  },
  setQty(id, qty) {
    let items = this.items;
    if (qty <= 0) items = items.filter(x => x.id !== id);
    else { const e = items.find(x => x.id === id); if (e) e.qty = qty; }
    this.write(items); this.render();
  },
  // After a Stripe redirect: confirm payment (?paid=ORDER&cs=SESSION) or note a cancel.
  async handlePaymentReturn() {
    const q = new URLSearchParams(location.search);
    const paid = q.get("paid"), cs = q.get("cs"), cancel = q.get("cancel");
    if (!paid && !cancel) return;
    const strip = () => history.replaceState({}, "", location.pathname);
    const banner = (text, ok) => {
      const d = document.createElement("div");
      d.className = "pay-banner " + (ok ? "ok" : "err");
      d.setAttribute("role", "status");
      d.textContent = text;
      document.body.appendChild(d);
      setTimeout(() => d.classList.add("show"), 30);
      setTimeout(() => { d.classList.remove("show"); setTimeout(() => d.remove(), 400); }, 9000);
    };
    if (cancel) { strip(); banner(I18N.t("ui.payCancel"), false); return; }
    try {
      const r = await (await fetch(SITE_CONFIG.adminApi, { method: "POST", redirect: "follow",
        body: JSON.stringify({ action: "verifyPayment", order: paid, cs: cs }) })).json();
      if (r && r.ok && r.paid) { this.write([]); banner(I18N.t("ui.payOk").replace("{ref}", paid), true); }
      else banner(I18N.t("ui.payPending").replace("{ref}", paid), true);
    } catch (e) { banner(I18N.t("ui.payPending").replace("{ref}", paid), true); }
    strip();
  },
  // Printing minutes of everything in the cart (for the delivery date).
  printMin() { return this.items.reduce((s, i) => { const p = this.byId[i.id]; return s + (p ? (Number(p.printMin) || 0) * i.qty : 0); }, 0); },
  // Subtotal before VAT, VAT, free shipping, total.
  breakdown() {
    const t = this.total(), v = Catalog.vat(t), row = (k, val, cls) => '<div class="cart-line' + (cls ? " " + cls : "") + '"><span>' + k + '</span><span>' + val + '</span></div>';
    return '<div class="cart-sum">' + row(I18N.t("vat.base"), Catalog.formatPrice(v.base)) + row(I18N.t("vat.vat").replace("{p}", v.p), Catalog.formatPrice(v.vat)) +
      row(I18N.t("vat.ship"), I18N.t("vat.free")) + '</div><div class="cart-total"><span>' + I18N.t("vat.total") + '</span><strong>' + Catalog.formatPrice(t) + '</strong></div>';
  },
  total() { return this.items.reduce((s, i) => { const p = this.byId[i.id]; return s + (p ? p.price * i.qty : 0); }, 0); },
  ensureDrawer() {
    if (document.getElementById("cart-drawer")) return;
    const d = document.createElement("div");
    d.id = "cart-drawer"; d.className = "cart-drawer"; d.hidden = true;
    d.innerHTML =
      '<div class="cart-overlay" onclick="Cart.close()"></div>' +
      '<aside class="cart-panel" role="dialog" data-i18n-aria="nav.cart">' +
      '<div class="cart-head"><h2 data-i18n="nav.cart"></h2><button class="cart-x" data-i18n-aria="ui.close" onclick="Cart.close()">&times;</button></div>' +
      '<div class="cart-body" id="cart-body"></div><div class="cart-foot" id="cart-foot"></div></aside>';
    document.body.appendChild(d);
  },
  async open() {
    this.ensureDrawer();
    await Catalog.load();
    this.byId = {}; Catalog.data.products.forEach(p => this.byId[p.id] = p);
    document.getElementById("cart-drawer").hidden = false;
    document.body.style.overflow = "hidden";
    this.render();
  },
  close() { const d = document.getElementById("cart-drawer"); if (d) d.hidden = true; document.body.style.overflow = ""; },
  render() {
    const body = document.getElementById("cart-body"), foot = document.getElementById("cart-foot");
    const items = this.items;
    if (!items.length) { body.innerHTML = '<p class="cart-empty" data-i18n="cart.empty"></p>'; foot.innerHTML = ""; I18N.apply(body); return; }
    body.innerHTML = items.map(i => {
      const p = this.byId[i.id]; if (!p) return "";
      return '<div class="cart-row"><img src="' + Catalog.mainImage(p) + '" alt="">' +
        '<div class="cart-row-main"><div class="cart-row-name">' + I18N.pick(p.name) + '</div>' +
        '<div class="cart-row-price">' + Catalog.formatPrice(p.price) + '</div></div>' +
        '<div class="cart-qty"><button aria-label="-" onclick="Cart.setQty(\'' + p.id + '\',' + (i.qty - 1) + ')">&minus;</button>' +
        '<span>' + i.qty + '</span><button aria-label="+" onclick="Cart.setQty(\'' + p.id + '\',' + (i.qty + 1) + ')">+</button></div>' +
        '<button class="cart-rm" data-i18n-aria="ui.remove" onclick="Cart.setQty(\'' + p.id + '\',0)">&times;</button></div>';
    }).join("");
    foot.innerHTML = this.breakdown() +
      '<button class="btn" onclick="Cart.checkout()" data-i18n="cart.checkout"></button>' +
      '<button class="cart-continue" onclick="Cart.close()" data-i18n="cart.continue"></button>';
    I18N.apply(document.getElementById("cart-drawer"));
  },
  checkout() {
    const foot = document.getElementById("cart-foot");
    foot.innerHTML =
      '<form id="cart-form" class="cart-form">' +
      '<input id="c-name" type="text" required placeholder="' + I18N.t("form.name") + '">' +
      '<input id="c-email" type="email" required placeholder="' + I18N.t("form.emailShort") + '">' +
      '<input id="c-phone" type="tel" placeholder="' + I18N.t("form.phoneLabel") + '">' +
      '<fieldset class="co-delivery"><legend>' + I18N.t("eta.title") + '</legend>' +
      '<label><input type="radio" name="c-del" value="shipping" checked> <span><strong>' + I18N.t("eta.optShip") + '</strong><br><small>' + Catalog.etaText(this.printMin(), "shipping") + '</small></span></label>' +
      '<label><input type="radio" name="c-del" value="pickup"> <span><strong>' + I18N.t("eta.optPickup") + '</strong><br><small>' + Catalog.etaText(this.printMin(), "pickup") + '</small></span></label>' +
      '<p class="co-note">' + I18N.t("eta.ifToday") + '</p></fieldset>' +
      '<textarea id="c-address" rows="2" required placeholder="' + I18N.t("order.address") + '"></textarea>' +
      '<label class="co-check"><input type="checkbox" id="c-co"> ' + I18N.t("order.invoiceCompany") + '</label>' +
      '<div id="c-co-fields" hidden>' +
      '<input id="c-company" type="text" placeholder="' + I18N.t("order.company") + '">' +
      '<input id="c-nif" type="text" placeholder="' + I18N.t("order.nif") + '">' +
      '<textarea id="c-billing" rows="2" placeholder="' + I18N.t("order.billing") + '"></textarea>' +
      '</div>' +
      '<textarea id="c-note" placeholder="' + I18N.t("order.note") + '"></textarea>' +
      '<input id="c-hp" class="hp-field" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="of-nopay">' + I18N.t("order.nopay") + '</p>' +
      this.breakdown() +
      '<button class="btn" type="submit" id="c-send">' + I18N.t("order.send") + '</button>' +
      '<p class="form-status" id="c-status" hidden></p></form>';
    I18N.apply(foot);
    const self = this, form = document.getElementById("cart-form");
    // Pickup: no delivery address needed.
    form.querySelectorAll('input[name="c-del"]').forEach(r => r.addEventListener("change", () => {
      const ship = form.querySelector('input[name="c-del"]:checked').value === "shipping", a = document.getElementById("c-address");
      a.hidden = !ship; a.required = ship;
    }));
    // Company invoice: show (and require) the company fields only when ticked.
    document.getElementById("c-co").addEventListener("change", e => {
      const on = e.target.checked;
      document.getElementById("c-co-fields").hidden = !on;
      ["c-company", "c-nif", "c-billing"].forEach(id => document.getElementById(id).required = on);
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const g = id => (document.getElementById(id).value || "").trim();
      const btn = document.getElementById("c-send"), status = document.getElementById("c-status");
      const old = btn.textContent; btn.disabled = true; btn.textContent = "…"; status.hidden = true;
      const co = document.getElementById("c-co").checked;
      let r;
      try {
        r = await (await fetch(SITE_CONFIG.adminApi, { method: "POST", redirect: "follow",
          body: JSON.stringify({ action: "placeOrder", lang: I18N.lang, delivery: form.querySelector('input[name="c-del"]:checked').value, name: g("c-name"), email: g("c-email"), phone: g("c-phone"),
            address: g("c-address"), note: g("c-note"), company_hp: g("c-hp"), items: self.items,
            company: co ? g("c-company") : "", nif: co ? g("c-nif") : "", billingAddress: co ? g("c-billing") : "" }) })).json();
      } catch (err) { r = { ok: false }; }
      if (r && r.ok) {
        // Bank transfer: email 1 brings the bank details, email 2 confirms once paid.
        const msg = I18N.t("order.received").replace("{ref}", r.id || "");
        self.write([]);
        document.getElementById("cart-body").innerHTML = "";
        status.textContent = msg; status.className = "form-status ok"; status.hidden = false;
        btn.remove();
      } else {
        status.textContent = I18N.t("order.error") + " " + SITE_CONFIG.email;
        status.className = "form-status err"; status.hidden = false;
        btn.disabled = false; btn.textContent = old;
      }
    });
  }
};
