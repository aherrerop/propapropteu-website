/* ============================================================
   Manager dashboard. Reuses the site's theme + buttons.
   Flow: edit products -> saved to the Google Sheet -> "Publicar"
   commits data/products.json to the repo (live in ~1-2 min).
   ============================================================ */

const LANGS = ["ca", "es", "en"];
const LANG_LABEL = { ca: "Català", es: "Español", en: "English" };
const TYPE_LABEL = { own: "Disseny propi", std: "Producte estàndard", tool: "Eina" };
const DIRTY_KEY = "ppt-admin-dirty";

const State = { products: [], labels: [], images: [], editingOriginalId: null, query: "" };

/* ---------- tiny DOM helper ---------- */
function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") n.className = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] === true) n.setAttribute(k, "");
    else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  (children || []).forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}
const $ = id => document.getElementById(id);

/* ---------- toast + dirty flag ---------- */
let toastTimer;
function toast(msg, kind) {
  const t = $("admin-toast");
  t.textContent = msg;
  t.className = "admin-toast" + (kind ? " " + kind : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}
function setDirty(v) {
  try { v ? sessionStorage.setItem(DIRTY_KEY, "1") : sessionStorage.removeItem(DIRTY_KEY); } catch (e) {}
  $("admin-dirty").hidden = !v;
}
function isDirty() { try { return !!sessionStorage.getItem(DIRTY_KEY); } catch (e) { return false; } }

/* ============================ INIT ============================ */
document.addEventListener("DOMContentLoaded", async () => {
  if (!(await Admin.requireLogin())) return;
  $("admin-who").textContent = "Hola, " + (Admin.user?.name || Admin.user?.email || "");
  // (UI in Catalan — manager-facing)
  $("btn-logout").addEventListener("click", () => { Admin.clear(); location.href = "acceso.html"; });
  $("btn-new").addEventListener("click", () => openEditor(null));
  $("btn-publish").addEventListener("click", publish);
  document.querySelectorAll("#admin-nav button").forEach(b =>
    b.addEventListener("click", () => switchView(b.dataset.view)));
  const ps = $("prod-search");
  if (ps) ps.addEventListener("input", () => { State.query = ps.value.trim(); renderList(); });
  setDirty(isDirty());

  await loadLabels();
  await loadProducts();
});

async function loadLabels() {
  try {
    const r = await fetch("data/products.json", { cache: "no-cache" });
    const d = await r.json();
    State.labels = d.labels || [];
  } catch (e) { State.labels = []; }
}

async function loadProducts() {
  const r = await Admin.call("listProducts");
  if (!r.ok) { toast(r.message || "Error en carregar els productes.", "err"); return; }
  State.products = r.data || [];
  renderList();
}

/* ============================ LIST ============================ */
function pick(obj) { return obj ? (obj.es || obj.ca || obj.en || "") : ""; }

function renderList() {
  const wrap = $("product-list");
  wrap.innerHTML = "";
  const q = (State.query || "").toLowerCase();
  const list = q ? State.products.filter(p => (p.id + " " + pick(p.name)).toLowerCase().includes(q)) : State.products;
  $("list-empty").hidden = State.products.length > 0;

  list.forEach(p => {
    const img = (p.images && p.images[0]) || "";
    const hidden = p.active === false;
    const stock = (p.stock === undefined || p.stock === null || p.stock === "")
      ? '<span class="stk stk-inf">∞</span>'
      : (Number(p.stock) <= 0 ? '<span class="stk stk-0">Esgotat</span>' : '<span class="stk">' + p.stock + ' u.</span>');
    const card = el("div", { class: "adm-card" + (hidden ? " adm-hidden" : "") }, [
      el("div", { class: "adm-card-img", html: img ? '<img src="' + img + '" alt="">' : '<span>sense foto</span>' }),
      el("div", { class: "adm-card-main" }, [
        el("div", { class: "adm-card-name", html: (hidden ? "🚫 " : "") + (p.featured ? "★ " : "") + (pick(p.name) || p.id) }),
        el("div", { class: "adm-card-meta", html:
          (hidden ? "<strong>Ocult</strong> · " : "") +
          (TYPE_LABEL[p.type] || p.type || "") + " · " +
          "<strong>" + Number(p.price || 0).toFixed(2) + " €</strong> · " + stock +
          ' · <span class="adm-id">' + p.id + "</span>" })
      ]),
      el("div", { class: "adm-card-actions" }, [
        el("button", { class: "btn-outline", onclick: () => openEditor(p.id) }, ["Editar"]),
        el("button", { class: "btn-text", onclick: () => duplicateProduct(p.id) }, ["Duplicar"]),
        el("button", { class: "btn-text danger", onclick: () => removeProduct(p.id) }, ["Esborrar"])
      ])
    ]);
    wrap.appendChild(card);
  });
}

function duplicateProduct(id) {
  const src = State.products.find(p => p.id === id);
  if (!src) return;
  const clone = JSON.parse(JSON.stringify(src));
  clone.id = "";
  if (clone.name) Object.keys(clone.name).forEach(k => clone.name[k] = (clone.name[k] || "") + " (còpia)");
  clone.featured = false;
  State.editingOriginalId = null;
  State.images = (clone.images || []).slice();
  const v = $("view-editor");
  v.innerHTML = "";
  v.appendChild(buildEditor(clone, false));
  $("view-list").hidden = true; v.hidden = false; window.scrollTo(0, 0);
}

/* ============================ EDITOR ============================ */
function blankProduct() {
  return { id: "", type: "own", price: 0, stock: "", featured: false, codename: "",
    labels: [], images: [], name: {}, short: {}, description: {}, heroTagline: {}, heroDesc: {}, specs: [] };
}

function openEditor(id) {
  const existing = id ? State.products.find(p => p.id === id) : null;
  const p = existing ? JSON.parse(JSON.stringify(existing)) : blankProduct();
  State.images = (p.images || []).slice();
  State.editingOriginalId = existing ? p.id : null;

  const v = $("view-editor");
  v.innerHTML = "";
  v.appendChild(buildEditor(p, !!existing));
  $("view-list").hidden = true;
  v.hidden = false;
  window.scrollTo(0, 0);
}

function closeEditor() {
  $("view-editor").hidden = true;
  $("view-editor").innerHTML = "";
  $("view-list").hidden = false;
}

function langField(labelText, keyPrefix, values, textarea) {
  // One labelled control per language, with a CA/ES/EN switch above.
  const inputs = LANGS.map(lng => {
    const tag = textarea ? "textarea" : "input";
    const node = el(tag, { id: "f-" + keyPrefix + "-" + lng, class: "lng lng-" + lng, "data-lng": lng });
    if (!textarea) node.type = "text";
    node.value = (values && values[lng]) || "";
    if (lng !== "es") node.style.display = "none";
    return node;
  });
  const sw = el("div", { class: "lng-switch" },
    LANGS.map(lng => el("button", { type: "button", class: "lng-btn" + (lng === "es" ? " active" : ""), onclick: (e) => {
      const box = e.target.closest(".adm-field");
      box.querySelectorAll(".lng-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      box.querySelectorAll(".lng").forEach(i => i.style.display = i.dataset.lng === lng ? "" : "none");
    } }, [LANG_LABEL[lng].slice(0, 3)]))
  );
  return el("div", { class: "adm-field" }, [el("label", {}, [labelText]), sw].concat(inputs));
}

function buildEditor(p, isExisting) {
  const form = el("form", { class: "adm-editor", onsubmit: (e) => { e.preventDefault(); saveEditor(); } });

  form.appendChild(el("div", { class: "adm-editor-head" }, [
    el("h1", {}, [isExisting ? "Editar producte" : "Nou producte"]),
    el("div", {}, [
      el("button", { type: "button", class: "btn-text", onclick: closeEditor }, ["Cancel·lar"]),
      el("button", { type: "submit", class: "btn" }, ["Desar"])
    ])
  ]));

  /* --- basics row --- */
  const idInput = el("input", { id: "f-id", type: "text", value: p.id, placeholder: "ex. penja-quadres-pro",
    pattern: "[a-z0-9\\-]+", required: true });
  if (isExisting) { idInput.readOnly = true; idInput.classList.add("readonly"); }
  const typeSel = el("select", { id: "f-type" }, Object.keys(TYPE_LABEL).map(k =>
    el("option", { value: k, selected: p.type === k }, [TYPE_LABEL[k]])));

  form.appendChild(el("div", { class: "adm-grid-4" }, [
    el("div", { class: "adm-field" }, [el("label", {}, ["ID (identificador únic)"]), idInput]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Tipus"]), typeSel]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Preu (€, IVA inclòs)"]),
      el("input", { id: "f-price", type: "number", step: "0.01", min: "0", value: p.price })]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Estoc (buit = ∞)"]),
      el("input", { id: "f-stock", type: "number", step: "1", min: "0", value: (p.stock ?? "") })])
  ]));

  /* --- featured + codename --- */
  const featChk = el("input", { id: "f-featured", type: "checkbox" });
  featChk.checked = !!p.featured;
  const heroBox = el("div", { id: "hero-box", class: "adm-hero" });
  featChk.addEventListener("change", () => { heroBox.hidden = !featChk.checked; });

  form.appendChild(el("div", { class: "adm-grid-2" }, [
    el("label", { class: "adm-check" }, [featChk, el("span", {}, ["Destacat (surt primer i a la portada)"])]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Nom clau portada (ex. ATLAS)"]),
      el("input", { id: "f-codename", type: "text", value: p.codename || "" })])
  ]));

  /* --- texts --- */
  form.appendChild(langField("Nom", "name", p.name));
  form.appendChild(langField("Resum curt", "short", p.short, true));
  form.appendChild(langField("Descripció", "description", p.description, true));

  /* --- hero (featured only) --- */
  heroBox.appendChild(el("h3", {}, ["Portada (només destacats)"]));
  heroBox.appendChild(langField("Titular portada", "heroTagline", p.heroTagline));
  heroBox.appendChild(langField("Text portada", "heroDesc", p.heroDesc, true));
  heroBox.hidden = !p.featured;
  form.appendChild(heroBox);

  /* --- image display mode --- */
  const cutChk = el("input", { id: "f-cutout", type: "checkbox" });
  cutChk.checked = !!p.cutout;
  form.appendChild(el("label", { class: "adm-check" }, [cutChk,
    el("span", {}, ["Imatge sense fons (es mostra sencera dins el marc; desmarca-ho si la foto ja té fons)"])]));

  const actChk = el("input", { id: "f-active", type: "checkbox" });
  actChk.checked = p.active !== false;
  form.appendChild(el("label", { class: "adm-check" }, [actChk,
    el("span", {}, ["Visible a la botiga (desmarca per ocultar-lo del web sense esborrar-lo)"])]));

  /* --- cost + bill of materials (internal, never shown on the web) --- */
  form.appendChild(buildCostBom(p));

  /* --- labels --- */
  const labelBox = el("div", { class: "adm-labels" }, State.labels.map(l => {
    const cb = el("input", { type: "checkbox", value: l.id, class: "f-label" });
    cb.checked = (p.labels || []).indexOf(l.id) >= 0;
    return el("label", { class: "adm-chip" }, [cb, el("span", {}, [pick(l.name) || l.id])]);
  }));
  form.appendChild(el("div", { class: "adm-field" }, [el("label", {}, ["Categories"]), labelBox]));

  /* --- images --- */
  form.appendChild(buildImages());

  /* --- specs --- */
  form.appendChild(buildSpecs(p.specs || []));

  /* --- footer actions + delete --- */
  const foot = el("div", { class: "adm-editor-foot" }, [
    el("button", { type: "submit", class: "btn" }, ["Desar"]),
    el("button", { type: "button", class: "btn-text", onclick: closeEditor }, ["Cancel·lar"])
  ]);
  if (isExisting) foot.appendChild(el("button", { type: "button", class: "btn-text danger",
    onclick: () => removeProduct(p.id, true) }, ["Esborrar producte"]));
  form.appendChild(foot);

  return form;
}

