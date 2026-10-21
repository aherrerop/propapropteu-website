/* ============================================================
   Manager dashboard. Reuses the site's theme + buttons.
   Flow: edit products -> saved to the Google Sheet -> "Publicar"
   commits data/products.json to the repo (live in ~1-2 min).
   ============================================================ */

const LANGS = ["ca", "es", "en"];
const LANG_LABEL = { ca: "Català", es: "Español", en: "English" };
const TYPE_LABEL = { own: "Diseño propio", std: "Producto estándar", tool: "Herramienta" };
const DIRTY_KEY = "ppt-admin-dirty";

const State = { products: [], labels: [], images: [], editingOriginalId: null };

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
  $("btn-logout").addEventListener("click", () => { Admin.clear(); location.href = "acceso.html"; });
  $("btn-new").addEventListener("click", () => openEditor(null));
  $("btn-publish").addEventListener("click", publish);
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
  if (!r.ok) { toast(r.message || "Error al cargar productos.", "err"); return; }
  State.products = r.data || [];
  renderList();
}

/* ============================ LIST ============================ */
function pick(obj) { return obj ? (obj.es || obj.ca || obj.en || "") : ""; }

function renderList() {
  const wrap = $("product-list");
  wrap.innerHTML = "";
  $("list-empty").hidden = State.products.length > 0;

  State.products.forEach(p => {
    const img = (p.images && p.images[0]) || "";
    const stock = (p.stock === undefined || p.stock === null || p.stock === "")
      ? '<span class="stk stk-inf">∞</span>'
      : (Number(p.stock) <= 0 ? '<span class="stk stk-0">Agotado</span>' : '<span class="stk">' + p.stock + ' ud.</span>');
    const card = el("div", { class: "adm-card" }, [
      el("div", { class: "adm-card-img", html: img ? '<img src="' + img + '" alt="">' : '<span>sin foto</span>' }),
      el("div", { class: "adm-card-main" }, [
        el("div", { class: "adm-card-name", html: (p.featured ? "★ " : "") + (pick(p.name) || p.id) }),
        el("div", { class: "adm-card-meta", html:
          (TYPE_LABEL[p.type] || p.type || "") + " · " +
          "<strong>" + Number(p.price || 0).toFixed(2) + " €</strong> · " + stock +
          ' · <span class="adm-id">' + p.id + "</span>" })
      ]),
      el("div", { class: "adm-card-actions" }, [
        el("button", { class: "btn-outline", onclick: () => openEditor(p.id) }, ["Editar"]),
        el("button", { class: "btn-text danger", onclick: () => removeProduct(p.id) }, ["Borrar"])
      ])
    ]);
    wrap.appendChild(card);
  });
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
    el("h1", {}, [isExisting ? "Editar producto" : "Nuevo producto"]),
    el("div", {}, [
      el("button", { type: "button", class: "btn-text", onclick: closeEditor }, ["Cancelar"]),
      el("button", { type: "submit", class: "btn" }, ["Guardar"])
    ])
  ]));

  /* --- basics row --- */
  const idInput = el("input", { id: "f-id", type: "text", value: p.id, placeholder: "ej. penja-quadres-pro",
    pattern: "[a-z0-9\\-]+", required: true });
  if (isExisting) { idInput.readOnly = true; idInput.classList.add("readonly"); }
  const typeSel = el("select", { id: "f-type" }, Object.keys(TYPE_LABEL).map(k =>
    el("option", { value: k, selected: p.type === k }, [TYPE_LABEL[k]])));

  form.appendChild(el("div", { class: "adm-grid-4" }, [
    el("div", { class: "adm-field" }, [el("label", {}, ["ID (identificador único)"]), idInput]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Tipo"]), typeSel]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Precio (€, IVA incl.)"]),
      el("input", { id: "f-price", type: "number", step: "0.01", min: "0", value: p.price })]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Stock (vacío = ∞)"]),
      el("input", { id: "f-stock", type: "number", step: "1", min: "0", value: (p.stock ?? "") })])
  ]));

  /* --- featured + codename --- */
  const featChk = el("input", { id: "f-featured", type: "checkbox" });
  featChk.checked = !!p.featured;
  const heroBox = el("div", { id: "hero-box", class: "adm-hero" });
  featChk.addEventListener("change", () => { heroBox.hidden = !featChk.checked; });

  form.appendChild(el("div", { class: "adm-grid-2" }, [
    el("label", { class: "adm-check" }, [featChk, el("span", {}, ["Destacado (sale primero y en la portada)"])]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Nombre clave portada (ej. ATLAS)"]),
      el("input", { id: "f-codename", type: "text", value: p.codename || "" })])
  ]));

  /* --- texts --- */
  form.appendChild(langField("Nombre", "name", p.name));
  form.appendChild(langField("Resumen corto", "short", p.short, true));
  form.appendChild(langField("Descripción", "description", p.description, true));

  /* --- hero (featured only) --- */
  heroBox.appendChild(el("h3", {}, ["Portada (solo destacados)"]));
  heroBox.appendChild(langField("Titular portada", "heroTagline", p.heroTagline));
  heroBox.appendChild(langField("Texto portada", "heroDesc", p.heroDesc, true));
  heroBox.hidden = !p.featured;
  form.appendChild(heroBox);

  /* --- labels --- */
  const labelBox = el("div", { class: "adm-labels" }, State.labels.map(l => {
    const cb = el("input", { type: "checkbox", value: l.id, class: "f-label" });
    cb.checked = (p.labels || []).indexOf(l.id) >= 0;
    return el("label", { class: "adm-chip" }, [cb, el("span", {}, [pick(l.name) || l.id])]);
  }));
  form.appendChild(el("div", { class: "adm-field" }, [el("label", {}, ["Categorías"]), labelBox]));

  /* --- images --- */
  form.appendChild(buildImages());

  /* --- specs --- */
  form.appendChild(buildSpecs(p.specs || []));

  /* --- footer actions + delete --- */
  const foot = el("div", { class: "adm-editor-foot" }, [
    el("button", { type: "submit", class: "btn" }, ["Guardar"]),
    el("button", { type: "button", class: "btn-text", onclick: closeEditor }, ["Cancelar"])
  ]);
  if (isExisting) foot.appendChild(el("button", { type: "button", class: "btn-text danger",
    onclick: () => removeProduct(p.id, true) }, ["Borrar producto"]));
  form.appendChild(foot);

  return form;
}

