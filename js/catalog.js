/* ============================================================
   CATALOG PAGE — label filters, search, sort, product grid
   ============================================================ */

const CatalogPage = {
  activeLabels: new Set(),
  activeTypes: new Set(),
  query: "",
  sort: "featured",

  async init() {
    const data = await Catalog.load();
    this.renderFilters(data);
    document.getElementById("search-box").addEventListener("input", e => {
      this.query = e.target.value.toLowerCase().trim();
      this.renderGrid();
    });
    document.getElementById("sort-select").addEventListener("change", e => {
      this.sort = e.target.value;
      this.renderGrid();
    });
    document.addEventListener("langchange", () => {
      this.renderFilters(data);
      this.renderGrid();
    });
    this.renderGrid();
  },

  renderFilters(data) {
    const counts = {};
    data.products.forEach(p => p.labels.forEach(l => counts[l] = (counts[l] || 0) + 1));
    const typeCounts = {};
    data.products.forEach(p => typeCounts[p.type] = (typeCounts[p.type] || 0) + 1);

    const labelHtml = data.labels
      .filter(l => counts[l.id])
      .map(l => `
        <label class="filter-item">
          <input type="checkbox" value="${l.id}" data-kind="label"
                 ${this.activeLabels.has(l.id) ? "checked" : ""}>
          <span>${I18N.pick(l.name)}</span>
          <span class="count">${counts[l.id]}</span>
        </label>`).join("");

    const typeHtml = ["own", "std", "tool"]
      .filter(t => typeCounts[t])
      .map(t => `
        <label class="filter-item">
          <input type="checkbox" value="${t}" data-kind="type"
                 ${this.activeTypes.has(t) ? "checked" : ""}>
          <span>${I18N.t("badge." + t)}</span>
          <span class="count">${typeCounts[t]}</span>
        </label>`).join("");

    document.getElementById("filters").innerHTML = `
      <h3>${I18N.t("catalog.filters")}</h3>
      <div class="filter-group">
        <div class="group-title">${I18N.t("catalog.byLabel")}</div>
        ${labelHtml}
      </div>
      <div class="filter-group">
        <div class="group-title">${I18N.t("catalog.byType")}</div>
        ${typeHtml}
      </div>
      <button class="clear-filters">${I18N.t("catalog.clear")}</button>`;

    document.querySelectorAll("#filters input").forEach(cb => {
      cb.addEventListener("change", () => {
        const set = cb.dataset.kind === "label" ? this.activeLabels : this.activeTypes;
        cb.checked ? set.add(cb.value) : set.delete(cb.value);
        this.renderGrid();
      });
    });
    document.querySelector(".clear-filters").addEventListener("click", () => {
      this.activeLabels.clear();
      this.activeTypes.clear();
      document.querySelectorAll("#filters input").forEach(cb => cb.checked = false);
      this.renderGrid();
    });
  },

  filtered() {
    let items = Catalog.data.products.slice();
    if (this.activeLabels.size)
      items = items.filter(p => p.labels.some(l => this.activeLabels.has(l)));
    if (this.activeTypes.size)
      items = items.filter(p => this.activeTypes.has(p.type));
    if (this.query)
      items = items.filter(p =>
        (I18N.pick(p.name) + " " + I18N.pick(p.short)).toLowerCase().includes(this.query));

    switch (this.sort) {
      case "price-asc":  items.sort((a, b) => a.price - b.price); break;
      case "price-desc": items.sort((a, b) => b.price - a.price); break;
      case "name":       items.sort((a, b) => I18N.pick(a.name).localeCompare(I18N.pick(b.name))); break;
      default:           items.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }
    return items;
  },

  renderGrid() {
    const items = this.filtered();
    document.getElementById("result-count").textContent =
      `${items.length} ${I18N.t("catalog.results")}`;

    document.getElementById("product-grid").innerHTML = items.map(p => {
      const badge = Catalog.badge(p.type);
      const stock = Catalog.stock(p);
      const out = p.stock === 0;
      return `
      <article class="product-card">
        <span class="badge ${badge.cls}">${I18N.t(badge.key)}</span>
        <a class="card-link" href="product.html?id=${p.id}">
          <div class="card-img"><img src="${Catalog.mainImage(p)}" alt="${I18N.pick(p.name)}" loading="lazy"></div>
          <div class="card-body">
            <h3>${I18N.pick(p.name)}</h3>
            <p class="short">${I18N.pick(p.short)}</p>
            <span class="stock-flag ${stock.cls}">${I18N.t(stock.key)}</span>
            <div class="card-price-row">
              <span class="price">${Catalog.formatPrice(p.price)} <span class="iva">${I18N.t("catalog.iva")}</span></span>
            </div>
          </div>
        </a>
        <div style="padding:0 14px 14px">
          <button class="card-add snipcart-add-item" style="width:100%"
            ${out ? "disabled" : Catalog.snipcartAttrs(p)}>
            ${I18N.t(out ? "stock.out" : "catalog.addToCart")}
          </button>
        </div>
      </article>`;
    }).join("") || `<p class="muted">${I18N.t("catalog.empty")}</p>`;
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await Layout.init();
  await CatalogPage.init();
});