/* ---------- images sub-panel ---------- */
function buildImages() {
  const strip = el("div", { class: "adm-imgs", id: "img-strip" });
  const file = el("input", { type: "file", accept: "image/*", id: "img-file", style: "display:none" });
  file.addEventListener("change", onPickImage);
  const addBtn = el("button", { type: "button", class: "btn-outline", onclick: () => file.click() }, ["+ Pujar imatge"]);
  const field = el("div", { class: "adm-field" }, [el("label", {}, ["Imatges"]), strip, addBtn, file]);
  renderImages(strip);
  return field;
}
function renderImages(strip) {
  strip = strip || $("img-strip");
  if (!strip) return;
  strip.innerHTML = "";
  State.images.forEach((url, i) => {
    strip.appendChild(el("div", { class: "adm-img" }, [
      el("img", { src: url, alt: "" }),
      el("button", { type: "button", class: "adm-img-x", title: "Treure",
        onclick: () => { State.images.splice(i, 1); renderImages(); } }, ["×"])
    ]));
  });
}
async function onPickImage(e) {
  const f = e.target.files[0];
  if (!f) return;
  toast("Pujant la imatge…");
  const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
  const resp = await Admin.call("uploadImage", { filename: f.name, mimeType: f.type, dataBase64: dataUrl });
  e.target.value = "";
  if (!resp.ok) { toast(resp.message || "No s'ha pogut pujar la imatge.", "err"); return; }
  State.images.push(resp.url);
  renderImages();
  toast("Imatge afegida.", "ok");
}