/* ---------- images sub-panel ---------- */
function buildImages() {
  const strip = el("div", { class: "adm-imgs", id: "img-strip" });
  const file = el("input", { type: "file", accept: "image/*", id: "img-file", style: "display:none" });
  file.addEventListener("change", onPickImage);
  const addBtn = el("button", { type: "button", class: "btn-outline", onclick: () => file.click() }, ["+ Subir imagen"]);
  const field = el("div", { class: "adm-field" }, [el("label", {}, ["Imágenes"]), strip, addBtn, file]);
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
      el("button", { type: "button", class: "adm-img-x", title: "Quitar",
        onclick: () => { State.images.splice(i, 1); renderImages(); } }, ["×"])
    ]));
  });
}
async function onPickImage(e) {
  const f = e.target.files[0];
  if (!f) return;
  toast("Subiendo imagen…");
  const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
  const resp = await Admin.call("uploadImage", { filename: f.name, mimeType: f.type, dataBase64: dataUrl });
  e.target.value = "";
  if (!resp.ok) { toast(resp.message || "No se pudo subir la imagen.", "err"); return; }
  State.images.push(resp.url);
  renderImages();
  toast("Imagen añadida.", "ok");
}

/* ---------- specs sub-panel ---------- */
function buildSpecs(specs) {
  const rows = el("div", { class: "adm-specs", id: "spec-rows" });
  (specs.length ? specs : []).forEach(s => rows.appendChild(specRow(s)));
  const add = el("button", { type: "button", class: "btn-outline",
    onclick: () => rows.appendChild(specRow({})) }, ["+ Fila de ficha técnica"]);
  return el("div", { class: "adm-field" }, [el("label", {}, ["Ficha técnica (opcional)"]), rows, add]);
}
function specRow(s) {
  const lab = s.label || {};
  const row = el("div", { class: "adm-spec-row" }, [
    el("input", { type: "text", class: "sp-ca", placeholder: "Etiqueta CA", value: lab.ca || "" }),
    el("input", { type: "text", class: "sp-es", placeholder: "Etiqueta ES", value: lab.es || "" }),
    el("input", { type: "text", class: "sp-en", placeholder: "Etiqueta EN", value: lab.en || "" }),
    el("input", { type: "text", class: "sp-val", placeholder: "Valor", value: s.value || "" }),
    el("button", { type: "button", class: "adm-img-x", title: "Quitar",
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
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) { toast("El ID solo puede llevar minúsculas, números y guiones.", "err"); return; }
  if (!Object.keys(p.name).length) { toast("Pon al menos un nombre (en un idioma).", "err"); return; }
  if (!State.editingOriginalId && State.products.some(x => x.id === p.id)) {
    toast("Ya existe un producto con ese ID.", "err"); return;
  }
  toast("Guardando…");
  const r = await Admin.call("saveProduct", { product: p });
  if (!r.ok) { toast(r.message || "No se pudo guardar.", "err"); return; }
  setDirty(true);
  await loadProducts();
  closeEditor();
  toast("Guardado. Recuerda Publicar para que salga en la web.", "ok");
}

async function removeProduct(id, fromEditor) {
  if (!confirm("¿Borrar este producto? No se puede deshacer.")) return;
  toast("Borrando…");
  const r = await Admin.call("deleteProduct", { id });
  if (!r.ok) { toast(r.message || "No se pudo borrar.", "err"); return; }
  setDirty(true);
  await loadProducts();
  if (fromEditor) closeEditor();
  toast("Producto borrado. Recuerda Publicar.", "ok");
}

async function publish() {
  const btn = $("btn-publish");
  btn.disabled = true; const prev = btn.textContent; btn.textContent = "Publicando…";
  const r = await Admin.call("publish");
  btn.disabled = false; btn.textContent = prev;
  if (!r.ok) { toast(r.message || "No se pudo publicar.", "err"); return; }
  setDirty(false);
  toast(r.message || "Publicado.", "ok");
}
