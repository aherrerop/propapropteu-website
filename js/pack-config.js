/* ============================================================
   PACK CONFIGURATOR — interface + data model only.
   A pack is bought for its full duration and delivered gradually.
   The customer sets delivery frequency, production duration and a
   payment option (full upfront, or split per delivery), can add
   EXTRA units to any upcoming delivery on top of the base pack, and
   can SEARCH the whole catalogue to add any other product to the pack.

   NOTE: no real checkout/payment is wired up. The "Proceed" button is
   a placeholder; the state object below is the structure a real
   checkout/subscription integration would consume later.
   ============================================================ */

const PackConfig = {
  pack: null,
  state: { freq: "biweekly", months: 3, payment: "upfront", extras: {}, added: [] },
  //  extras: { [deliveryIndex]: { [productId]: extraQty } }
  //  added:  [productId, ...]  products the customer searched + added

  async init() {
    await PackData.load();
    await Catalog.load();
    const id = new URLSearchParams(location.search).get("id");
    this.pack = PackData.get(id);

    const root = document.getElementById("config");
    if (!this.pack) {
      root.innerHTML = `<p>${I18N.t("packs.notFound")} <a href="packs.html">${I18N.t("packs.title")}</a></p>`;
      return;
    }
    this.state.freq = this.pack.defaultFrequency;
    this.state.months = this.pack.defaultDurationMonths;

    // Delegated listeners on the stable #config node (survive innerHTML swaps).
    root.addEventListener("click", e => {
      const step = e.target.closest("[data-act]");
      if (step) {
        const i = +step.dataset.i, pid = step.dataset.pid;
        this.setExtra(i, pid, this.extraQty(i, pid) + (step.dataset.act === "inc" ? 1 : -1));
        return;
      }
      const add = e.target.closest("[data-add]");
      if (add) { this.addProduct(add.dataset.pid); return; }
      const rm = e.target.closest("[data-remove-added]");
      if (rm) { this.removeAdded(rm.dataset.pid); return; }
      if (e.target.closest("#cfg-proceed")) { e.preventDefault(); this.proceed(); return; }
      if (e.target.closest("#cfg-email"))   { e.preventDefault(); this.emailRequest(); return; }
    });
    root.addEventListener("input", e => {
      if (e.target.id === "pack-search") this.renderSearchResults(e.target.value);
    });
    root.addEventListener("change", e => {
      if (e.target.id === "cfg-freq") { this.state.freq = e.target.value; this.render(); }
      else if (e.target.id === "cfg-dur") { this.state.months = +e.target.value; this.render(); }
      else if (e.target.name === "payment") { this.state.payment = e.target.value; this.render(); }
      else if (e.target.classList.contains("extra-input")) {
        this.setExtra(+e.target.dataset.i, e.target.dataset.pid, +e.target.value || 0);
      }
    });

    document.addEventListener("langchange", () => this.render());
    this.render();
  },

  /* ---- data model helpers ---- */
  product(id) { return Catalog.data.products.find(p => p.id === id); },
  deliveries() { return PackData.shipmentsPerMonth[this.state.freq] * this.state.months; },

  // Every line item shown per delivery: base pack items (fixed base qty)
  // plus searched-in products (base 0, quantity comes from "extra").
  allItems() {
    const base = this.pack.items.map(it => ({ id: it.id, base: it.qty, added: false }));
    const added = this.state.added
      .filter(id => !this.pack.items.some(it => it.id === id))
      .map(id => ({ id, base: 0, added: true }));
    return base.concat(added);
  },

  extraQty(i, pid) { return (this.state.extras[i] && this.state.extras[i][pid]) || 0; },
  setExtra(i, pid, q) {
    if (!this.state.extras[i]) this.state.extras[i] = {};
    this.state.extras[i][pid] = Math.max(0, q);
    this.render();
  },

  addProduct(pid) {
    if (this.allItems().some(it => it.id === pid)) return;   // already in pack
    this.state.added.push(pid);
    for (let i = 0; i < this.deliveries(); i++) {            // default 1 per delivery
      if (!this.state.extras[i]) this.state.extras[i] = {};
      this.state.extras[i][pid] = 1;
    }
    this.render();
  },
  removeAdded(pid) {
    this.state.added = this.state.added.filter(x => x !== pid);
    for (const i in this.state.extras) delete this.state.extras[i][pid];
    this.render();
  },

  deliveryDate(i) {
    const d = new Date();
    d.setDate(d.getDate() + PackData.intervalDays[this.state.freq] * i);
    const loc = I18N.lang === "en" ? "en-GB" : (I18N.lang === "es" ? "es-ES" : "ca-ES");
    return d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  },

  basePerDelivery() {
    return this.pack.items.reduce((s, it) => s + this.product(it.id).price * it.qty, 0);
  },
  extrasInDelivery(i) {
    return this.allItems().reduce((s, it) => s + this.product(it.id).price * this.extraQty(i, it.id), 0);
  },
  deliveryTotal(i) { return this.basePerDelivery() + this.extrasInDelivery(i); },
  baseTotal() { return this.basePerDelivery() * this.deliveries(); },
  extrasTotal() {
    let t = 0;
    for (let i = 0; i < this.deliveries(); i++) t += this.extrasInDelivery(i);
    return t;
  },
  grandTotal() { return this.baseTotal() + this.extrasTotal(); },

  /* ---- product search (add any product) ---- */
  renderSearchResults(query) {
    const box = document.getElementById("pack-search-results");
    if (!box) return;
    const q = query.trim().toLowerCase();
    if (!q) { box.innerHTML = ""; return; }
    const existing = new Set(this.allItems().map(it => it.id));
    const matches = Catalog.data.products.filter(p =>
      !existing.has(p.id) &&
      (I18N.pick(p.name) + " " + I18N.pick(p.short)).toLowerCase().includes(q)
    ).slice(0, 6);
    box.innerHTML = matches.map(p => `
      <li data-add data-pid="${p.id}">
        <img src="${Catalog.mainImage(p)}" alt="">
        <span class="psr-name">${I18N.pick(p.name)}</span>
        <span class="psr-price">${Catalog.formatPrice(p.price)}</span>
      </li>`).join("")
      || `<li class="muted" style="cursor:default">${I18N.t("catalog.empty")}</li>`;
  },

  /* ---- rendering ---- */
  render() {
    const p = this.pack;
    const money = v => Catalog.formatPrice(v);
    const opt = (val, cur, label) => `<option value="${val}" ${val == cur ? "selected" : ""}>${label}</option>`;

    const addedChips = this.state.added.length ? `
      <div class="pack-meta" style="margin-top:12px">
        ${this.state.added.map(id => `
          <span class="pack-chip">${I18N.pick(this.product(id).name)}
            <button type="button" class="di-remove" data-remove-added data-pid="${id}" title="${I18N.t("packs.remove")}">×</button>
          </span>`).join("")}
      </div>` : "";

    const controls = `
      <div class="config-controls">
        <label class="pack-field">
          <span>${I18N.t("packs.frequencyLabel")}</span>
          <select id="cfg-freq">
            ${opt("weekly", this.state.freq, I18N.t("packs.freq_weekly"))}
            ${opt("biweekly", this.state.freq, I18N.t("packs.freq_biweekly"))}
            ${opt("monthly", this.state.freq, I18N.t("packs.freq_monthly"))}
          </select>
        </label>
        <label class="pack-field">
          <span>${I18N.t("packs.durationLabel")}</span>
          <select id="cfg-dur">
            ${opt(1, this.state.months, I18N.t("packs.dur1"))}
            ${opt(3, this.state.months, I18N.t("packs.dur3"))}
            ${opt(6, this.state.months, I18N.t("packs.dur6"))}
            ${opt(9, this.state.months, I18N.t("packs.dur9"))}
          </select>
        </label>
      </div>

      <div class="pay-options">
        <label class="pay-option ${this.state.payment === "upfront" ? "selected" : ""}">
          <input type="radio" name="payment" value="upfront" ${this.state.payment === "upfront" ? "checked" : ""}>
          <span>
            <span class="po-title">${I18N.t("packs.payUpfront")}</span><br>
            <span class="po-sub">${I18N.t("packs.payUpfrontSub")}</span>
          </span>
        </label>
        <label class="pay-option ${this.state.payment === "split" ? "selected" : ""}">
          <input type="radio" name="payment" value="split" ${this.state.payment === "split" ? "checked" : ""}>
          <span>
            <span class="po-title">${I18N.t("packs.paySplit")}</span><br>
            <span class="po-sub">${I18N.t("packs.paySplitSub")}</span>
          </span>
        </label>
      </div>

      <div class="pack-search">
        <label class="pack-field" style="display:block;margin-bottom:8px"><span>${I18N.t("packs.addProduct")}</span></label>
        <input type="search" id="pack-search" autocomplete="off" placeholder="${I18N.t("packs.searchPlaceholder")}">
        <ul class="pack-search-results" id="pack-search-results"></ul>
        ${addedChips}
      </div>`;

    // Delivery schedule
    let deliveriesHtml = "";
    for (let i = 0; i < this.deliveries(); i++) {
      const rows = this.allItems().map(item => {
        const prod = this.product(item.id);
        const extra = this.extraQty(i, item.id);
        const lineTotal = prod.price * (item.base + extra);
        const baseTag = item.base > 0 ? `<span class="di-base-tag">${item.base} ${I18N.t("packs.base")}</span>` : "";
        const addedTag = item.added ? `<span class="di-extra-tag">${I18N.t("packs.added")}</span>` :
          (extra > 0 ? `<span class="di-extra-tag">+${extra} ${I18N.t("packs.extra")}</span>` : "");
        const extraSub = (item.base > 0 && extra > 0)
          ? `<div class="extra">+ ${money(prod.price * extra)} ${I18N.t("packs.extra")}</div>` : "";
        return `
          <div class="d-item">
            <span class="di-name">
              <img src="${Catalog.mainImage(prod)}" alt="" class="pl-thumb">
              ${I18N.pick(prod.name)}${baseTag}${addedTag}
            </span>
            <span class="di-qty">
              <button type="button" class="qty-btn" data-act="dec" data-i="${i}" data-pid="${item.id}" aria-label="−">−</button>
              <input type="number" class="qty-input extra-input" min="0" value="${extra}" data-i="${i}" data-pid="${item.id}"
                     title="${I18N.t("packs.extraUnits")}">
              <button type="button" class="qty-btn" data-act="inc" data-i="${i}" data-pid="${item.id}" aria-label="+">+</button>
            </span>
            <span class="di-sub">${money(lineTotal)}${extraSub}</span>
          </div>`;
      }).join("");

      deliveriesHtml += `
        <div class="delivery">
          <div class="delivery-head">
            <h3>${I18N.t("packs.delivery")} ${i + 1} <span class="muted">/ ${this.deliveries()}</span></h3>
            <span class="d-date">${this.deliveryDate(i)}</span>
          </div>
          <div class="delivery-body">${rows}</div>
        </div>`;
    }

    // Payment schedule
    let payHtml = "";
    if (this.state.payment === "upfront") {
      payHtml = `<div class="ps-row"><span>${I18N.t("packs.atOrder")}</span><strong>${money(this.grandTotal())}</strong></div>`;
    } else {
      for (let i = 0; i < this.deliveries(); i++) {
        payHtml += `<div class="ps-row"><span>${this.deliveryDate(i)}</span><strong>${money(this.deliveryTotal(i))}</strong></div>`;
      }
    }

    const summary = `
      <div class="config-summary">
        <h3>${I18N.t("packs.summaryTitle")}</h3>
        <div class="sum-row"><span>${I18N.t("packs.basePack")} × ${this.deliveries()}</span><span>${money(this.baseTotal())}</span></div>
        <div class="sum-row extra"><span>${I18N.t("packs.extrasLabel")}</span><span>${money(this.extrasTotal())}</span></div>
        <div class="sum-row total"><span>${I18N.t("packs.estTotal")}</span><strong>${money(this.grandTotal())}</strong></div>

        <div class="pay-schedule">
          <div class="sum-row" style="padding-bottom:2px"><strong>${I18N.t("packs.paymentSchedule")}</strong></div>
          ${payHtml}
        </div>

        <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
          <button class="btn" id="cfg-proceed" style="width:100%">${I18N.t("packs.proceedBtn")}</button>
          <button class="btn btn-outline" id="cfg-email" style="width:100%">${I18N.t("packs.requestBtn")}</button>
          <span class="muted" style="font-size:0.78rem">${I18N.t("packs.checkoutSoon")}</span>
        </div>
      </div>`;

    document.getElementById("config").innerHTML = `
      <p style="margin-bottom:20px"><a href="packs.html" class="link-more">← ${I18N.t("packs.backToPacks")}</a></p>
      <h1>${I18N.pick(p.name)}</h1>
      <p class="muted" style="max-width:70ch;margin:10px 0 30px">${I18N.pick(p.tagline)}</p>
      <div class="content-block" style="border-bottom:none;padding-bottom:0;margin-bottom:34px">
        <span class="pack-cat">${I18N.t("packs.cat_" + p.category)}</span>
        <div style="height:14px"></div>
        ${controls}
        <p class="muted" style="font-size:0.85rem;margin-top:14px">${I18N.t("packs.configHelp")}</p>
      </div>
      <div class="config-grid">
        <div>
          <h2 class="rule-title">${I18N.t("packs.scheduleTitle")}</h2>
          ${deliveriesHtml}
        </div>
        ${summary}
      </div>`;
  },

  proceed() {
    alert(I18N.t("packs.checkoutSoon"));
  },

  emailRequest() {
    const p = this.pack;
    const lines = [];
    for (let i = 0; i < this.deliveries(); i++) {
      const extras = this.allItems().filter(it => this.extraQty(i, it.id) > 0)
        .map(it => `+${this.extraQty(i, it.id)} ${I18N.pick(this.product(it.id).name)}`);
      const extraTxt = extras.length ? ` (${I18N.t("packs.extra")}: ${extras.join(", ")})` : "";
      lines.push(`${I18N.t("packs.delivery")} ${i + 1} — ${this.deliveryDate(i)}: ${Catalog.formatPrice(this.deliveryTotal(i))}${extraTxt}`);
    }
    const body = [
      I18N.t("packs.mailIntro"),
      "",
      `${I18N.pick(p.name)}`,
      `${I18N.t("packs.frequencyLabel")}: ${I18N.t("packs.freq_" + this.state.freq)}`,
      `${I18N.t("packs.durationLabel")}: ${this.state.months} ${I18N.t("packs.monthsShort")}`,
      `${I18N.t("packs.paymentSchedule")}: ${this.state.payment === "upfront" ? I18N.t("packs.payUpfront") : I18N.t("packs.paySplit")}`,
      "",
      ...lines,
      "",
      `${I18N.t("packs.estTotal")} ${Catalog.formatPrice(this.grandTotal())}`
    ].join("\n");
    window.location.href =
      `mailto:${SITE_CONFIG.email}?subject=${encodeURIComponent(I18N.t("packs.mailSubject"))}&body=${encodeURIComponent(body)}`;
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await Layout.init();
  await PackConfig.init();
});
