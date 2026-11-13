/* ============================================================
   Internal management.
     Workshop:  Products · Orders · To-do · Materials
     Website:   Highlights · Clients
   The engine (Apps Script) does the work; this file draws the
   screens and calls it through api(action, data).
   ============================================================ */

const MATERIAL_TYPES = ["PLA", "PETG", "ABS"];
const ORDER_TYPES = ["Product", "Prototype", "Personal"];
const State = { products: [], materials: [], tick: 0, sheetUrl: "" };

/* ---------- tiny helpers ---------- */
const $ = id => document.getElementById(id);
function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") n.className = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] === true) n.setAttribute(k, "");
    else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  (children || []).forEach(c => { if (c != null && c !== false) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return n;
}
const grams = n => (n === "" || n == null) ? "—" : Number(n).toLocaleString("en-US") + " g";
const euro = n => (n === "" || n == null) ? "—" : Number(n).toFixed(2) + " €";
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)));
const field = (label, input) => el("div", { class: "field" }, [el("label", {}, [label]), input]);
const text = (val, ph) => el("input", { type: "text", value: val == null ? "" : val, placeholder: ph || "" });
const number = (val, ph, step) => el("input", { type: "number", min: "0", step: step || "1", value: val == null ? "" : val, placeholder: ph || "" });

let toastTimer;
function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg; t.className = "toast" + (kind ? " " + kind : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, kind === "err" ? 6000 : 2600);
}
// Call the engine; turn connection problems into plain English.
async function api(action, data) {
  const r = await Admin.call(action, data);
  if (!r.ok && r.error === "auth") { Admin.clear(); location.href = "acceso.html"; }
  if (!r.ok && (r.error === "network" || r.error === "parse" || r.error === "noapi")) r.message = "Could not reach the server. Check the connection and try again.";
  return r;
}
const fail = r => toast(r.message || "Something went wrong. Please try again.", "err");

