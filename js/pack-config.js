/* ============================================================
   PACK CONFIGURATOR — interface + data model only.
   A pack is bought for its full duration and delivered gradually.
   The customer sets delivery frequency, production duration and a
   payment option, can SEARCH the catalogue to add any product to the
   pack (recurring, in every delivery), and can adapt ONLY the next
   delivery with one-off extra units.

   NOTE: no real checkout is wired up. The state object below is the
   structure a real checkout/subscription integration would consume.
   ============================================================ */

const PackConfig = {
  pack: null,
  state: { freq: "biweekly", months: 3, payment: "upfront", added: [], nextExtras: {} },
  //  added:      [{ id, qty }]   products added via search — recur in every delivery
  //  nextExtras: { [id]: qty }   one-off extra units for the NEXT delivery only

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

    root.addEventListener("click", e => {
      const aq = e.target.closest("[data-addq]");
      if (aq) { this.stepAdded(aq.dataset.pid, aq.dataset.addq === "inc" ? 1 : -1); return; }
      const nq = e.target.closest("[data-nextq]");
      if (nq) { this.stepNext(nq.dataset.pid, nq.dataset.nextq === "inc" ? 1 : -1); return; }
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
      else if (e.target.classList.contains("added-input")) { this.setAdded(e.target.dataset.pid, +e.target.value || 0); }
      else if (e.target.classList.contains("next-input")) { this.setNext(e.target.dataset.pid, +e.target.value || 0); }
    });

    document.addEventListener("langchange", () => this.render());
    this.render();
  },

  /* ---- model ---- */
  product(id) { return Catalog.data.products.find(p => p.id === id); },
  deliveries() { return PackData.shipmentsPerMonth[this.state.freq] * this.state.months; },

  baseItems()  { return this.pack.items.map(it => ({ id: it.id, qty: it.qty })); },
  addedItems() { return this.state.added.filter(a => !this.pack.items.some(it => it.id === a.id)); },
  // everything shipped in a standard delivery
  standardItems() {
    return this.baseItems().map(it => ({ ...it, added: false }))
      .concat(this.addedItems().map(a => ({ id: a.id, qty: a.qty, added: true })));
  },

  addProduct(pid) {
    if (this.pack.items.some(it => it.id === pid)) return;
    if (this.state.added.some(a => a.id === pid)) return;
    this.state.added.push({ id: pid, qty: 1 });
    this.render();
  },
  removeAdded(pid) {
    this.state.added = this.state.added.filter(a => a.id !== pid);
    delete this.state.nextExtras[pid];
    this.render();
  },
  setAdded(pid, q) {
    const a = this.state.added.find(x => x.id === pid);
    if (!a) return;
    q = Math.max(0, q);
    if (q === 0) return this.removeAdded(pid);
    a.qty = q; this.render();
  },
  stepAdded(pid, d) {
    const a = this.state.added.find(x => x.id === pid);
    if (a) this.setAdded(pid, a.qty + d);
  },
  nextExtra(pid) { return this.state.nextExtras[pid] || 0; },
  setNext(pid, q) { this.state.nextExtras[pid] = Math.max(0, q); this.render(); },
  stepNext(pid, d) { this.setNext(pid, this.nextExtra(pid) + d); },

  deliveryDate(i) {
    const d = new Date();
    d.setDate(d.getDate() + PackData.intervalDays[this.state.freq] * i);
    const loc = I18N.lang === "en" ? "en-GB" : (I18N.lang === "es" ? "es-ES" : "ca-ES");
    return d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  },

  baseValue()     { return this.baseItems().reduce((s, it) => s + this.product(it.id).price * it.qty, 0); },
  addedValue()    { return this.addedItems().reduce((s, a) => s + this.product(a.id).price * a.qty, 0); },
  standardValue() { return this.baseValue() + this.addedValue(); },
  nextExtrasValue() {
    return Object.keys(this.state.nextExtras)
      .reduce((s, pid) => s + this.product(pid).price * this.nextExtra(pid), 0);
  },
  grandTotal() { return this.standardValue() * this.deliveries() + this.nextExtrasValue(); },

  /* ---- product search ---- */
  renderSearchResults(query) {
    const box = document.getElementById("pack-search-results");
    if (!box) return;
    const q = query.trim().toLowerCase();
    if (!q) { box.innerHTML = ""; return; }
    const existing = new Set(this.standardItems().map(it => it.id));
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

  /* ---- render ---- */
  render() {
    const p = this.pack;
    const money = v => Catalog.formatPrice(v);
    const opt = (val, cur, label) => `<option value="${val}" ${val == cur ? "selected" : ""}>${label}</option>`;
    const N = this.deliveries();

    const controls = `
      <div class="config-controls">
        <label class="pack-field"><span>${I18N.t("packs.frequencyLabel")}</span>
          <select id="cfg-freq">
            ${opt("weekly", this.state.freq, I18N.t("packs.freq_weekly"))}
            ${opt("biweekly", this.state.freq, I18N.t("packs.freq_biweekly"))}
            ${opt("monthly", this.state.freq, I18N.t("packs.freq_monthly"))}
          </select>
        </label>
        <label class="pack-field"><span>${I18N.t("packs.durationLabel")}</span>
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
          <span><span class="po-title">${I18N.t("packs.payUpfront")}</span><br>
          <span class="po-sub">${I18N.t("packs.payUpfrontSub")}</span></span>
        </label>
        <label class="pay-option ${this.state.payment === "split" ? "selected" : ""}">
          <input type="radio" name="payment" value="split" ${this.state.payment === "split" ? "checked" : ""}>
          <span><span class="po-title">${I18N.t("packs.paySplit")}</span><br>
          <span class="po-sub">${I18N.t("packs.paySplitSub")}</span></span>
        </label>
      </div>`;

    // Search block (before the list)
    const search = `
      <div class="pack-search config-block">
        <label class="pack-field" style="display:block;margin-bottom:10px"><span>${I18N.t("packs.addProduct")}</span></label>
        <input type="search" id="pack-search" autocomplete="off" placeholder="${I18N.t("packs.searchPlaceholder")}">
        <ul class="pack-search-results" id="pack-search-results"></ul>
      </div>`;

    // "Included in every delivery" — the standard delivery contents
    const stdRows = this.standardItems().map(it => {
      const prod = this.product(it.id);
      const qtyCell = it.added
        ? `<span class="di-qty">
             <button type="button" class="qty-btn" data-addq="dec" data-pid="${it.id}" aria-label="−">−</button>
             <input type="number" class="qty-input added-input" min="1" value="${it.qty}" data-pid="${it.id}">
             <button type="button" class="qty-btn" data-addq="inc" data-pid="${it.id}" aria-label="+">+</button>
           </span>`
        : `<span class="si-qty">× ${it.qty}</span>`;
      const tag = it.added
        ? `<span class="di-extra-tag">${I18N.t("packs.added")}</span>
           <button type="button" class="di-remove" data-remove-added data-pid="${it.id}" title="${I18N.t("packs.remove")}">×</button>`
        : `<span class="di-base-tag">${I18N.t("packs.base")}</span>`;
      return `
        <div class="std-item">
          <img class="si-thumb" src="${Catalog.mainImage(prod)}" alt="">
          <span class="si-name">${I18N.pick(prod.name)} ${tag}</span>
          ${qtyCell}
          <span class="si-sub">${money(prod.price * it.qty)}</span>
        </div>`;
    }).join("");

    // "Adapt your next delivery" — one-off extras for delivery 1 only
    const adaptRows = this.standardItems().map(it => {
      const prod = this.product(it.id);
      const extra = this.nextExtra(it.id);
      const lineTotal = prod.price * (it.qty + extra);
      const extraTag = extra > 0 ? `<span class="di-extra-tag">+${extra} ${I18N.t("packs.extra")}</span>` : "";
      const extraSub = extra > 0 ? `<div class="extra">+ ${money(prod.price * extra)} ${I18N.t("packs.extra")}</div>` : "";
      return `
        <div class="d-item">
          <span class="di-name">
            <img src="${Catalog.mainImage(prod)}" alt="" class="pl-thumb">
            ${I18N.pick(prod.name)} <span class="di-base-tag">${it.qty}×</span>${extraTag}
          </span>
          <span class="di-qty">
            <button type="button" class="qty-btn" data-nextq="dec" data-pid="${it.id}" aria-label="−">−</button>
            <input type="number" class="qty-input next-input" min="0" value="${extra}" data-pid="${it.id}">
            <button type="button" class="qty-btn" data-nextq="inc" data-pid="${it.id}" aria-label="+">+</button>
          </span>
          <span class="di-sub">${money(lineTotal)}${extraSub}</span>
        </div>`;
    }).join("");

    // Payment schedule
    let payHtml = "";
    if (this.state.payment === "upfront") {
      payHtml = `<div class="ps-row"><span>${I18N.t("packs.atOrder")}</span><strong>${money(this.grandTotal())}</strong></div>`;
    } else {
      for (let i = 0; i < N; i++) {
        const amt = this.standardValue() + (i === 0 ? this.nextExtrasValue() : 0);
        payHtml += `<div class="ps-row"><span>${this.deliveryDate(i)}</span><strong>${money(amt)}</strong></div>`;
      }
    }

    const addedRow = this.addedItems().length
      ? `<div class="sum-row"><span>${I18N.t("packs.addedLabel")} × ${N}</span><span>${money(this.addedValue() * N)}</span></div>` : "";
    const nextRow = this.nextExtrasValue() > 0
      ? `<div class="sum-row extra"><span>${I18N.t("packs.nextExtrasLabel")}</span><span>${money(this.nextExtrasValue())}</span></div>` : "";

    const summary = `
      <div class="config-summary">
        <h3>${I18N.t("packs.summaryTitle")}</h3>
        <div class="sum-row"><span>${I18N.t("packs.basePack")} × ${N}</span><span>${money(this.baseValue() * N)}</span></div>
        ${addedRow}
        ${nextRow}
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
      <p style="margin-bottom:22px"><a href="packs.html" class="link-more">← ${I18N.t("packs.backToPacks")}</a></p>
      <h1>${I18N.pick(p.name)}</h1>
      <p class="muted" style="max-width:70ch;margin:12px 0 26px">${I18N.pick(p.tagline)}</p>
      <div style="margin-bottom:38px">
        <span class="pack-cat">${I18N.t("packs.cat_" + p.category)}</span>
        <div style="height:16px"></div>
        ${controls}
        <p class="config-note" style="margin-top:14px">${I18N.t("packs.configHelp")}</p>
      </div>
      <div class="config-grid">
        <div>
          ${search}
          <div class="config-block">
            <h2 class="rule-title">${I18N.t("packs.includedTitle")}</h2>
            <div class="std-list">${stdRows}</div>
          </div>
          <div class="config-block">
            <div class="next-head">
              <h2>${I18N.t("packs.nextTitle")}</h2>
              <span class="d-date">${I18N.t("packs.delivery")} 1 · ${this.deliveryDate(0)}</span>
            </div>
            <p class="config-note">${I18N.t("packs.nextNote")}</p>
            ${adaptRows}
          </div>
        </div>
        ${summary}
      </div>`;
  },

  proceed() { alert(I18N.t("packs.checkoutSoon")); },

  emailRequest() {
    const p = this.pack;
    const std = this.standardItems()
      .map(it => `${it.qty} × ${I18N.pick(this.product(it.id).name)}${it.added ? " (" + I18N.t("packs.added") + ")" : ""}`);
    const next = this.standardItems()
      .filter(it => this.nextExtra(it.id) > 0)
      .map(it => `+${this.nextExtra(it.id)} ${I18N.pick(this.product(it.id).name)}`);
    const body = [
      I18N.t("packs.mailIntro"), "",
      `${I18N.pick(p.name)}`,
      `${I18N.t("packs.frequencyLabel")}: ${I18N.t("packs.freq_" + this.state.freq)}`,
      `${I18N.t("packs.durationLabel")}: ${this.state.months} ${I18N.t("packs.monthsShort")}`,
      `${I18N.t("packs.paymentSchedule")}: ${this.state.payment === "upfront" ? I18N.t("packs.payUpfront") : I18N.t("packs.paySplit")}`,
      "",
      `${I18N.t("packs.includedTitle")}:`, ...std.map(l => "- " + l),
      ...(next.length ? ["", `${I18N.t("packs.nextTitle")}:`, ...next.map(l => "- " + l)] : []),
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
