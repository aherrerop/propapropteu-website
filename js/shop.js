/* ============================================================
   TIENDA (shop) — featured carousel + sort tabs + product grid
   ============================================================ */

const ShopPage = {
  sort: "featured",
  fi: 0,

  async init() {
    await Catalog.load();
    this.featured = Catalog.data.products.filter(p => p.featured);
    if (!this.featured.length) this.featured = Catalog.data.products.slice(0, 3);
    this.renderFeatured();
    this.renderGrid();

    document.getElementById("shop-sort").addEventListener("click", e => {
      const b = e.target.closest("button[data-sort]"); if (!b) return;
      this.sort = b.dataset.sort;
      document.querySelectorAll("#shop-sort button").forEach(x => x.classList.toggle("active", x === b));
      this.renderGrid();
    });
    document.getElementById("sf-dots").addEventListener("click", e => {
      const b = e.target.closest("button[data-i]"); if (!b) return;
      this.fi = +b.dataset.i; this.renderFeatured();
    });
    document.addEventListener("langchange", () => { this.renderFeatured(); this.renderGrid(); });
  },

  esc(s) { return String(s).replace(/"/g, "&quot;"); },

  renderFeatured() {
    const p = this.featured[this.fi];
    document.getElementById("sf-cat").textContent = I18N.pick(p.name);
    document.getElementById("sf-desc").textContent = I18N.pick(p.heroDesc) || I18N.pick(p.short);
    document.getElementById("sf-wm").textContent = p.codename || (I18N.pick(p.name).split(" ")[0] || "").toUpperCase();
    const img = document.getElementById("sf-img");
    img.src = Catalog.mainImage(p); img.alt = I18N.pick(p.name);
    const add = document.getElementById("sf-add");
    add.dataset.itemId = p.id;
    add.dataset.itemPrice = p.price;
    add.dataset.itemUrl = "product.html?id=" + p.id;
    add.dataset.itemName = I18N.pick(p.name);
    add.dataset.itemImage = Catalog.mainImage(p);
    document.getElementById("sf-dots").innerHTML = this.featured.map((_, i) =>
      `<button data-i="${i}" class="${i === this.fi ? "active" : ""}" aria-label="${i + 1}"></button>`).join("");
  },

  sortItems() {
    const items = Catalog.data.products.slice();
    switch (this.sort) {
      case "az": items.sort((a, b) => I18N.pick(a.name).localeCompare(I18N.pick(b.name))); break;
      case "za": items.sort((a, b) => I18N.pick(b.name).localeCompare(I18N.pick(a.name))); break;
      default:   items.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));  // relevancia / best sellers
    }
    return items;
  },

  renderGrid() {
    document.getElementById("shop-grid").innerHTML = this.sortItems().map(p => `
      <a class="shop-card" href="product.html?id=${p.id}">
        <div class="sc-img">
          <span class="corner tl"></span><span class="corner br"></span>
          <img src="${Catalog.mainImage(p)}" alt="${this.esc(I18N.pick(p.name))}" loading="lazy">
        </div>
        <div class="sc-name">${I18N.pick(p.name)}</div>
        <div class="sc-price">${Catalog.formatPrice(p.price)}</div>
      </a>`).join("");
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await Layout.init();
  await ShopPage.init();
});