/* ---------- specs sub-panel ---------- */
function buildSpecs(specs) {
  const rows = el("div", { class: "adm-specs", id: "spec-rows" });
  (specs.length ? specs : []).forEach(s => rows.appendChild(specRow(s)));
  const add = el("button", { type: "button", class: "btn-outline",
    onclick: () => rows.appendChild(specRow({})) }, ["+ Fila de fitxa tècnica"]);
  return el("div", { class: "adm-field" }, [el("label", {}, ["Fitxa tècnica (opcional)"]), rows, add]);
}
function specRow(s) {
  const lab = s.label || {};
  const row = el("div", { class: "adm-spec-row" }, [
    el("input", { type: "text", class: "sp-ca", placeholder: "Etiqueta CA", value: lab.ca || "" }),
    el("input", { type: "text", class: "sp-es", placeholder: "Etiqueta ES", value: lab.es || "" }),
    el("input", { type: "text", class: "sp-en", placeholder: "Etiqueta EN", value: lab.en || "" }),
    el("input", { type: "text", class: "sp-val", placeholder: "Valor", value: s.value || "" }),
    el("button", { type: "button", class: "adm-img-x", title: "Treure",
      onclick: (e) => e.target.closest(".adm-spec-row").remove() }, ["×"])
  ]);
  return row;
}

/* ============================ COLLECT + SAVE ============================ */
function readLang(prefix) {
  const o = {};
  LANGS.forEach(lng => { const v = ($("f-" + prefix + "-" + lng).value || "").trim(); if (v) o[lng] = v; });
  return o;
}
function collect() {
  const p = {};
  p.id = $("f-id").value.trim();
  p.type = $("f-type").value;
  p.price = parseFloat($("f-price").value || "0");
  const stock = $("f-stock").value.trim();
  p.stock = stock === "" ? "" : Number(stock);
  p.featured = $("f-featured").checked;
  p.cutout = $("f-cutout").checked;
  p.active = $("f-active").checked;
  const cst = $("f-cost").value.trim();
  p.cost = cst === "" ? "" : Number(cst);
  p.bom = Array.from(document.querySelectorAll(".adm-bom-row")).map(r => ({
    material: r.querySelector(".bom-mat").value.trim(),
    color: r.querySelector(".bom-col").value.trim(),
    grams: Number(r.querySelector(".bom-g").value || 0)
  })).filter(b => b.material && b.grams > 0);
  const code = $("f-codename").value.trim();
  if (code) p.codename = code;

  p.name = readLang("name");
  p.short = readLang("short");
  p.description = readLang("description");
  if (p.featured) {
    const ht = readLang("heroTagline"); if (Object.keys(ht).length) p.heroTagline = ht;
    const hd = readLang("heroDesc"); if (Object.keys(hd).length) p.heroDesc = hd;
  }

  p.labels = Array.from(document.querySelectorAll(".f-label:checked")).map(c => c.value);
  p.images = State.images.slice();

  p.specs = Array.from(document.querySelectorAll(".adm-spec-row")).map(r => {
    const label = {
      ca: r.querySelector(".sp-ca").value.trim(),
      es: r.querySelector(".sp-es").value.trim(),
      en: r.querySelector(".sp-en").value.trim()
    };
    const value = r.querySelector(".sp-val").value.trim();
    Object.keys(label).forEach(k => { if (!label[k]) delete label[k]; });
    return { label, value };
  }).filter(s => s.value || Object.keys(s.label).length);

  return p;
}

