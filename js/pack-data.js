/* ============================================================
   PACK DATA — shared loader for data/packs.json.
   Used by the packs grid (packs.js) and the pack configurator
   (pack-config.js). Pack contents there are EXAMPLE/DRAFT data.
   ============================================================ */

const PackData = {
  data: null,

  async load() {
    if (this.data) return this.data;
    const res = await fetch("data/packs.json");
    this.data = await res.json();
    return this.data;
  },

  get(id) {
    return this.data ? this.data.packs.find(p => p.id === id) : null;
  },

  // shipments per month + calendar interval per frequency (shared pricing/schedule model)
  shipmentsPerMonth: { weekly: 4, biweekly: 2, monthly: 1 },
  intervalDays:      { weekly: 7, biweekly: 14, monthly: 30 }
};