/* ---------- icons ---------- */
const svg = d => '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
const ICON = {
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  printed: svg('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
  failed: svg('<path d="M12 3 2 20h20Z"/><path d="M12 10v5M12 17.5v.5"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  cart: svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12h11.2L21 7H6"/>'),
  left: svg('<path d="m15 6-6 6 6 6"/>'), right: svg('<path d="m9 6 6 6-6 6"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'), down: svg('<path d="m6 9 6 6 6-6"/>')
};
function icon(name, title, onclick, cls) {
  return el("button", { type: "button", class: "icon" + (cls ? " " + cls : ""), title: title, "aria-label": title, html: ICON[name], onclick: e => { e.stopPropagation(); onclick(e); } });
}
// A colour circle. Translucent filaments get a white dot in the centre.
function dot(hex, name) {
  const c = hex || "#cfcbc3";
  const translucent = /translucent|transparent|clear/i.test(name || "");
  return el("span", { class: "dot", style: "background:" + (translucent ? "radial-gradient(circle, #fff 0 26%, " + c + " 31%)" : c) });
}
const anyDot = () => el("span", { class: "dot any" });

// One dialog for every question: confirm, a number, and/or which roll.
function dialog(o) {
  return new Promise(resolve => {
    let roll = "";
    const input = o.input ? number(o.input.value, o.input.placeholder) : null;
    const chips = o.rolls ? el("div", { class: "chips" }, o.rolls.map(m => {
      const c = el("button", { type: "button", class: "chip", onclick: () => { roll = m.id; chips.querySelectorAll(".chip").forEach(x => x.classList.remove("on")); c.classList.add("on"); } },
        [dot(m.hex, m.color), m.material + " " + m.color + " · " + grams(m.grams)]);
      return c;
    })) : null;
    const done = v => { overlay.remove(); resolve(v); };
    const ok = el("button", { class: "btn", type: "submit" }, [o.ok || "OK"]);
    const form = el("form", { class: "dialog", onclick: e => e.stopPropagation(), onsubmit: e => {
      e.preventDefault();
      if (input && !(Number(input.value) > 0)) return input.focus();
      if (chips && !roll) return toast("Choose the roll.", "err");
      done({ value: input ? Number(input.value) : null, roll });
    } }, [
      el("h3", {}, [o.title]), o.text ? el("p", {}, [o.text]) : null,
      input ? field(o.input.label, input) : null,
      chips ? el("div", { class: "field" }, [el("label", {}, ["Roll used"]), chips]) : null,
      el("div", { class: "foot" }, [el("button", { type: "button", class: "link-btn", onclick: () => done(null) }, ["Cancel"]), ok])
    ]);
    const overlay = el("div", { class: "overlay", onclick: () => done(null) }, [form]);
    document.body.appendChild(overlay);
    (input || ok).focus();
  });
}

/* ============================ START ============================ */
const MODES = {
  workshop: [["products", "Products", renderProducts], ["orders", "Orders", renderOrders], ["todo", "To-do", renderTodo], ["materials", "Materials", renderMaterials]],
  website: [["highlights", "Highlights", renderHighlights], ["clients", "Clients", renderClients]]
};
const remember = (k, v) => { try { v === undefined ? 0 : sessionStorage.setItem(k, v); return sessionStorage.getItem(k); } catch (e) { return null; } };

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await Admin.requireLogin())) return;
  $("admin-who").textContent = (Admin.user && (Admin.user.name || Admin.user.email)) || "";
  $("btn-logout").addEventListener("click", () => { Admin.clear(); location.href = "acceso.html"; });
  document.querySelectorAll("#admin-modes button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  setMode(remember("ppt-mode") || "workshop", remember("ppt-view"));
});
function setMode(mode, view) {
  if (!MODES[mode]) mode = "workshop";
  remember("ppt-mode", mode);
  document.querySelectorAll("#admin-modes button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  $("admin-nav").replaceChildren(...MODES[mode].map(([id, label]) => el("button", { "data-view": id, onclick: () => show(mode, id) }, [label])));
  show(mode, view);
}
function show(mode, view) {
  const def = MODES[mode].find(v => v[0] === view) || MODES[mode].find(v => v[0] === "todo") || MODES[mode][0];
  remember("ppt-view", def[0]);
  document.querySelectorAll("#admin-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === def[0]));
  def[2]();
}
// Start drawing a screen: the title row is final from the first moment (it never jumps
// when the data arrives). Returns { body, alive } — alive() is false once the user has
// moved to another screen, so a slow answer never draws over the wrong one.
function screen(title, ...actions) {
  const tick = ++State.tick;
  const form = el("div"), body = el("div", {}, [el("p", { class: "empty" }, ["Loading…"])]);
  $("view").replaceChildren(el("div", { class: "head" }, [el("h1", {}, [title]), el("div", { class: "head-actions" }, actions)]), form, body);
  return { form, body, alive: () => tick === State.tick };
}
async function loadMaterials() { const r = await api("listMaterials"); if (r.ok) State.materials = r.data; return r; }
async function loadProducts() { const r = await api("listProducts"); if (r.ok) State.products = r.data; return r; }

/* ---------- shared form pieces ---------- */
// A small rich-text box: bold, italic and bullet points.
function richText(html) {
  const box = el("div", { class: "rich-box", contenteditable: "true", html: html || "" });
  const cmd = (c, label, title) => el("button", { type: "button", title: title, onmousedown: e => { e.preventDefault(); document.execCommand(c); box.focus(); } }, [label]);
  const wrap = el("div", { class: "rich" }, [el("div", { class: "rich-bar" }, [cmd("bold", "Bold", "Bold"), cmd("italic", "Italic", "Italic"), cmd("insertUnorderedList", "• List", "Bullet points")]), box]);
  wrap.read = () => (box.textContent.trim() ? box.innerHTML : "");
  return wrap;
}
const read = input => (typeof input.read === "function" ? input.read() : input.value.trim());
// English is typed; Catalan and Spanish are kept if the English did not change, otherwise
// sent empty so the engine translates them again.
function languages(enNow, before, overrides) {
  const out = { en: enNow };
  ["ca", "es"].forEach(l => {
    const old = (before && before[l]) || "", oldEn = (before && before.en) || "";
    const typed = overrides ? read(overrides[l]) : old;
    out[l] = (enNow !== oldEn && typed === old) ? "" : typed;
  });
  return out;
}
// Shrink a photo in the browser before uploading (phone pictures are huge). PNGs stay PNG
// so a transparent background survives.
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file), png = /png/i.test(file.type);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ data: c.toDataURL(png ? "image/png" : "image/jpeg", 0.86), mime: png ? "image/png" : "image/jpeg", ext: png ? ".png" : ".jpg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}
async function uploadPicture(file) {
  const s = await shrinkImage(file);
  const u = await api("uploadImage", { dataBase64: s.data, filename: file.name.replace(/\.\w+$/, "") + s.ext, mimeType: s.mime });
  if (!u.ok) { fail(u); return ""; }
  return u.url;
}
// Material + colour choice (the colours in stock as circles, plus "Color not important").
// `v` is any object with material / color / anyColor; it is updated in place.
function colorChips(v) {
  const box = el("div", { class: "chips" });
  box.draw = () => {
    if (!v.material) { box.replaceChildren(); return; }
    const stock = State.materials.filter(m => m.material === v.material);
    const chips = stock.map(m => ({ label: m.color, node: dot(m.hex, m.color), on: !v.anyColor && (v.color || "").toLowerCase() === m.color.toLowerCase(), pick: () => { v.color = m.color; v.anyColor = false; } }));
    if (!v.anyColor && v.color && !stock.some(m => m.color.toLowerCase() === v.color.toLowerCase()))
      chips.push({ label: v.color + " (not in stock)", node: dot(""), on: true, pick: () => {} });
    chips.push({ label: "Color not important", node: anyDot(), on: !!v.anyColor, pick: () => { v.anyColor = true; v.color = ""; } });
    box.replaceChildren(...chips.map(c => el("button", { type: "button", class: "chip" + (c.on ? " on" : ""), onclick: () => { c.pick(); box.draw(); } }, [c.node, c.label])));
  };
  box.draw();
  return box;
}
function materialSelect(v, chips, emptyLabel) {
  const s = el("select", {}, [el("option", { value: "" }, [emptyLabel || "Material…"])].concat(MATERIAL_TYPES.map(m => el("option", { value: m, selected: v.material === m }, [m]))));
  s.addEventListener("change", () => { v.material = s.value; if (!v.anyColor) v.color = ""; chips.draw(); });
  return s;
}

/* ============================ PRODUCTS ============================ */
async function renderProducts() {
  const s = screen("Products", el("button", { class: "btn ghost", onclick: () => productForm(null, s.form) }, ["New product"]));
  const [r] = await Promise.all([loadProducts(), loadMaterials()]);
  if (!s.alive()) return;
  if (!r.ok) { s.body.replaceChildren(); return fail(r); }
  if (!State.products.length) return s.body.replaceChildren(el("p", { class: "empty" }, ["No products yet."]));
  s.body.replaceChildren(el("div", { class: "list" }, State.products.map(p => el("div", { class: "card" }, [
    el("div", { class: "thumb" }, [p.images[0] ? el("img", { src: p.images[0], alt: "" }) : "no picture"]),
    el("div", { class: "card-main" }, [
      el("div", { class: "card-title" }, [p.name.en || p.id]),
      el("div", { class: "card-meta" }, [[p.code, euro(p.price), p.printTime !== "" ? p.printTime + " min" : "", p.weight !== "" ? grams(p.weight) : "",
        p.webMaterial ? "web: " + p.webMaterial + " " + (p.webAnyColor ? "any color" : p.webColor) : ""].filter(Boolean).join(" · ")])
    ]),
    el("div", { class: "actions" }, [
      icon("edit", "Edit", () => productForm(p, s.form)),
      icon("x", "Delete", async () => {
        if (!(await dialog({ title: 'Delete "' + (p.name.en || p.id) + '"?', text: "It is removed from the website too.", ok: "Delete" }))) return;
        const d = await api("deleteProduct", { id: p.id });
        if (!d.ok) return fail(d);
        toast(d.message || "Deleted. The website updates in 1–2 minutes.", d.message ? "err" : ""); renderProducts();
      }, "danger")
    ])
  ]))));
}

function productForm(p, mount) {
  const isNew = !p;
  p = p || { id: "", code: "", name: {}, price: "", printTime: "", weight: "", short: {}, description: {}, images: [], specs: [], webMaterial: "", webColor: "", webAnyColor: false };
  const name = text(p.name.en), code = text(p.code);
  const price = number(p.price, "", "0.01"), time = number(p.printTime, "minutes"), weight = number(p.weight, "grams");
  const short = text(p.short.en), long = richText(p.description.en);

  // Pictures: the first one is the main picture; arrows change the order.
  const pics = p.images.slice(), picBox = el("div", { class: "pics" });
  const drawPics = () => picBox.replaceChildren(...pics.map((url, i) => el("div", { class: "pic" }, [
    el("div", { class: "thumb" }, [el("img", { src: url, alt: "" })]),
    el("div", { class: "pic-tools" }, [
      icon("left", "Move earlier", () => { if (i > 0) { pics.splice(i - 1, 0, pics.splice(i, 1)[0]); drawPics(); } }),
      icon("right", "Move later", () => { if (i < pics.length - 1) { pics.splice(i + 1, 0, pics.splice(i, 1)[0]); drawPics(); } }),
      icon("x", "Remove picture", () => { pics.splice(i, 1); drawPics(); }, "danger")
    ])
  ])));
  drawPics();
  const file = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: async () => {
    for (const f of file.files) {
      toast("Uploading " + f.name + "…");
      try { const url = await uploadPicture(f); if (url) { pics.push(url); drawPics(); } } catch (e) { toast("That picture could not be read.", "err"); }
    }
    file.value = ""; toast("Pictures uploaded.");
  } });

  // Datasheet: label + value rows, shown as a table on the product page.
  const specs = p.specs.map(s => ({ before: s, label: text(s.label.en, "e.g. Max load"), value: text(s.value.en, "e.g. 8 kg") }));
  const specBox = el("div", { class: "rows" });
  const drawSpecs = () => specBox.replaceChildren(...specs.map(s => el("div", { class: "row2" }, [s.label, s.value, icon("x", "Remove row", () => { specs.splice(specs.indexOf(s), 1); drawSpecs(); }, "danger")])));
  drawSpecs();

  // What a website order of this product is printed in.
  const web = { material: p.webMaterial, color: p.webColor, anyColor: p.webAnyColor };
  const webChips = colorChips(web);

  const tr = { name: { ca: text(p.name.ca), es: text(p.name.es) }, short: { ca: text(p.short.ca), es: text(p.short.es) }, description: { ca: richText(p.description.ca), es: richText(p.description.es) } };
  const save = el("button", { class: "btn", type: "submit" }, ["Save"]);
  const form = el("form", { class: "panel", onsubmit: async e => {
    e.preventDefault();
    if (save.disabled) return;
    if (!name.value.trim()) return toast("Enter the product name.", "err");
    const product = {
      id: p.id, code: code.value.trim(), price: price.value, printTime: time.value, weight: weight.value, images: pics,
      name: languages(name.value.trim(), p.name, tr.name), short: languages(short.value.trim(), p.short, tr.short), description: languages(long.read(), p.description, tr.description),
      specs: specs.filter(s => s.label.value.trim()).map(s => ({ label: languages(s.label.value.trim(), s.before && s.before.label), value: languages(s.value.value.trim(), s.before && s.before.value) })),
      webMaterial: web.material, webColor: web.color, webAnyColor: web.anyColor
    };
    save.disabled = true; save.textContent = "Saving…";
    const r = await api("saveProduct", { product });
    save.disabled = false; save.textContent = "Save";
    if (!r.ok) return fail(r);
    toast(r.message || "Saved. The website updates in 1–2 minutes.", r.message ? "err" : ""); renderProducts();
  } }, [
    el("h2", {}, [isNew ? "New product" : "Edit product"]),
    el("div", { class: "cols c2" }, [field("Name", name), field("Internal ID", code)]),
    el("div", { class: "cols c3" }, [field("Price (€)", price), field("Printing time (min)", time), field("Weight (g)", weight)]),
    field("Short description", short), field("Long description", long),
    field("Pictures", el("div", {}, [picBox, file, el("button", { type: "button", class: "btn ghost", style: "margin-top:10px", onclick: () => file.click() }, ["Add pictures"])])),
    field("Datasheet", el("div", {}, [specBox, el("button", { type: "button", class: "btn ghost", style: "margin-top:10px", onclick: () => { specs.push({ before: null, label: text("", "e.g. Max load"), value: text("", "e.g. 8 kg") }); drawSpecs(); } }, ["Add row"])])),
    field("Website orders are printed in", el("div", { class: "rows" }, [el("div", { style: "max-width:220px" }, [materialSelect(web, webChips, "Not set")]), webChips])),
    el("details", { class: "more" }, [
      el("summary", {}, ["Translations (optional — filled in automatically when left empty)"]),
      el("div", { class: "cols c2" }, [field("Name — Catalan", tr.name.ca), field("Name — Spanish", tr.name.es)]),
      el("div", { class: "cols c2" }, [field("Short description — Catalan", tr.short.ca), field("Short description — Spanish", tr.short.es)]),
      field("Long description — Catalan", tr.description.ca), field("Long description — Spanish", tr.description.es)
    ]),
    el("div", { class: "foot" }, [save, el("button", { class: "link-btn", type: "button", onclick: () => mount.replaceChildren() }, ["Cancel"])])
  ]);
  mount.replaceChildren(form);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ============================ ORDERS ============================ */