async function saveEditor() {
  const p = collect();
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) { toast("L'ID només pot tenir minúscules, números i guions.", "err"); return; }
  if (!Object.keys(p.name).length) { toast("Posa com a mínim un nom (en un idioma).", "err"); return; }
  if (!State.editingOriginalId && State.products.some(x => x.id === p.id)) {
    toast("Ja existeix un producte amb aquest ID.", "err"); return;
  }
  toast("Desant…");
  const r = await Admin.call("saveProduct", { product: p });
  if (!r.ok) { toast(r.message || "No s'ha pogut desar.", "err"); return; }
  setDirty(true);
  await loadProducts();
  closeEditor();
  toast("Desat. Recorda Publicar perquè surti al web.", "ok");
}

async function removeProduct(id, fromEditor) {
  if (!confirm("Segur que vols esborrar aquest producte? No es pot desfer.")) return;
  toast("Esborrant…");
  const r = await Admin.call("deleteProduct", { id });
  if (!r.ok) { toast(r.message || "No s'ha pogut esborrar.", "err"); return; }
  setDirty(true);
  await loadProducts();
  if (fromEditor) closeEditor();
  toast("Producte esborrat. Recorda Publicar.", "ok");
}

async function publish() {
  const btn = $("btn-publish");
  btn.disabled = true; const prev = btn.textContent; btn.textContent = "Publicant…";
  const r = await Admin.call("publish");
  btn.disabled = false; btn.textContent = prev;
  if (!r.ok) { toast(r.message || "No s'ha pogut publicar.", "err"); return; }
  setDirty(false);
  toast(r.message || "Publicat.", "ok");
}

/* ============================ VIEW SWITCHER ============================ */
function switchView(v) {
  document.querySelectorAll("#admin-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $("view-editor").hidden = true; $("view-editor").innerHTML = "";
  $("view-list").hidden = v !== "list";
  $("view-orders").hidden = v !== "orders";
  $("view-materials").hidden = v !== "materials";
  $("view-messages").hidden = v !== "messages";
  $("view-jobs").hidden = v !== "jobs";
  $("view-finance").hidden = v !== "finance";
  if (v === "orders") renderOrders();
  if (v === "materials") renderMaterials();
  if (v === "messages") renderMessages();
  if (v === "jobs") renderJobs();
  if (v === "finance") renderFinance();
}

function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fmtDate(s) { const d = new Date(s); return isNaN(d) ? String(s).slice(0, 16) : d.toLocaleString("ca-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
function tile(label, val) { return '<div class="adm-tile"><span class="t-label">' + label + '</span><span class="t-val">' + val + "</span></div>"; }

/* ---------- cost + bill of materials (product editor) ---------- */
function buildCostBom(p) {
  const cost = el("input", { id: "f-cost", type: "number", step: "0.01", min: "0", value: (p.cost ?? "") });
  const rows = el("div", { class: "adm-specs", id: "bom-rows" });
  (p.bom || []).forEach(b => rows.appendChild(bomRow(b)));
  const add = el("button", { type: "button", class: "btn-outline",
    onclick: () => rows.appendChild(bomRow({})) }, ["+ Material"]);
  return el("div", { class: "adm-costbom" }, [
    el("h3", {}, ["Cost i materials (intern — no surt al web)"]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Cost de producció (€) — per calcular el benefici"]), cost]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Materials per unitat (es descompten de l'estoc a cada comanda)"]), rows, add])
  ]);
}
function bomRow(b) {
  return el("div", { class: "adm-bom-row" }, [
    el("input", { type: "text", class: "bom-mat", placeholder: "Material (PLA, PETG…)", value: b.material || "" }),
    el("input", { type: "text", class: "bom-col", placeholder: "Color", value: b.color || "" }),
    el("input", { type: "number", class: "bom-g", step: "1", min: "0", placeholder: "grams", value: b.grams || "" }),
    el("button", { type: "button", class: "adm-img-x", title: "Treure", onclick: e => e.target.closest(".adm-bom-row").remove() }, ["×"])
  ]);
}

