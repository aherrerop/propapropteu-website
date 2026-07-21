/* ============================================================
   PRODUCTION PACKS — landing grid.
   Renders ~8 packs from data/packs.json. Selecting a pack opens
   its configuration page (pack-config.html?id=...).
   ============================================================ */

const PacksPage = {
  async init() {
    if (!document.getElementById("pack-grid")) return; // not on the packs grid page
    await PackData.load();
    await Catalog.load();
    this.render();
    document.addEventListener("langchange", () => this.render());
  },

  render() {
    const grid = document.getElementById("pack-grid");
    grid.innerHTML = PackData.data.packs.map(pk => {
      const itemCount = pk.items.reduce((s, i) => s + i.qty, 0);
      const durTxt  = `${pk.defaultDurationMonths} ${I18N.t("packs.monthsShort")}`;
      const freqTxt = I18N.t("packs.freq_" + pk.defaultFrequency);
      return `
      <a class="pack-card" href="pack-config.html?id=${pk.id}">
        <div class="media-box">
          <img src="assets/img/placeholder-landscape.svg" alt="" loading="lazy" data-final="${pk.image}">
          <span class="media-tag">${pk.image}</span>
        </div>
        <div class="pack-card-body">
          <span class="pack-cat">${I18N.t("packs.cat_" + pk.category)}</span>
          <h3>${I18N.pick(pk.name)}</h3>
          <p class="pack-tag">${I18N.pick(pk.tagline)}</p>
          <div class="pack-meta">
            <span class="pack-chip">${durTxt}</span>
            <span class="pack-chip">${freqTxt}</span>
            <span class="pack-chip">${itemCount} ${I18N.t("packs.itemsShort")}</span>
          </div>
          <span class="btn" style="pointer-events:none;width:100%">${I18N.t("packs.configureBtn")}</span>
        </div>
      </a>`;
    }).join("");
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await Layout.init();
  await PacksPage.init();
});