async function renderOrders() {
  const s = screen("Orders", el("button", { class: "btn ghost", onclick: () => orderForm(null, { mount: s.form, done: renderOrders }) }, ["New order"]));
  const [r] = await Promise.all([api("listOrders"), loadProducts(), loadMaterials()]);
  if (!s.alive()) return;
  if (!r.ok) { s.body.replaceChildren(); return fail(r); }
  if (!r.data.length) return s.body.replaceChildren(el("p", { class: "empty" }, ["No open orders."]));
  s.body.replaceChildren(el("div", { class: "list" }, r.data.map(o => el("div", { class: "card" }, [
    el("div", { class: "card-main" }, [
      el("div", { class: "card-title" }, ["#" + o.no + " · " + o.type + (o.price !== "" ? " · " + euro(o.price) : "") + (o.source === "web" ? " · website" : "")]),
      el("div", { class: "card-meta" }, [o.pieces.map(p => (p.copies > 1 ? p.copies + "× " : "") + p.name + " (" + (p.material ? p.material + " " + (p.anyColor ? "any color" : p.color) : "material not set") + ")").join(" · ") || "—"]),
      o.notes ? el("div", { class: "card-meta" }, [o.notes]) : null,
      o.printed ? el("div", { class: "card-meta" }, [o.printed + " already printed"]) : null
    ]),
    el("div", { class: "actions" }, [
      icon("edit", "Edit", () => orderForm(o, { mount: s.form, done: renderOrders })),
      icon("x", "Delete order", async () => {
        if (!(await dialog({ title: "Delete order #" + o.no + "?", text: "Its products leave the to-do list.", ok: "Delete" }))) return;
        const d = await api("deleteOrder", { key: o.key });
        if (!d.ok) return fail(d);
        toast("Order deleted."); renderOrders();
      }, "danger")
    ])
  ]))));
}