/* ============================ ORDERS ============================ */
async function renderOrders() {
  const v = $("view-orders");
  v.innerHTML = '<div class="admin-head"><h1>Comandes</h1></div><div id="orders-summary" class="adm-summary"></div><div id="orders-list" class="admin-list"></div>';
  const s = await Admin.call("summary");
  if (s.ok) {
    const t = s.data.totals;
    let html = tile("Comandes", t.orders) + tile("Ingressos", t.revenue.toFixed(2) + " €") +
      tile("Cost", t.cost.toFixed(2) + " €") + tile("Benefici", t.profit.toFixed(2) + " €");
    $("orders-summary").innerHTML = html;
    if (s.data.lowMaterials && s.data.lowMaterials.length)
      $("orders-summary").insertAdjacentHTML("beforeend",
        '<div class="adm-low">Material sota mínim: ' + s.data.lowMaterials.map(m => escapeHtml(m.material + " " + m.color) + " (" + m.stock + "g)").join(", ") + "</div>");
  }
  const r = await Admin.call("listOrders");
  const list = $("orders-list");
  if (!r.ok) { toast(r.message || "Error en carregar comandes.", "err"); return; }
  if (!r.data.length) { list.innerHTML = '<p class="admin-empty">Encara no hi ha comandes.</p>'; return; }
  list.innerHTML = "";
  r.data.forEach(o => list.appendChild(orderCard(o)));
}
const ORDER_STATES = ["nou", "pendent pagament", "pagat", "en preparació", "a punt", "entregat", "cancel·lat"];
function orderCard(o) {
  const items = o.items.map(i => i.qty + "× " + escapeHtml(i.name)).join(", ");
  const payLabel = o.payment === "transfer" ? "transferència" : (o.payment === "card" ? "targeta" : o.payment);
  const sel = el("select", { class: "ord-status" },
    ORDER_STATES.map(st => el("option", { value: st, selected: o.status === st }, [st])));
  sel.addEventListener("change", async () => {
    const r = await Admin.call("setOrderStatus", { id: o.id, status: sel.value });
    toast(r.ok ? "Estat actualitzat." : (r.message || "Error."), r.ok ? "ok" : "err");
  });
  return el("div", { class: "adm-card adm-order status-" + o.status.replace(/\s|·/g, "-") }, [
    el("div", { class: "adm-card-main" }, [
      el("div", { class: "adm-card-name", html: escapeHtml(o.id) + " · " + escapeHtml(o.name) }),
      el("div", { class: "adm-card-meta", html: fmtDate(o.date) + " · " + escapeHtml(o.email) + (o.phone ? " · " + escapeHtml(o.phone) : "") }),
      el("div", { class: "adm-card-meta", html: items }),
      el("div", { class: "adm-card-meta", html: "<strong>" + o.revenue.toFixed(2) + " €</strong> · benefici " + o.profit.toFixed(2) + " €" + (payLabel ? " · " + escapeHtml(payLabel) : "") + (o.note ? " · " + escapeHtml(o.note) : "") })
    ]),
    el("div", { class: "adm-card-actions" }, [sel,
      el("button", { class: "btn-text", onclick: async (e) => {
        const b = e.target, old = b.textContent; b.disabled = true; b.textContent = "…";
        const r = await Admin.call("getInvoice", { id: o.id });
        b.disabled = false; b.textContent = old;
        if (r.ok) window.open(r.url, "_blank", "noopener"); else toast(r.message || "Error.", "err");
      } }, ["Factura"]),
      el("button", { class: "btn-text danger", onclick: async () => {
        if (!confirm("Esborrar la comanda " + o.id + "? (no es restaura l'estoc de materials)")) return;
        const r = await Admin.call("deleteOrder", { id: o.id });
        toast(r.ok ? "Comanda esborrada." : (r.message || "Error."), r.ok ? "ok" : "err"); renderOrders();
      } }, ["Esborrar"])])
  ]);
}

/* ============================ MATERIALS ============================ */
async function renderMaterials() {
  const v = $("view-materials");
  v.innerHTML = '<div class="admin-head"><h1>Materials</h1><button class="btn" id="mat-new">+ Material</button></div><div id="mat-list" class="admin-list"></div>';
  $("mat-new").addEventListener("click", openMaterial);
  const r = await Admin.call("listMaterials");
  if (!r.ok) { toast(r.message || "Error en carregar materials.", "err"); return; }
  const list = $("mat-list");
  if (!r.data.length) { list.innerHTML = '<p class="admin-empty">Encara no hi ha materials. Afegeix-ne un.</p>'; return; }
  list.innerHTML = "";
  r.data.forEach(m => list.appendChild(matCard(m)));
}
function matCard(m) {
  const stock = el("input", { type: "number", step: "1", value: m.stock, class: "m-stock" });
  const cpg = el("input", { type: "number", step: "0.001", value: m.costPerGram, class: "m-cpg" });
  const low = el("input", { type: "number", step: "1", value: m.lowAt, class: "m-low" });
  const field = (lab, inp) => el("label", { class: "adm-mat-f" }, [el("span", {}, [lab]), inp]);
  return el("div", { class: "adm-card adm-mat" + (m.stock <= m.lowAt ? " low" : "") }, [
    el("div", { class: "adm-mat-name" }, [m.material + " · " + (m.color || "—")]),
    field("Estoc (g)", stock), field("€/g", cpg), field("Mínim (g)", low),
    el("div", { class: "adm-card-actions" }, [
      el("button", { class: "btn-outline", onclick: async () => {
        const r = await Admin.call("saveMaterial", { material: { material: m.material, color: m.color, stock: +stock.value, costPerGram: +cpg.value, lowAt: +low.value } });
        toast(r.ok ? "Desat." : (r.message || "Error."), r.ok ? "ok" : "err"); renderMaterials();
      } }, ["Desar"]),
      el("button", { class: "btn-text danger", onclick: async () => {
        if (!confirm("Esborrar " + m.material + " " + m.color + "?")) return;
        const r = await Admin.call("deleteMaterial", { id: m.id });
        toast(r.ok ? "Esborrat." : (r.message || "Error."), r.ok ? "ok" : "err"); renderMaterials();
      } }, ["Esborrar"])
    ])
  ]);
}
async function openMaterial() {
  const name = prompt("Material (ex. PLA, PETG, ABS):"); if (!name) return;
  const color = prompt("Color (ex. negre):") || "";
  const r = await Admin.call("saveMaterial", { material: { material: name.trim(), color: color.trim(), stock: 0, costPerGram: 0, lowAt: 0 } });
  toast(r.ok ? "Material afegit." : (r.message || "Error."), r.ok ? "ok" : "err");
  renderMaterials();
}

