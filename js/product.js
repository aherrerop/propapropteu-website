/* ============================================================
   PRODUCT DETAIL PAGE — gallery, specs table, buy button,
   related products
   ============================================================ */

const ProductPage = {
  product: null,

  async init() {
    const data = await Catalog.load();
    const id = new URLSearchParams(location.search).get("id");
    this.product = data.products.find(p => p.id === id);

    if (!this.product) {
      document.getElementById("detail").innerHTML =
        `<p>${I18N.t("product.notFound")} <a href="shop.html">${I18N.t("nav.catalog")}</a></p>`;
      return;
    }
    document.addEventListener("langchange", () => this.render());
    this.render();
  },

  render() {
    const p = this.product;
    const badge = Catalog.badge(p.type);
    const stock = Catalog.stock(p);
    const out = p.stock === 0;
    const images = p.images && p.images.length ? p.images : ["assets/img/placeholder.svg"];

    document.title = `${I18N.pick(p.name)} — ${SITE_CONFIG.businessName}`;

    /* SEO: meta description + Product structured data (JSON-LD) */
    const desc = I18N.pick(p.short) || I18N.pick(p.name);
    let md = document.querySelector('meta[name="description"]');
    if (!md) { md = document.createElement("meta"); md.name = "description"; document.head.appendChild(md); }
    md.content = desc;
    const ld = {
      "@context": "https://schema.org", "@type": "Product",
      name: I18N.pick(p.name), description: desc,
      image: images.map(s => new URL(s, location.href).href),
      brand: { "@type": "Brand", name: SITE_CONFIG.businessName },
      offers: { "@type": "Offer", price: p.price, priceCurrency: "EUR",
        availability: out ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        url: location.href }
    };
    let lds = document.getElementById("ld-product");
    if (!lds) { lds = document.createElement("script"); lds.type = "application/ld+json"; lds.id = "ld-product"; document.head.appendChild(lds); }
    lds.textContent = JSON.stringify(ld);

    const thumbs = images.length > 1 ? `
      <div class="gallery-thumbs">
        ${images.map((src, i) =>
          `<img src="${src}" class="${i === 0 ? "active" : ""}" alt="" data-idx="${i}">`).join("")}
      </div>` : "";

    const specs = (p.specs || []).length ? `
      <table class="specs">
        <caption>${I18N.t("product.specs")}</caption>
        ${p.specs.map(s =>
          `<tr><td>${I18N.pick(s.label)}</td><td>${s.value}</td></tr>`).join("")}
      </table>` : "";

    const labels = (Catalog.data.labels || [])
      .filter(l => (p.labels || []).includes(l.id))
      .map(l => `<span class="label-chip">${I18N.pick(l.name)}</span>`).join("");

    document.getElementById("detail").innerHTML = `
      <div class="product-detail">
        <div>
          <div class="gallery-main"><img id="main-img" src="${images[0]}" alt="${I18N.pick(p.name)}"></div>
          ${thumbs}
        </div>
        <div class="detail-info">
          <span class="badge-inline ${badge.cls}">${I18N.t(badge.key)}</span>
          <h1>${I18N.pick(p.name)}</h1>
          <p class="short">${I18N.pick(p.short)}</p>
          <span class="price">${Catalog.formatPrice(p.price)} <span class="iva">${I18N.t("catalog.iva")}</span></span>
          <span class="stock-flag ${stock.cls}">${I18N.t(stock.key)}</span>
          <div class="buy-row">
            <button class="btn" id="add-cart" ${out ? "disabled" : ""}>
              ${I18N.t(out ? "stock.out" : "catalog.addToCartFull")}
            </button>
            <a class="btn btn-outline" href="shop.html">${I18N.t("product.backToCatalog")}</a>
          </div>
          <p class="of-nopay">${I18N.t("order.nopay")}</p>
          <p class="description">${I18N.pick(p.description)}</p>
          ${specs}
          <div class="labels-row">${labels}</div>
        </div>
      </div>`;

    /* thumbnail switching */
    document.querySelectorAll(".gallery-thumbs img").forEach(t => {
      t.addEventListener("click", () => {
        document.getElementById("main-img").src = images[t.dataset.idx];
        document.querySelectorAll(".gallery-thumbs img").forEach(x => x.classList.remove("active"));
        t.classList.add("active");
      });
    });

    /* add to cart (checkout happens in the cart drawer) */
    const addBtn = document.getElementById("add-cart");
    if (addBtn && !out) addBtn.addEventListener("click", () => Cart.add(p.id));

    this.renderRelated();
  },

  renderRelated() {
    const p = this.product;
    const related = Catalog.data.products
      .filter(o => o.id !== p.id && (o.labels || []).some(l => (p.labels || []).includes(l)))
      .slice(0, 4);
    const el = document.getElementById("related");
    if (!related.length) { el.innerHTML = ""; return; }

    el.innerHTML = `
      <h2 class="rule-title">${I18N.t("product.related")}</h2>
      <div class="product-grid">
        ${related.map(r => {
          const badge = Catalog.badge(r.type);
          return `
          <article class="product-card">
            <span class="badge ${badge.cls}">${I18N.t(badge.key)}</span>
            <a class="card-link" href="product.html?id=${r.id}">
              <div class="card-img"><img src="${Catalog.mainImage(r)}" alt="${I18N.pick(r.name)}" loading="lazy"></div>
              <div class="card-body">
                <h3>${I18N.pick(r.name)}</h3>
                <div class="card-price-row">
                  <span class="price">${Catalog.formatPrice(r.price)}</span>
                </div>
              </div>
            </a>
          </article>`;
        }).join("")}
      </div>`;
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await Layout.init();
  await ProductPage.init();
});