// The order form. Used for a new order, for editing one, and (with the weight column)
// from the To-do pencil. The order key is made here, once, so saving twice by mistake
// updates the same order instead of creating another.
function orderForm(order, opts) {
  const isNew = !order, key = isNew ? newId() : order.key;
  const lines = isNew ? [] : order.pieces.map(p => Object.assign({}, p));
  const type = el("select", {}, ORDER_TYPES.map(t => el("option", { value: t, selected: !isNew && order.type === t }, [t])));
  const price = number(isNew ? "" : order.price, "agreed price", "0.01");
  const notes = el("textarea", { placeholder: "Anything Albert should know: several parts, special requirements…" }, [isNew ? "" : order.notes]);
  const rows = el("div", { class: "rows" });

  function lineRow(line) {
    const product = el("select", {}, [el("option", { value: "" }, ["External link / other"])].concat(State.products.map(p => el("option", { value: p.id, selected: line.productId === p.id }, [p.name.en || p.id]))));
    const name = text(line.name, "Product name"), link = text(line.link, "MakerWorld / Thingiverse link (optional)");
    const copies = el("input", { type: "number", min: "1", step: "1", value: line.copies || 1, title: "Copies" });
    const weight = number(line.grams, "g");
    const chips = colorChips(line), material = materialSelect(line, chips);
    const stock = () => State.products.find(x => x.id === line.productId);
    // A product with a known weight fills the grams in by itself (weight × copies).
    const autoWeight = oldCopies => {
      const p = stock(); if (!p || p.weight === "") return;
      if (line.grams === "" || line.grams == null || Number(line.grams) === Number(p.weight) * oldCopies) { line.grams = Number(p.weight) * Number(line.copies || 1); weight.value = line.grams; }
    };
    product.addEventListener("change", () => {
      line.productId = product.value; line.grams = "";
      const p = stock();
      if (p) { name.value = p.name.en || p.id; line.name = name.value; autoWeight(1); }
    });
    name.addEventListener("input", () => { line.name = name.value; });
    link.addEventListener("input", () => { line.link = link.value; });
    copies.addEventListener("input", () => { const old = Number(line.copies || 1); line.copies = Math.max(1, Number(copies.value || 1)); autoWeight(old); });
    weight.addEventListener("input", () => { line.grams = weight.value; });
    const row = el("div", { class: "line" }, [
      el("div", { class: "line-cols" + (opts.weights ? " with-weight" : "") }, [
        product, name, material, copies, opts.weights ? weight : null,
        icon("x", "Remove this product", () => { lines.splice(lines.indexOf(line), 1); row.remove(); }, "danger")
      ]),
      link, chips
    ]);
    return row;
  }
  const addLine = () => { const line = { id: newId(), productId: "", name: "", link: "", material: "", color: "", anyColor: false, copies: 1, grams: "" }; lines.push(line); rows.appendChild(lineRow(line)); };
  lines.forEach(l => rows.appendChild(lineRow(l)));
  if (isNew) addLine();

  const save = el("button", { class: "btn", type: "submit" }, ["Save order"]);
  const form = el("form", { class: "panel", onsubmit: async e => {
    e.preventDefault();
    if (save.disabled) return;
    if (!lines.length) return toast("Add at least one product.", "err");
    for (const l of lines) {
      if (!String(l.name || "").trim()) return toast("Every product needs a name.", "err");
      if (!l.material) return toast('Choose a material for "' + l.name + '".', "err");
      if (!l.anyColor && !l.color) return toast('Choose a color (or "Color not important") for "' + l.name + '".', "err");
    }
    const pieces = lines.map(l => ({ id: l.id, productId: l.productId, name: l.name, link: l.link, material: l.material, color: l.color, anyColor: l.anyColor, copies: l.copies, grams: l.grams }));
    save.disabled = true; save.textContent = "Saving…";
    const r = await api("saveOrder", { order: { key, type: type.value, price: price.value, notes: notes.value, pieces } });
    save.disabled = false; save.textContent = "Save order";
    if (!r.ok) return fail(r);
    toast(r.created ? "Order #" + r.no + " added to the to-do list." : "Order #" + r.no + " updated.");
    opts.mount.replaceChildren(); opts.done();
  } }, [
    el("h2", {}, [isNew ? "New order" : "Edit order #" + order.no]),
    el("div", { class: "cols c2" }, [field("Order type", type), field("Price (€)", price)]),
    field("Products", el("div", {}, [rows, el("button", { type: "button", class: "btn ghost", style: "margin-top:10px", onclick: addLine }, ["Add product"])])),
    field("Notes", notes),
    el("div", { class: "foot" }, [save, el("button", { class: "link-btn", type: "button", onclick: () => opts.mount.replaceChildren() }, ["Cancel"])])
  ]);
  opts.mount.replaceChildren(form);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ============================ TO-DO ============================ */
let todoShell = null;
async function renderTodo(keep) {
  // `keep` = refresh the list in place after an action (no flash back to "Loading…").
  if (!keep || !todoShell || !todoShell.alive()) {
    const history = el("a", { class: "link-btn", target: "_blank", rel: "noopener", hidden: true }, ["Printed history ↗"]);
    todoShell = screen("To-do", history);
    todoShell.history = history;
    // The printed / failed / deleted records live in the Operations spreadsheet.
    if (State.sheetUrl) { history.href = State.sheetUrl; history.hidden = false; }
    else api("systemStatus").then(st => { if (st.ok && st.sheets && st.sheets.ops && st.sheets.ops.url) { State.sheetUrl = st.sheets.ops.url; history.href = State.sheetUrl; history.hidden = false; } });
  }
  const s = todoShell;
  const r = await api("todo");
  if (!s.alive()) return;
  if (!r.ok) { s.body.replaceChildren(); return fail(r); }
  State.materials = r.materials;
  if (!r.groups.length) return s.body.replaceChildren(el("p", { class: "empty" }, ["Nothing to print."]));
  s.body.replaceChildren(...r.groups.map(g => el("div", { class: "group" }, [
    el("div", { class: "group-head" }, [g.color ? dot(g.hex, g.color) : anyDot(), el("span", {}, [g.label]), el("span", { class: "w" }, [g.grams ? grams(g.grams) : ""])]),
    ...g.pieces.map(p => todoCard(p, s))
  ])));
}
function todoCard(p, s) {
  const prepared = p.status === "prepared" || p.status === "printing";
  let card;
  const run = async (action, data, okMsg) => {
    card.classList.add("busy");
    const r = await api(action, data);
    if (!r.ok) { card.classList.remove("busy"); fail(r); return r; }
    if (okMsg || r.warning) toast(r.warning || okMsg, r.warning ? "err" : "");
    renderTodo(true);
    return r;
  };
  const rollsFor = () => State.materials.filter(m => !p.material || m.material === p.material);
  const needsRoll = p.anyColor || !p.material;

  const weight = el("input", { type: "number", min: "0", step: "1", value: p.grams === "" ? "" : p.grams, placeholder: "—", title: "Weight in grams",
    onchange: async () => { const r = await run("setGrams", { id: p.id, grams: weight.value }); if (r.ok) p.grams = weight.value === "" ? "" : Number(weight.value); } });
  const details = el("div", { class: "details", hidden: true }, [
    p.link ? el("div", {}, ["Link: ", el("a", { href: p.link, target: "_blank", rel: "noopener", onclick: e => e.stopPropagation() }, [p.link])]) : null,
    el("div", {}, ["Order #" + p.orderNo + " · " + p.orderType + " · price " + euro(p.orderPrice)]),
    el("div", {}, ["Added " + new Date(p.created).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })]),
    p.orderNotes ? el("div", {}, ["Notes: " + p.orderNotes]) : null
  ]);

  async function printed() {
    const w = Number(weight.value || 0);
    if (!(w > 0)) { weight.classList.add("missing"); weight.focus(); return toast("Enter the weight in grams before marking it as printed.", "err"); }
    if (String(weight.value) !== String(p.grams)) { const g = await api("setGrams", { id: p.id, grams: w }); if (!g.ok) return fail(g); p.grams = w; }
    let a = await dialog(needsRoll ? { title: "Which roll did you use?", text: p.name + " — " + w + " g will be deducted from it.", rolls: rollsFor(), ok: "Mark as printed" }
      : { title: 'Mark "' + p.name + '" as printed?', text: w + " g will be deducted from " + p.material + " " + p.color + ".", ok: "Mark as printed" });
    if (!a) return;
    let r = await api("printPiece", { id: p.id, roll: a.roll });
    if (!r.ok && r.error === "roll") { a = await dialog({ title: "Which roll did you use?", text: p.material + " " + p.color + " is not in Materials.", rolls: rollsFor(), ok: "Mark as printed" }); if (!a) return; r = await api("printPiece", { id: p.id, roll: a.roll }); }
    if (!r.ok) return fail(r);
    toast(r.warning || "Printed. Stock updated.", r.warning ? "err" : ""); renderTodo(true);
  }
  async function failed() {
    const a = await dialog({ title: "Failed print", text: "How much filament was lost? It is deducted from stock and recorded; the product stays in the to-do.", input: { label: "Grams lost", placeholder: "g" }, rolls: needsRoll ? rollsFor() : null, ok: "Record" });
    if (!a) return;
    const tx = newId();
    let r = await api("failPiece", { id: p.id, grams: a.value, roll: a.roll, tx });
    if (!r.ok && r.error === "roll") { const b = await dialog({ title: "Which roll did you use?", rolls: rollsFor(), ok: "Record" }); if (!b) return; r = await api("failPiece", { id: p.id, grams: a.value, roll: b.roll, tx }); }
    if (!r.ok) return fail(r);
    toast(a.value + " g recorded as lost."); renderTodo(true);
  }

  card = el("div", { class: "todo" + (prepared ? " prepared" : ""), onclick: () => { details.hidden = !details.hidden; } }, [
    el("div", { class: "card-main" }, [
      el("div", { class: "tags" }, [el("span", { class: "tag" }, ["#" + p.orderNo + " · " + p.orderType]), prepared ? el("span", { class: "tag ok" }, ["Prepared"]) : null]),
      el("div", { class: "card-title" }, [p.name + (p.copies > 1 ? "  × " + p.copies : "")]),
      el("div", { class: "card-meta" }, [p.material ? (p.material + " · " + (p.anyColor ? "Color not important" : p.color)) : "Material not set"]),
      details
    ]),
    el("label", { class: "weight", onclick: e => e.stopPropagation() }, [weight, "g"]),
    el("div", { class: "actions" }, [
      icon("edit", "Edit", () => editFromTodo(p, s)),
      icon("check", prepared ? "Prepared — click to undo" : "Mark as prepared for printing", () => run("setPrepared", { id: p.id, on: !prepared }), prepared ? "on" : ""),
      icon("printed", "Mark as printed", printed),
      icon("failed", "Failed print — record lost filament", failed),
      icon("x", "Delete", async () => { if (await dialog({ title: 'Remove "' + p.name + '" from the to-do?', ok: "Remove" })) run("deletePiece", { id: p.id }, "Removed."); }, "danger")
    ])
  ]);
  return card;
}
// Pencil on a card: open that product's whole order, with the weight column.
async function editFromTodo(p, s) {
  const [r] = await Promise.all([api("listOrders"), State.products.length ? null : loadProducts()]);
  if (!r.ok) return fail(r);
  const order = r.data.find(o => o.key === p.orderKey);
  if (!order) return toast("That order is no longer open.", "err");
  orderForm(order, { mount: s.form, done: () => renderTodo(true), weights: true });
}