/* ============================ MESSAGES ============================ */
async function renderMessages() {
  const v = $("view-messages");
  v.innerHTML = '<div class="admin-head"><h1>Missatges</h1></div><div id="msg-list" class="admin-list"></div>';
  const r = await Admin.call("listMessages");
  if (!r.ok) { toast(r.message || "Error en carregar missatges.", "err"); return; }
  const list = $("msg-list");
  if (!r.data.length) { list.innerHTML = '<p class="admin-empty">Cap missatge.</p>'; return; }
  list.innerHTML = "";
  r.data.forEach(m => list.appendChild(msgCard(m)));
}
function msgCard(m) {
  return el("div", { class: "adm-card adm-msg" }, [
    el("div", { class: "adm-card-main" }, [
      el("div", { class: "adm-card-name", html: escapeHtml(m.name) + (m.source ? ' · <span class="adm-id">' + escapeHtml(m.source) + "</span>" : "") }),
      el("div", { class: "adm-card-meta", html: fmtDate(m.date) + " · " + escapeHtml(m.email) + (m.phone ? " · " + escapeHtml(m.phone) : "") + (m.company ? " · " + escapeHtml(m.company) : "") }),
      el("div", { class: "adm-card-meta", html: escapeHtml(m.message) })
    ]),
    el("div", { class: "adm-card-actions" }, [
      el("a", { class: "btn-outline", href: "mailto:" + m.email }, ["Respondre"]),
      el("button", { class: "btn-text danger", onclick: async () => {
        if (!confirm("Esborrar aquest missatge?")) return;
        const r = await Admin.call("deleteMessage", { row: m.row });
        toast(r.ok ? "Esborrat." : (r.message || "Error."), r.ok ? "ok" : "err"); renderMessages();
      } }, ["Esborrar"])
    ])
  ]);
}

/* ============================ PRINT QUEUE (Jobs) ============================ */
let FILAMENTS = [];
async function loadFilaments() { const r = await Admin.call("listMaterials"); FILAMENTS = r.ok ? r.data.filter(f => f.active !== false) : []; }
// The four to-do buckets; personal is split by owner.
const JOB_CATS = [["product", "Productes"], ["research", "Recerca"], ["personal-yerai", "Personal Yerai"], ["personal-albert", "Personal Albert"]];
function jobBucket(j) { return j.category === "personal" ? "personal-" + (j.owner || "yerai") : j.category; }
function filamentOptions(sel) {
  return FILAMENTS.map(f => {
    const val = f.material + "|" + f.color;
    return el("option", { value: val, selected: sel === val }, [f.material + " " + (f.color || "") + " (" + f.stock + " g)"]);
  });
}

async function renderJobs() {
  const v = $("view-jobs");
  v.innerHTML = '<div class="admin-head"><h1>Cua d\'impressió</h1><button class="btn" id="job-new">+ Nova feina</button></div>' +
    '<div id="job-form-wrap"></div><div id="batch-wrap" class="adm-batch"></div><div id="job-cols" class="job-cols"></div>';
  $("job-new").addEventListener("click", () => openJobForm());
  await loadFilaments();
  renderBatchPlanner();
  const r = await Admin.call("listJobs", { filter: {} });
  const jobs = (r.ok ? r.data : []).filter(j => j.status !== "done");
  const cols = $("job-cols"); cols.innerHTML = "";
  JOB_CATS.forEach(([key, label]) => {
    const list = jobs.filter(j => jobBucket(j) === key);
    const col = el("div", { class: "job-col" }, [el("h3", {}, [label + " (" + list.length + ")"])]);
    if (!list.length) col.appendChild(el("p", { class: "admin-empty" }, ["—"]));
    list.forEach(j => col.appendChild(jobCard(j)));
    cols.appendChild(col);
  });
}

function jobCard(j) {
  const whatHtml = j.link ? '<a href="' + escapeHtml(j.link) + '" target="_blank" rel="noopener">enllaç</a>' : escapeHtml(j.notes || j.productId || "");
  return el("div", { class: "adm-card job-card st-" + j.status }, [
    el("div", { class: "adm-card-main" }, [
      el("div", { class: "adm-card-name", html: escapeHtml(j.material) + " · " + (j.anyColor ? "qualsevol color" : escapeHtml(j.color)) + " · " + j.gramsEst + " g" }),
      el("div", { class: "adm-card-meta", html: whatHtml + (j.units > 1 ? " · x" + j.units : "") + (j.orderRef ? ' · <span class="adm-id">' + escapeHtml(j.orderRef) + "</span>" : "") + " · " + escapeHtml(j.status) })
    ]),
    el("div", { class: "adm-card-actions" }, [
      el("button", { class: "btn-outline", onclick: async () => { const s = j.status === "pending" ? "imprimint" : "done"; const r = await Admin.call("setJobStatus", { id: j.id, status: s }); toast(r.ok ? "Actualitzat." : "Error.", r.ok ? "ok" : "err"); renderJobs(); } }, [j.status === "pending" ? "Imprimint" : "Fet"]),
      el("button", { class: "btn-text danger", onclick: async () => { if (!confirm("Esborrar aquesta feina?")) return; await Admin.call("deleteJob", { id: j.id }); renderJobs(); } }, ["Esborrar"])
    ])
  ]);
}

