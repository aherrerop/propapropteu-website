/* ============================================================
   TIENDA (shop) — featured carousel + sort tabs + product grid
   ============================================================ */

const ShopPage = {
  sort: "featured",
  fi: 0,
  label: "all",

  async init() {
    await Catalog.load();
    this.featured = Catalog.data.products.filter(p => p.featured).sort((a, b) => (a.heroOrder || 99) - (b.heroOrder || 99));
    if (!this.featured.length) this.featured = Catalog.data.products.slice(0, 3);
    this.renderFeatured();
    this.renderFilters();
    this.renderGrid();

    // Phones: sorting and tags sit behind one button.
    const tg = document.getElementById("shop-toggle");
    if (tg) tg.addEventListener("click", () => { const open = document.getElementById("shop-controls").classList.toggle("open"); tg.setAttribute("aria-expanded", open ? "true" : "false"); });
    document.getElementById("shop-sort").addEventListener("click", e => {
      const b = e.target.closest("button[data-sort]"); if (!b) return;
      this.sort = b.dataset.sort;
      document.querySelectorAll("#shop-sort button").forEach(x => x.classList.toggle("active", x === b));
      this.renderGrid();
    });
    document.getElementById("shop-filters").addEventListener("click", e => {
      const b = e.target.closest("button[data-label]"); if (!b) return;
      this.label = b.dataset.label;
      document.querySelectorAll("#shop-filters button").forEach(x => x.classList.toggle("active", x === b));
      this.renderGrid();
    });
    document.getElementById("sf-dots").addEventListener("click", e => {
      const b = e.target.closest("button[data-i]"); if (!b) return;
      this.fi = +b.dataset.i; this.renderFeatured();
    });
    // hide arrows + dots when there's only one featured product
    const single = this.featured.length <= 1;
    ["sf-prev", "sf-next"].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = single; });
    document.addEventListener("langchange", () => { this.renderFeatured(); this.renderFilters(); this.renderGrid(); });
  },

  esc(s) { return String(s).replace(/"/g, "&quot;"); },

  fnext() { this.fi = (this.fi + 1) % this.featured.length; this.renderFeatured(); },
  fprev() { this.fi = (this.fi - 1 + this.featured.length) % this.featured.length; this.renderFeatured(); },

  renderFeatured() {
    const p = this.featured[this.fi];
    document.getElementById("sf-cat").textContent = I18N.pick(p.name);
    document.getElementById("sf-desc").textContent = I18N.pick(p.heroDesc) || I18N.pick(p.short);
    document.getElementById("sf-wm").textContent = p.codename || (I18N.pick(p.name).split(" ")[0] || "").toUpperCase();
    const img = document.getElementById("sf-img");
    img.src = Catalog.heroImage(p); img.alt = I18N.pick(p.name); img.hidden = false;
    const add = document.getElementById("sf-add");
    add.classList.remove("snipcart-add-item");
    add.onclick = () => Cart.add(p.id);
    document.getElementById("sf-dots").innerHTML = this.featured.map((_, i) =>
      `<button data-i="${i}" class="${i === this.fi ? "active" : ""}" aria-label="${i + 1}"></button>`).join("");
  },

  renderFilters() {
    const wrap = document.getElementById("shop-filters");
    if (!wrap) return;
    // Only the tags that at least one product has; no filter row when none are in use.
    const used = new Set(); Catalog.data.products.forEach(p => (p.labels || []).forEach(l => used.add(l)));
    const labels = (Catalog.data.labels || []).filter(l => used.has(l.id));
    if (!labels.length) { wrap.innerHTML = ""; return; }
    const all = `<button data-label="all" class="${this.label === "all" ? "active" : ""}" data-i18n="catalog.allCats"></button>`;
    wrap.innerHTML = all + labels.map(l =>
      `<button data-label="${l.id}" class="${this.label === l.id ? "active" : ""}">${I18N.pick(l.name)}</button>`).join("");
    I18N.apply(wrap);
  },

  sortItems() {
    let items = Catalog.data.products.slice();
    if (this.label !== "all") items = items.filter(p => (p.labels || []).includes(this.label));
    switch (this.sort) {
      case "az": items.sort((a, b) => I18N.pick(a.name).localeCompare(I18N.pick(b.name))); break;
      case "za": items.sort((a, b) => I18N.pick(b.name).localeCompare(I18N.pick(a.name))); break;
      default:   items.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));  // featured first
    }
    return items;
  },

  renderGrid() {
    const items = this.sortItems();
    const empty = document.getElementById("shop-empty");
    if (empty) empty.hidden = items.length > 0;
    document.getElementById("shop-grid").innerHTML = items.map(p => {
      const out = p.stock === 0;
      return `
      <div class="shop-card${out ? " sold-out" : ""}">
        <a class="sc-link" href="${Catalog.url(p)}">
          <div class="sc-img ${Catalog.isCutout(p) ? "cut" : "photo"}">
            <span class="sc-corner" aria-hidden="true"></span>
            ${out ? `<span class="sc-soldout" data-i18n="stock.out"></span>` : ""}
            <img src="${Catalog.mainImage(p)}" alt="${this.esc(I18N.pick(p.name))}" loading="lazy">
          </div>
          <div class="sc-name">${I18N.pick(p.name)}</div>
          <div class="sc-price">${Catalog.formatPrice(p.price)}</div>
        </a>
      </div>`;
    }).join("");
    const grid = document.getElementById("shop-grid");
    I18N.apply(grid);
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await Layout.init();
  await ShopPage.init();
});
