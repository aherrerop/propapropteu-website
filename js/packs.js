/* ============================================================
   PRODUCING PACKS — recurring pack configurator for production
   sourcing teams. Studios pick products + quantities, a delivery
   frequency and a duration; we estimate the per-shipment and
   total cost and hand the request off by email.

   NOTE: real accounts + recurring billing are NOT handled here.
   Storing customers' banking data in this static site would be
   unsafe and non-compliant. The "Request pack" button composes an
   email; the recurring charge must be set up through a PCI-compliant
   processor (Snipcart subscriptions / Stripe) once contact is made.
   ============================================================ */

const PacksPage = {
  qty: {},   // { productId: quantity }

  // shipments per month for each frequency (rough estimate for pricing)
  shipmentsPerMonth: { weekly: 4, biweekly: 2, monthly: 1 },

  async init() {
    await Catalog.load();
    this.renderList();
    document.getElementById("pack-frequency").addEventListener("change", () => this.updateTotals());
    document.getElementById("pack-duration").addEventListener("change", () => this.updateTotals());
    document.getElementById("pack-request").addEventListener("click", () => this.requestPack());
    document.addEventListener("langchange", () => this.renderList());
  },

  renderList() {
    const list = document.getElementById("pack-list");
    list.innerHTML = Catalog.data.products.map(p => {
      const badge = Catalog.badge(p.type);
      const q = this.qty[p.id] || 0;
      return `
      <div class="pack-row" data-id="${p.id}">
        <span class="pl-name">
          <img src="${Catalog.mainImage(p)}" alt="" class="pl-thumb">
          ${I18N.pick(p.name)}
        </span>
        <span class="pl-type"><span class="badge-inline ${badge.cls}">${I18N.t(badge.key)}</span></span>
        <span class="pl-price">${Catalog.formatPrice(p.price)}</span>
        <span class="pl-qty">
          <button type="button" class="qty-btn" data-act="dec" aria-label="−">−</button>
          <input type="number" class="qty-input" min="0" value="${q}" data-id="${p.id}">
          <button type="button" class="qty-btn" data-act="inc" aria-label="+">+</button>
        </span>
        <span class="pl-sub" data-sub="${p.id}">${Catalog.formatPrice(p.price * q)}</span>
      </div>`;
    }).join("");

    list.querySelectorAll(".pack-row").forEach(row => {
      const id = row.dataset.id;
      const input = row.querySelector(".qty-input");
      row.querySelector('[data-act="dec"]').addEventListener("click", () => {
        input.value = Math.max(0, (parseInt(input.value, 10) || 0) - 1);
        this.setQty(id, input.value);
      });
      row.querySelector('[data-act="inc"]').addEventListener("click", () => {
        input.value = (parseInt(input.value, 10) || 0) + 1;
        this.setQty(id, input.value);
      });
      input.addEventListener("input", () => this.setQty(id, input.value));
    });

    this.updateTotals();
  },

  setQty(id, val) {
    this.qty[id] = Math.max(0, parseInt(val, 10) || 0);
    const p = Catalog.data.products.find(x => x.id === id);
    const sub = document.querySelector(`[data-sub="${id}"]`);
    if (sub) sub.textContent = Catalog.formatPrice(p.price * this.qty[id]);
    this.updateTotals();
  },

  shipmentTotal() {
    return Catalog.data.products.reduce(
      (sum, p) => sum + p.price * (this.qty[p.id] || 0), 0);
  },

  totalShipments() {
    const freq = document.getElementById("pack-frequency").value;
    const months = parseInt(document.getElementById("pack-duration").value, 10) || 1;
    return (this.shipmentsPerMonth[freq] || 1) * months;
  },

  updateTotals() {
    const perShipment = this.shipmentTotal();
    document.getElementById("pack-shipment-total").textContent = Catalog.formatPrice(perShipment);
    document.getElementById("pack-grand-total").textContent =
      Catalog.formatPrice(perShipment * this.totalShipments());
  },

  requestPack() {
    const chosen = Catalog.data.products.filter(p => (this.qty[p.id] || 0) > 0);
    if (!chosen.length) { alert(I18N.t("packs.emptyAlert")); return; }

    const freqSel = document.getElementById("pack-frequency");
    const durSel = document.getElementById("pack-duration");
    const freqLabel = freqSel.options[freqSel.selectedIndex].textContent.trim();
    const durLabel = durSel.options[durSel.selectedIndex].textContent.trim();

    const lines = chosen.map(p =>
      `- ${this.qty[p.id]} x ${I18N.pick(p.name)} (${Catalog.formatPrice(p.price)})`);

    const body = [
      I18N.t("packs.mailIntro"),
      "",
      `${I18N.t("packs.frequencyLabel")}: ${freqLabel}`,
      `${I18N.t("packs.durationLabel")}: ${durLabel}`,
      "",
      I18N.t("packs.colProduct") + ":",
      ...lines,
      "",
      `${I18N.t("packs.perShipment")} ${Catalog.formatPrice(this.shipmentTotal())}`,
      `${I18N.t("packs.estTotal")} ${Catalog.formatPrice(this.shipmentTotal() * this.totalShipments())}`
    ].join("\n");

    const subject = I18N.t("packs.mailSubject");
    window.location.href =
      `mailto:${SITE_CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await Layout.init();
  await PacksPage.init();
});