function openJobForm() {
  const wrap = $("job-form-wrap");
  const catSel = el("select", { id: "j-cat" }, [el("option", { value: "product" }, ["Producte"]), el("option", { value: "research" }, ["Recerca"]), el("option", { value: "personal" }, ["Personal"])]);
  const ownerSel = el("select", { id: "j-owner" }, [el("option", { value: "yerai" }, ["Yerai"]), el("option", { value: "albert" }, ["Albert"])]);
  const ownerWrap = el("label", { class: "adm-field", id: "j-owner-wrap", hidden: "" }, [el("span", {}, ["Qui"]), ownerSel]);
  catSel.addEventListener("change", () => { ownerWrap.hidden = catSel.value !== "personal"; });
  const prodSel = el("select", { id: "j-product" }, [el("option", { value: "" }, ["—"])].concat(State.products.map(p => el("option", { value: p.id }, [pick(p.name) || p.id]))));
  const linkInp = el("input", { id: "j-link", type: "url", placeholder: "https://makerworld.com/..." });
  const matSel = el("select", { id: "j-mat" }, [el("option", { value: "" }, ["—"])].concat(filamentOptions()));
  const anyChk = el("input", { id: "j-any", type: "checkbox" });
  const grams = el("input", { id: "j-grams", type: "number", min: "0", value: "" });
  const units = el("input", { id: "j-units", type: "number", min: "1", value: "1" });
  // Prefill grams from a product's bill-of-materials when one is chosen.
  prodSel.addEventListener("change", () => {
    const p = State.products.find(x => x.id === prodSel.value);
    if (p && p.bom && p.bom[0]) { grams.value = (p.bom[0].grams || 0) * (Number(units.value) || 1); matSel.value = p.bom[0].material + "|" + p.bom[0].color; }
  });
  const form = el("form", { class: "adm-editor", onsubmit: async (e) => {
    e.preventDefault();
    const mc = (matSel.value || "").split("|");
    const job = { category: catSel.value, owner: catSel.value === "personal" ? ownerSel.value : "",
      source: linkInp.value ? "link" : (prodSel.value ? "product" : "direct"),
      productId: prodSel.value, link: linkInp.value.trim(), material: mc[0] || "", color: mc[1] || "",
      anyColor: anyChk.checked, units: Number(units.value || 1), gramsEst: Number(grams.value || 0), notes: $("j-notes").value.trim() };
    if (!job.material) { toast("Tria un material.", "err"); return; }
    const r = await Admin.call("saveJob", { job });
    toast(r.ok ? "Feina afegida." : (r.message || "Error."), r.ok ? "ok" : "err");
    if (r.ok) { wrap.innerHTML = ""; renderJobs(); }
  } }, [
    el("div", { class: "adm-grid-4" }, [
      el("label", { class: "adm-field" }, [el("span", {}, ["Tipus"]), catSel]), ownerWrap,
      el("label", { class: "adm-field" }, [el("span", {}, ["Producte (de la botiga)"]), prodSel]),
      el("label", { class: "adm-field" }, [el("span", {}, ["o enllaç"]), linkInp])
    ]),
    el("div", { class: "adm-grid-4" }, [
      el("label", { class: "adm-field" }, [el("span", {}, ["Material i color"]), matSel]),
      el("label", { class: "adm-check" }, [anyChk, el("span", {}, ["Color no important"])]),
      el("label", { class: "adm-field" }, [el("span", {}, ["Grams (est.)"]), grams]),
      el("label", { class: "adm-field" }, [el("span", {}, ["Unitats"]), units])
    ]),
    el("label", { class: "adm-field" }, [el("span", {}, ["Nota"]), el("textarea", { id: "j-notes" })]),
    el("div", {}, [el("button", { class: "btn", type: "submit" }, ["Afegir a la cua"]), el("button", { class: "btn-text", type: "button", onclick: () => wrap.innerHTML = "" }, ["Cancel·lar"])])
  ]);
  wrap.innerHTML = ""; wrap.appendChild(form);
}

function renderBatchPlanner() {
  const wrap = $("batch-wrap");
  wrap.innerHTML = '<div class="batch-ctl"><strong>Planificador d\'impressió</strong>' +
    ' Productes <input id="bp-p" type="number" value="60" min="0" style="width:56px"> %' +
    ' Recerca <input id="bp-r" type="number" value="30" min="0" style="width:56px"> %' +
    ' Personal <input id="bp-x" type="number" value="10" min="0" style="width:56px"> %' +
    ' <button class="btn-outline" id="bp-go">Planifica</button></div><div id="bp-out"></div>';
  $("bp-go").addEventListener("click", async () => {
    const perc = { product: Number($("bp-p").value || 0), research: Number($("bp-r").value || 0), personal: Number($("bp-x").value || 0) };
    const r = await Admin.call("batchPlan", { perc });
    const out = $("bp-out");
    if (!r.ok || !r.order.length) { out.innerHTML = '<p class="admin-empty">Cap feina pendent.</p>'; return; }
    out.innerHTML = '<p class="muted">Ordre suggerit (' + r.filamentChanges + ' canvis de filament):</p>' +
      '<ol class="batch-list">' + r.order.map(j => '<li><strong>' + escapeHtml(j.material) + " " + (j.anyColor ? "(qualsevol)" : escapeHtml(j.color)) + '</strong> — ' + escapeHtml(j.category) + " · " + j.gramsEst + "g · " + escapeHtml(j.notes || j.productId || j.link || "") + "</li>").join("") + "</ol>";
  });
}

