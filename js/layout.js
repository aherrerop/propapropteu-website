/* ============================================================
   LAYOUT — shared header, footer, cookie banner, WhatsApp
   button and Snipcart loader. Edit the nav or footer ONCE here
   and every page updates.
   ============================================================ */

const Layout = {

  navItems: [
    { href: "./",                key: "nav.home" },     // clean root URL, no /index.html
    { href: "shop.html",         key: "nav.catalog" },
    { href: "custom-props.html", key: "nav.custom" },
    { href: "packs.html",        key: "nav.packs" },
    { href: "about.html",        key: "nav.about" },
    { href: "faq.html",          key: "nav.faq" },
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

  renderHeader() {
    const cur = this.currentPage();
    const isHome = c => c === "index.html" || c === "";
    const nav = this.navItems.map(i => {
      const active = (i.href === "./" ? isHome(cur) : cur === i.href) ? "active" : "";
      return `<a href="${i.href}" class="${active}" data-i18n="${i.key}"></a>`;
    }).join("");
    const langs = SITE_CONFIG.languages.map(l =>
      `<button data-lang="${l}" onclick="I18N.set('${l}')">${l.toUpperCase()}</button>`
    ).join("");

    // Centered brand block (icon + wordmark) on top, nav + tools row below.
    document.getElementById("site-header").innerHTML = `
      <div class="container header-inner">
        <button class="nav-toggle" aria-label="Menu" aria-expanded="false" onclick="Layout.toggleNav()">
          <span></span><span></span><span></span>
        </button>
        <a href="./" class="logo-link" aria-label="${SITE_CONFIG.businessName}">
          <img class="logo-mark" src="${SITE_CONFIG.logo}" alt="">
          <span class="logo-type">${SITE_CONFIG.businessName}</span>
        </a>
        <div class="header-bar">
          <nav class="main-nav" onclick="Layout.closeNav()">${nav}</nav>
          <div class="header-tools">
            <div class="lang-switch">${langs}</div>
            <button class="cart-btn snipcart-checkout" title="Cart">
              <span data-i18n="nav.cart"></span>
              <span class="cart-count snipcart-items-count">0</span>
            </button>
          </div>
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
            <a href="custom-props.html" data-i18n="nav.custom"></a>
            <a href="packs.html" data-i18n="nav.packs"></a>
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
          <span>${SITE_CONFIG.email} · ${SITE_CONFIG.phoneDisplay}</span>
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
              onclick="localStorage.setItem('ppt-cookies-ok','1');this.parentElement.remove()"
              data-i18n="cookies.accept"></button>`;
    document.body.appendChild(div);
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

  async init() {
    await I18N.init();
    this.renderHeader();
    this.renderFooter();
    this.renderWhatsApp();
    this.renderCookieBanner();
    this.loadSnipcart();
    I18N.apply();
  }
};

/* ---------- shared catalog helpers ---------- */

const Catalog = {
  data: null,

  async load() {
    if (this.data) return this.data;
    const res = await fetch("data/products.json");
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

  mainImage(p) {
    return (p.images && p.images[0]) || "assets/img/placeholder.svg";
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