/* ============================ MATERIALS ============================ */
// Several rows can be opened with the pencil (or added) and are saved together in one go.
async function renderMaterials() {
  const editing = [];
  const save = el("button", { class: "btn", hidden: true, onclick: saveAll }, ["Save changes"]);
  const cancel = el("button", { class: "link-btn", hidden: true, onclick: renderMaterials }, ["Cancel"]);
  const s = screen("Materials", cancel, save, el("button", { class: "btn ghost", onclick: () => editRow(null) }, ["New material"]));
  const r = await loadMaterials();
  if (!s.alive()) return;
  if (!r.ok) { s.body.replaceChildren(); return fail(r); }
  const sections = {};
  s.body.replaceChildren(...MATERIAL_TYPES.map(type => {
    const items = State.materials.filter(m => m.material === type);
    sections[type] = el("div", { class: "list" }, items.length ? items.map(row) : []);
    return el("div", { class: "mat-section" }, [el("h2", {}, [type]), sections[type]]);
  }));

  function bar() { save.hidden = cancel.hidden = !editing.length; save.textContent = "Save changes (" + editing.length + ")"; }
  function row(m) {
    const node = el("div", { class: "mat" }, [
      el("span", { class: "type" }, [m.material]), dot(m.hex, m.color), el("span", {}, [m.color]),
      el("span", { class: "num" }, [grams(m.grams)]), el("span", { class: "cost" }, [m.costPerRoll === "" ? "— / roll" : euro(m.costPerRoll) + " / roll"]),
      el("div", { class: "actions" }, [
        icon("cart", "Add a roll to the to-buy list", async () => { const b = await api("repurchase", { id: m.id }); if (!b.ok) return fail(b); toast("1 roll of " + m.material + " " + m.color + " added to the to-buy list."); }),
        icon("edit", "Edit", () => editRow(m, node)),
        icon("x", "Delete", async () => {
          if (!(await dialog({ title: "Delete " + m.material + " " + m.color + "?", ok: "Delete" }))) return;
          const d = await api("deleteMaterial", { id: m.id }); if (!d.ok) return fail(d);
          toast("Deleted."); renderMaterials();
        }, "danger")
      ])
    ]);
    return node;
  }
  // An editable row: a new material (top of its section) or an existing one after the pencil.
  function editRow(m, replace) {
    const isNew = !m;
    m = m || { id: "", material: "PLA", color: "", hex: "#000000", grams: "", costPerRoll: "" };
    const type = el("select", {}, MATERIAL_TYPES.map(t => el("option", { value: t, selected: m.material === t }, [t])));
    const color = text(m.color, "Color name");
    const hex = el("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(m.hex) ? m.hex : "#cccccc", title: "Pick the color" });
    const g = number(m.grams, "grams"), cost = number(m.costPerRoll, "€ / roll", "0.01");
    const entry = { read: () => ({ id: m.id, material: type.value, color: color.value.trim(), hex: hex.value, grams: g.value, costPerRoll: cost.value }) };
    const node = el("div", { class: "mat editing" }, [type, hex, color, g, cost,
      el("div", { class: "actions" }, [icon("x", "Discard this change", () => { editing.splice(editing.indexOf(entry), 1); isNew ? node.remove() : node.replaceWith(row(m)); bar(); })])]);
    editing.push(entry); bar();
    if (replace) return replace.replaceWith(node);
    const place = () => sections[type.value].prepend(node);
    type.addEventListener("change", place); place(); color.focus();
  }
  async function saveAll() {
    const list = editing.map(e => e.read());
    if (list.some(m => !m.color)) return toast("Every material needs a color name.", "err");
    save.disabled = true; save.textContent = "Saving…";
    const res = await api("saveMaterials", { list });
    save.disabled = false;
    if (!res.ok) { bar(); return fail(res); }
    toast("Saved."); renderMaterials();
  }
}

/* ============================ WEBSITE · HIGHLIGHTS ============================ */
// The products featured on the home page and at the top of the shop, in order.
async function renderHighlights() {
  const save = el("button", { class: "btn", onclick: saveAll }, ["Save"]);
  const s = screen("Highlights", el("button", { class: "btn ghost", onclick: () => { rows.push(blank()); draw(); } }, ["Add highlight"]), save);
  const rows = [];
  const blank = () => ({ id: "", before: null, image: "", headline: text("", "Big headline"), body: el("textarea", { placeholder: "A couple of lines under the headline" }) });
  const r = await loadProducts();
  if (!s.alive()) return;
  if (!r.ok) { s.body.replaceChildren(); return fail(r); }
  State.products.filter(p => p.featured).sort((a, b) => (Number(a.heroOrder) || 99) - (Number(b.heroOrder) || 99)).forEach(p =>
    rows.push({ id: p.id, before: p, image: p.heroImage, headline: text(p.headline.en, "Big headline"), body: el("textarea", { placeholder: "A couple of lines under the headline" }, [p.heroText.en]) }));

  function draw() {
    if (!rows.length) return s.body.replaceChildren(el("p", { class: "empty" }, ["No highlights. The website shows the first products instead."]));
    s.body.replaceChildren(
      el("p", { class: "hint", style: "margin-bottom:16px" }, ["The large word behind the picture is the product's Internal ID. Without a highlight picture, the product's first picture is used."]),
      ...rows.map((h, i) => {
        const select = el("select", { onchange: () => { h.id = select.value; } }, [el("option", { value: "" }, ["Choose a product…"])].concat(State.products.map(p => el("option", { value: p.id, selected: h.id === p.id }, [p.name.en || p.id]))));
        const thumb = el("div", { class: "thumb", style: "width:96px;height:96px" }, [h.image ? el("img", { src: h.image, alt: "" }) : "no picture"]);
        const file = el("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => { if (!file.files[0]) return; toast("Uploading picture…"); try { const u = await uploadPicture(file.files[0]); if (u) { h.image = u; draw(); toast("Picture uploaded."); } } catch (e) { toast("That picture could not be read.", "err"); } } });
        return el("div", { class: "panel" }, [
          el("div", { class: "cols c2" }, [field("Product", select), field("Headline", h.headline)]),
          field("Text", h.body),
          el("div", { style: "display:flex;align-items:center;gap:14px;flex-wrap:wrap" }, [thumb, file,
            el("button", { type: "button", class: "btn ghost", onclick: () => file.click() }, ["Highlight picture"]),
            h.image ? el("button", { type: "button", class: "link-btn", onclick: () => { h.image = ""; draw(); } }, ["Remove picture"]) : null,
            el("div", { class: "actions", style: "margin-left:auto" }, [
              icon("up", "Move up", () => { if (i > 0) { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); draw(); } }),
              icon("down", "Move down", () => { if (i < rows.length - 1) { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); draw(); } }),
              icon("x", "Remove highlight", () => { rows.splice(i, 1); draw(); }, "danger")
            ])
          ])
        ]);
      }));
  }
  draw();
  async function saveAll() {
    if (rows.some(h => !h.id)) return toast("Choose a product for every highlight.", "err");
    if (new Set(rows.map(h => h.id)).size !== rows.length) return toast("A product can only be highlighted once.", "err");
    const list = rows.map(h => ({ id: h.id, image: h.image,
      headline: languages(h.headline.value.trim(), h.before && h.before.id === h.id ? h.before.headline : null),
      text: languages(h.body.value.trim(), h.before && h.before.id === h.id ? h.before.heroText : null) }));
    save.disabled = true; save.textContent = "Saving…";
    const res = await api("saveHighlights", { list });
    save.disabled = false; save.textContent = "Save";
    if (!res.ok) return fail(res);
    toast(res.message || "Saved. The website updates in 1–2 minutes.", res.message ? "err" : ""); renderHighlights();
  }
}

/* ============================ WEBSITE · CLIENTS ============================ */
// People who created an account on the website. Information only.
async function renderClients() {
  const s = screen("Clients");
  const r = await api("listClients");
  if (!s.alive()) return;
  if (!r.ok) { s.body.replaceChildren(); return fail(r); }
  if (!r.accounts.length) return s.body.replaceChildren(el("p", { class: "empty" }, ["No client accounts yet."]));
  const day = d => { const t = new Date(d); return isNaN(t) ? "" : t.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
  s.body.replaceChildren(el("table", { class: "table" }, [
    el("thead", {}, [el("tr", {}, ["Name", "Email", "Phone", "Address", "Since"].map(h => el("th", {}, [h])))]),
    el("tbody", {}, r.accounts.map(a => el("tr", {}, [a.name, a.email, a.phone, a.address, day(a.created)].map(v => el("td", {}, [v || "—"])))))
  ]));
}