/* ============================ FINANCE ============================ */
async function renderFinance() {
  const v = $("view-finance");
  v.innerHTML = '<div class="admin-head"><h1>Finances</h1></div><div id="pnl" class="adm-summary"></div>' +
    '<div class="admin-head"><h2>Despeses</h2><button class="btn" id="exp-new">+ Despesa</button></div><div id="exp-form"></div><div id="exp-list" class="admin-list"></div>' +
    '<div class="admin-head"><h2>Pagaments a gestors</h2><button class="btn" id="pay-new">+ Pagament</button></div><div id="pay-form"></div><div id="pay-list" class="admin-list"></div>';
  const p = await Admin.call("pnl");
  if (p.ok) { const d = p.data;
    $("pnl").innerHTML = tile("Ingressos", d.revenue.toFixed(2) + " €") + tile("Cost producció", d.productionCost.toFixed(2) + " €") +
      tile("Altres despeses", d.otherExpenses.toFixed(2) + " €") + tile("Benefici brut", d.grossProfit.toFixed(2) + " €") +
      tile("Pagaments", d.payouts.toFixed(2) + " €") + tile("Net", d.net.toFixed(2) + " €");
  }
  $("exp-new").addEventListener("click", () => openExpenseForm());
  $("pay-new").addEventListener("click", () => openPayoutForm());
  const ex = await Admin.call("listExpenses");
  $("exp-list").innerHTML = "";
  (ex.ok && ex.data.length ? ex.data : []).forEach(e => $("exp-list").appendChild(financeCard(e, "deleteExpense", renderFinance, escapeHtml(e.category) + " · " + escapeHtml(e.description), Number(e.amount || 0).toFixed(2) + " € · " + fmtDate(e.date) + (e.supplier ? " · " + escapeHtml(e.supplier) : ""))));
  if (!(ex.ok && ex.data.length)) $("exp-list").innerHTML = '<p class="admin-empty">Cap despesa.</p>';
  const pay = await Admin.call("listPayouts");
  $("pay-list").innerHTML = "";
  (pay.ok && pay.data.length ? pay.data : []).forEach(x => $("pay-list").appendChild(financeCard(x, "deletePayout", renderFinance, escapeHtml(x.manager) + " · " + Number(x.amount || 0).toFixed(2) + " €", fmtDate(x.date) + (x.period ? " · " + escapeHtml(x.period) : ""))));
  if (!(pay.ok && pay.data.length)) $("pay-list").innerHTML = '<p class="admin-empty">Cap pagament.</p>';
}
function financeCard(obj, delAction, refresh, title, meta) {
  return el("div", { class: "adm-card" }, [
    el("div", { class: "adm-card-main" }, [el("div", { class: "adm-card-name", html: title }), el("div", { class: "adm-card-meta", html: meta })]),
    el("div", { class: "adm-card-actions" }, [el("button", { class: "btn-text danger", onclick: async () => { if (!confirm("Esborrar?")) return; await Admin.call(delAction, { id: obj.id }); refresh(); } }, ["Esborrar"])])
  ]);
}
function openExpenseForm() {
  const wrap = $("exp-form");
  const form = el("form", { class: "adm-editor", onsubmit: async (e) => {
    e.preventDefault();
    const exp = { category: $("e-cat").value.trim(), description: $("e-desc").value.trim(), amount: Number($("e-amt").value || 0), supplier: $("e-sup").value.trim(), recurring: $("e-rec").value };
    const r = await Admin.call("saveExpense", { expense: exp });
    toast(r.ok ? "Desat." : "Error.", r.ok ? "ok" : "err"); if (r.ok) { wrap.innerHTML = ""; renderFinance(); }
  } }, [
    el("div", { class: "adm-grid-4" }, [
      el("label", { class: "adm-field" }, [el("span", {}, ["Categoria"]), el("input", { id: "e-cat", placeholder: "domini, material, eines…" })]),
      el("label", { class: "adm-field" }, [el("span", {}, ["Descripció"]), el("input", { id: "e-desc" })]),
      el("label", { class: "adm-field" }, [el("span", {}, ["Import (€)"]), el("input", { id: "e-amt", type: "number", step: "0.01" })]),
      el("label", { class: "adm-field" }, [el("span", {}, ["Proveïdor"]), el("input", { id: "e-sup" })])
    ]),
    el("label", { class: "adm-field" }, [el("span", {}, ["Recurrència"]), el("select", { id: "e-rec" }, [el("option", { value: "" }, ["Puntual"]), el("option", { value: "mensual" }, ["Mensual"]), el("option", { value: "anual" }, ["Anual"])])]),
    el("div", {}, [el("button", { class: "btn", type: "submit" }, ["Desar"]), el("button", { class: "btn-text", type: "button", onclick: () => wrap.innerHTML = "" }, ["Cancel·lar"])])
  ]);
  wrap.innerHTML = ""; wrap.appendChild(form);
}
function openPayoutForm() {
  const wrap = $("pay-form");
  const form = el("form", { class: "adm-editor", onsubmit: async (e) => {
    e.preventDefault();
    const pay = { manager: $("p-man").value.trim(), amount: Number($("p-amt").value || 0), period: $("p-per").value.trim(), notes: $("p-note").value.trim() };
    const r = await Admin.call("savePayout", { payout: pay });
    toast(r.ok ? "Desat." : "Error.", r.ok ? "ok" : "err"); if (r.ok) { wrap.innerHTML = ""; renderFinance(); }
  } }, [
    el("div", { class: "adm-grid-4" }, [
      el("label", { class: "adm-field" }, [el("span", {}, ["Gestor"]), el("input", { id: "p-man", placeholder: "Albert / Yerai" })]),
      el("label", { class: "adm-field" }, [el("span", {}, ["Import (€)"]), el("input", { id: "p-amt", type: "number", step: "0.01" })]),
      el("label", { class: "adm-field" }, [el("span", {}, ["Període"]), el("input", { id: "p-per", placeholder: "2026-11" })]),
      el("label", { class: "adm-field" }, [el("span", {}, ["Nota"]), el("input", { id: "p-note" })])
    ]),
    el("div", {}, [el("button", { class: "btn", type: "submit" }, ["Desar"]), el("button", { class: "btn-text", type: "button", onclick: () => wrap.innerHTML = "" }, ["Cancel·lar"])])
  ]);
  wrap.innerHTML = ""; wrap.appendChild(form);
}
