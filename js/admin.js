/* ============================================================
   Internal management — four sections, nothing else:
     Products   what is sold on the website
     Orders     Yerai enters what has to be made
     To-do      Albert's printing queue, grouped by material + colour
     Materials  filament left, in grams
   The engine (Apps Script) does all the work; this file only draws
   the screens and calls it through Admin.call(action, data).
   ============================================================ */

const MATERIAL_TYPES = ["PLA", "PETG", "ABS"];
const ORDER_TYPES = ["Product", "Prototype", "Personal"];
const State = { products: [], materials: [] };

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
  (children || []).forEach(c => { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return n;
}
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const grams = n => (n === "" || n == null) ? "—" : Number(n).toLocaleString("en-US") + " g";
const euro = n => (n === "" || n == null) ? "—" : Number(n).toFixed(2) + " €";
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)));

let toastTimer;
function toast(text, kind) {
  const t = $("admin-toast");
  t.textContent = text; t.className = "admin-toast" + (kind ? " " + kind : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, kind === "err" ? 6000 : 3000);
}
// Call the engine; turn connection problems into plain English.
async function api(action, data) {
  const r = await Admin.call(action, data);
  if (!r.ok && r.error === "auth") { Admin.clear(); location.href = "acceso.html"; }
  if (!r.ok && (r.error === "network" || r.error === "parse" || r.error === "noapi")) r.message = "Could not reach the server. Check the connection and try again.";
  return r;
}
const fail = r => toast(r.message || "Something went wrong. Please try again.", "err");

/* ---------- icons (inline SVG, 18px) ---------- */
const svg = d => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
const ICON = {
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  printed: svg('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  cart: svg('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12h11.2L21 7H6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>')
};
function iconBtn(icon, title, onclick, cls) {
  return el("button", { type: "button", class: "mg-icon" + (cls ? " " + cls : ""), title: title, "aria-label": title, html: ICON[icon], onclick: e => { e.stopPropagation(); onclick(e); } });
}
const dot = hex => el("span", { class: "mg-dot", style: "background:" + (hex || "#ccc") });

/* ============================ START ============================ */
document.addEventListener("DOMContentLoaded", async () => {
  if (!(await Admin.requireLogin())) return;
  $("admin-who").textContent = (Admin.user && (Admin.user.name || Admin.user.email)) || "";
  $("btn-logout").addEventListener("click", () => { Admin.clear(); location.href = "acceso.html"; });
  document.querySelectorAll("#admin-nav button").forEach(b => b.addEventListener("click", () => show(b.dataset.view)));
  let last = "todo"; try { last = sessionStorage.getItem("ppt-view") || "todo"; } catch (e) {}
  show(last);
});
const VIEWS = { products: renderProducts, orders: renderOrders, todo: renderTodo, materials: renderMaterials };
function show(view) {
  if (!VIEWS[view]) view = "todo";
  try { sessionStorage.setItem("ppt-view", view); } catch (e) {}
  document.querySelectorAll("#admin-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  Object.keys(VIEWS).forEach(v => { $("view-" + v).hidden = v !== view; });
  VIEWS[view]();
}
function head(title, button) {
  return el("div", { class: "admin-head" }, [el("h1", {}, [title]), button || null]);
}
const loading = () => el("p", { class: "admin-empty" }, ["Loading…"]);
async function loadMaterials() { const r = await api("listMaterials"); if (r.ok) State.materials = r.data; return r; }
async function loadProducts() { const r = await api("listProducts"); if (r.ok) State.products = r.data; return r; }

/* ============================ PRODUCTS ============================ */
async function renderProducts() {
  const v = $("view-products");
  v.replaceChildren(head("Products", el("button", { class: "btn", onclick: () => productForm(null) }, ["New product"])), el("div", { id: "p-form" }), el("div", { id: "p-list", class: "admin-list" }, [loading()]));
  const r = await loadProducts();
  const list = $("p-list");
  if (!r.ok) { list.replaceChildren(); return fail(r); }
  if (!State.products.length) { list.replaceChildren(el("p", { class: "admin-empty" }, ["No products yet."])); return; }
  list.replaceChildren(...State.products.map(p => el("div", { class: "adm-card" }, [
    el("div", { class: "adm-card-img" }, [p.image ? el("img", { src: p.image, alt: "" }) : el("span", {}, ["no picture"])]),
    el("div", { class: "adm-card-main" }, [
      el("div", { class: "adm-card-name" }, [p.name.en || p.id]),
      el("div", { class: "adm-card-meta" }, [(p.code ? p.code + " · " : "") + euro(p.price) + (p.printTime !== "" ? " · " + p.printTime + " min" : "")])
    ]),
    el("div", { class: "mg-actions" }, [
      iconBtn("edit", "Edit", () => productForm(p)),
      iconBtn("x", "Delete", async () => {
        if (!confirm('Delete "' + (p.name.en || p.id) + '"? It will be removed from the website.')) return;
        const d = await api("deleteProduct", { id: p.id });
        if (!d.ok) return fail(d);
        toast(d.message || "Deleted. The website updates in 1–2 minutes.", d.message ? "err" : "ok"); renderProducts();
      }, "danger")
    ])
  ])));
}

// A small rich-text box: bold, italic and bullet points.
function richText(html) {
  const box = el("div", { class: "mg-rich", contenteditable: "true", html: html || "" });
  const cmd = (c, label, title) => el("button", { type: "button", class: "mg-rich-btn", title: title, onmousedown: e => { e.preventDefault(); document.execCommand(c); box.focus(); } }, [label]);
  const wrap = el("div", { class: "mg-rich-wrap" }, [el("div", { class: "mg-rich-bar" }, [cmd("bold", "B", "Bold"), cmd("italic", "I", "Italic"), cmd("insertUnorderedList", "• List", "Bullet points")]), box]);
  wrap.value = () => (box.textContent.trim() ? box.innerHTML : "");
  return wrap;
}
// Shrink a photo in the browser before uploading (phone pictures are huge).
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}
function productForm(p) {
  const isNew = !p;
  p = p || { id: "", code: "", name: {}, price: "", printTime: "", short: {}, description: {}, image: "" };
  const field = (label, input) => el("div", { class: "adm-field" }, [el("label", {}, [label]), input]);
  const txt = (val, ph) => el("input", { type: "text", value: val || "", placeholder: ph || "" });
  const name = txt(p.name.en), code = txt(p.code);
  const price = el("input", { type: "number", step: "0.01", min: "0", value: p.price });
  const time = el("input", { type: "number", step: "1", min: "0", value: p.printTime, placeholder: "minutes" });
  const short = txt(p.short.en), long = richText(p.description.en);
  let image = p.image || "";
  const preview = el("div", { class: "adm-card-img mg-preview" }, [image ? el("img", { src: image, alt: "" }) : el("span", {}, ["no picture"])]);
  const file = el("input", { type: "file", accept: "image/*", onchange: async () => {
    if (!file.files[0]) return;
    toast("Uploading picture…");
    try {
      const data = await shrinkImage(file.files[0]);
      const u = await api("uploadImage", { dataBase64: data, filename: file.files[0].name.replace(/\.\w+$/, "") + ".jpg", mimeType: "image/jpeg" });
      if (!u.ok) return fail(u);
      image = u.url; preview.replaceChildren(el("img", { src: image, alt: "" })); toast("Picture uploaded.", "ok");
    } catch (e) { toast("That picture could not be read.", "err"); }
  } });
  // Translations: empty = translated automatically when saving.
  const tr = {
    name: { ca: txt(p.name.ca), es: txt(p.name.es) }, short: { ca: txt(p.short.ca), es: txt(p.short.es) },
    description: { ca: richText(p.description.ca), es: richText(p.description.es) }
  };
  const trBox = el("details", { class: "mg-tr" }, [
    el("summary", {}, ["Translations (optional — filled in automatically when left empty)"]),
    el("div", { class: "adm-grid-2" }, [field("Name — Catalan", tr.name.ca), field("Name — Spanish", tr.name.es)]),
    el("div", { class: "adm-grid-2" }, [field("Short description — Catalan", tr.short.ca), field("Short description — Spanish", tr.short.es)]),
    field("Long description — Catalan", tr.description.ca), field("Long description — Spanish", tr.description.es)
  ]);
  const save = el("button", { class: "btn", type: "submit" }, ["Save"]);
  const form = el("form", { class: "adm-editor mg-form", onsubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()) return toast("Enter the product name.", "err");
    // If the English text changed and its translation was left as it was, translate again.
    const lang = (key, enNow, input) => {
      const out = { en: enNow };
      ["ca", "es"].forEach(l => {
        const now = input[l].value instanceof Function ? input[l].value() : input[l].value.trim();
        const before = (p[key] && p[key][l]) || "", enBefore = (p[key] && p[key].en) || "";
        out[l] = (!isNew && enNow !== enBefore && now === before) ? "" : now;
      });
      return out;
    };
    const product = { id: p.id, code: code.value.trim(), price: price.value, printTime: time.value, image: image,
      name: lang("name", name.value.trim(), tr.name), short: lang("short", short.value.trim(), tr.short), description: lang("description", long.value(), tr.description) };
    save.disabled = true; save.textContent = "Saving…";
    const r = await api("saveProduct", { product });
    save.disabled = false; save.textContent = "Save";
    if (!r.ok) return fail(r);
    toast(r.message || "Saved. The website updates in 1–2 minutes.", r.message ? "err" : "ok");
    renderProducts();
  } }, [
    el("h2", { class: "mg-form-title" }, [isNew ? "New product" : "Edit product"]),
    field("Name", name), field("Internal ID", code),
    el("div", { class: "adm-grid-2" }, [field("Price (€)", price), field("Printing time (minutes)", time)]),
    field("Short description", short), field("Long description", long),
    field("Picture", el("div", { class: "mg-pic" }, [preview, file])),
    trBox,
    el("div", { class: "mg-form-foot" }, [save, el("button", { class: "btn-text", type: "button", onclick: () => $("p-form").replaceChildren() }, ["Cancel"])])
  ]);
  $("p-form").replaceChildren(form);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ============================ ORDERS ============================ */
async function renderOrders() {
  const v = $("view-orders");
  v.replaceChildren(head("Orders", el("button", { class: "btn", onclick: () => orderForm(null, { mount: $("o-form"), done: renderOrders }) }, ["New order"])), el("div", { id: "o-form" }), el("div", { id: "o-list", class: "admin-list" }, [loading()]));
  const [r] = await Promise.all([api("listOrders"), loadProducts(), loadMaterials()]);
  const list = $("o-list");
  if (!r.ok) { list.replaceChildren(); return fail(r); }
  if (!r.data.length) { list.replaceChildren(el("p", { class: "admin-empty" }, ["No open orders."])); return; }
  list.replaceChildren(...r.data.map(o => el("div", { class: "adm-card mg-order" }, [
    el("div", { class: "adm-card-main" }, [
      el("div", { class: "adm-card-name" }, ["#" + o.no + " · " + o.type + (o.price !== "" ? " · " + euro(o.price) : "")]),
      el("div", { class: "adm-card-meta" }, [o.pieces.map(p => (p.copies > 1 ? p.copies + "× " : "") + p.name + " (" + (p.material || "material not set") + (p.material ? " " + (p.anyColor ? "any color" : p.color) : "") + ")").join(" · ") || "—"]),
      o.notes ? el("div", { class: "adm-card-meta" }, [o.notes]) : null,
      o.printed ? el("div", { class: "adm-card-meta" }, [o.printed + " already printed"]) : null
    ]),
    el("div", { class: "mg-actions" }, [
      iconBtn("edit", "Edit", () => orderForm(o, { mount: $("o-form"), done: renderOrders })),
      iconBtn("x", "Delete order", async () => {
        if (!confirm("Delete order #" + o.no + "? Its products leave the to-do list.")) return;
        const d = await api("deleteOrder", { key: o.key });
        if (!d.ok) return fail(d);
        toast("Order deleted.", "ok"); renderOrders();
      }, "danger")
    ])
  ])));
}

// Colour choice for one product line: the colours in stock for that material, as circles,
// plus "Color not important".
function colorPicker(line, onChange) {
  const box = el("div", { class: "mg-colors" });
  const draw = () => {
    const stock = State.materials.filter(m => m.material === line.material);
    const chips = stock.map(m => ({ label: m.color, hex: m.hex, on: !line.anyColor && line.color.toLowerCase() === m.color.toLowerCase(), pick: () => { line.color = m.color; line.anyColor = false; } }));
    if (!line.anyColor && line.color && !stock.some(m => m.color.toLowerCase() === line.color.toLowerCase()))
      chips.push({ label: line.color + " (not in stock)", hex: "", on: true, pick: () => {} });
    chips.push({ label: "Color not important", any: true, on: line.anyColor, pick: () => { line.anyColor = true; line.color = ""; } });
    box.replaceChildren(...chips.map(c => el("button", { type: "button", class: "mg-chip" + (c.on ? " on" : ""), onclick: () => { c.pick(); draw(); onChange && onChange(); } },
      [c.any ? el("span", { class: "mg-dot mg-dot-any" }) : dot(c.hex), c.label])));
  };
  draw(); box.redraw = draw;
  return box;
}

// The order form. Used for a new order, for editing one, and (with the weight column)
// from the To-do pencil. The order key is created here, once, so saving twice by mistake
// updates the same order instead of creating another.
function orderForm(order, opts) {
  const isNew = !order;
  const key = isNew ? newId() : order.key;
  const lines = isNew ? [] : order.pieces.map(p => Object.assign({}, p));
  const type = el("select", {}, ORDER_TYPES.map(t => el("option", { value: t, selected: !isNew && order.type === t }, [t])));
  const price = el("input", { type: "number", step: "0.01", min: "0", value: isNew ? "" : order.price, placeholder: "agreed price" });
  const notes = el("textarea", { placeholder: "Anything Albert should know: several parts, special requirements…" }, [isNew ? "" : order.notes]);
  const rows = el("div", { class: "mg-lines" });

  function lineRow(line) {
    const product = el("select", {}, [el("option", { value: "" }, ["— External link / other —"])].concat(State.products.map(p => el("option", { value: p.id, selected: line.productId === p.id }, [p.name.en || p.id]))));
    const name = el("input", { type: "text", value: line.name || "", placeholder: "Product name" });
    const link = el("input", { type: "text", value: line.link || "", placeholder: "MakerWorld / Thingiverse link (optional)" });
    const material = el("select", {}, [el("option", { value: "" }, ["Material…"])].concat(MATERIAL_TYPES.map(m => el("option", { value: m, selected: line.material === m }, [m]))));
    const copies = el("input", { type: "number", min: "1", step: "1", value: line.copies || 1, class: "mg-small" });
    const weight = el("input", { type: "number", min: "0", step: "1", value: line.grams === "" || line.grams == null ? "" : line.grams, class: "mg-small", placeholder: "g" });
    const colors = colorPicker(line);
    product.addEventListener("change", () => {
      line.productId = product.value;
      const p = State.products.find(x => x.id === product.value);
      if (p) { name.value = p.name.en || p.id; line.name = name.value; }
    });
    name.addEventListener("input", () => { line.name = name.value; });
    link.addEventListener("input", () => { line.link = link.value; });
    copies.addEventListener("input", () => { line.copies = copies.value; });
    weight.addEventListener("input", () => { line.grams = weight.value; });
    material.addEventListener("change", () => { line.material = material.value; if (!line.anyColor) line.color = ""; colors.redraw(); });
    const row = el("div", { class: "mg-line" }, [
      el("div", { class: "mg-line-top" }, [product, name, iconBtn("x", "Remove this product", () => { lines.splice(lines.indexOf(line), 1); row.remove(); }, "danger")]),
      link,
      el("div", { class: "mg-line-mat" }, [material, el("label", { class: "mg-inline" }, ["Copies", copies]), opts.weights ? el("label", { class: "mg-inline" }, ["Weight (g)", weight]) : null]),
      colors
    ]);
    return row;
  }
  const addLine = () => { const line = { id: newId(), productId: "", name: "", link: "", material: "", color: "", anyColor: false, copies: 1, grams: "" }; lines.push(line); rows.appendChild(lineRow(line)); };
  lines.forEach(l => rows.appendChild(lineRow(l)));
  if (isNew) addLine();

  const save = el("button", { class: "btn", type: "submit" }, ["Save order"]);
  const form = el("form", { class: "adm-editor mg-form", onsubmit: async e => {
    e.preventDefault();
    if (save.disabled) return;
    if (!lines.length) return toast("Add at least one product.", "err");
    for (const l of lines) {
      if (!String(l.name || "").trim()) return toast("Every product needs a name.", "err");
      if (!l.material) return toast('Choose a material for "' + l.name + '".', "err");
      if (!l.anyColor && !l.color) return toast('Choose a color (or "Color not important") for "' + l.name + '".', "err");
    }
    save.disabled = true; save.textContent = "Saving…";
    const r = await api("saveOrder", { order: { key, type: type.value, price: price.value, notes: notes.value, pieces: lines } });
    save.disabled = false; save.textContent = "Save order";
    if (!r.ok) return fail(r);
    toast(r.created ? "Order #" + r.no + " added to the to-do list." : "Order #" + r.no + " updated.", "ok");
    opts.mount.replaceChildren(); opts.done();
  } }, [
    el("h2", { class: "mg-form-title" }, [isNew ? "New order" : "Edit order #" + order.no]),
    el("div", { class: "adm-grid-2" }, [
      el("div", { class: "adm-field" }, [el("label", {}, ["Order type"]), type]),
      el("div", { class: "adm-field" }, [el("label", {}, ["Price (€)"]), price])
    ]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Products"]), rows, el("button", { type: "button", class: "btn-outline mg-add", onclick: addLine }, ["+ Add product"])]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Notes"]), notes]),
    el("div", { class: "mg-form-foot" }, [save, el("button", { class: "btn-text", type: "button", onclick: () => opts.mount.replaceChildren() }, ["Cancel"])])
  ]);
  opts.mount.replaceChildren(form);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ============================ TO-DO ============================ */
async function renderTodo() {
  const v = $("view-todo");
  if (!$("t-list")) v.replaceChildren(head("To-do"), el("div", { id: "t-form" }), el("div", { id: "t-list" }, [loading()]));
  const r = await api("todo");
  const list = $("t-list");
  if (!r.ok) { list.replaceChildren(); return fail(r); }
  State.materials = r.materials;
  if (!r.groups.length) { list.replaceChildren(el("p", { class: "admin-empty" }, ["Nothing to print. 🎉"])); return; }
  list.replaceChildren(...r.groups.map(g => el("div", { class: "mg-group" }, [
    el("div", { class: "mg-group-head" }, [g.color ? dot(g.hex) : el("span", { class: "mg-dot mg-dot-any" }), el("strong", {}, [g.label]), el("span", { class: "mg-group-w" }, [g.grams ? grams(g.grams) : ""])]),
    ...g.pieces.map(p => todoCard(p, g))
  ])));
}
function todoCard(p, g) {
  const prepared = p.status === "prepared" || p.status === "printing";
  const weight = el("input", { type: "number", min: "0", step: "1", class: "mg-weight", value: p.grams === "" ? "" : p.grams, placeholder: "g", title: "Weight in grams",
    onclick: e => e.stopPropagation(),
    onchange: async () => { const r = await api("setGrams", { id: p.id, grams: weight.value }); if (!r.ok) return fail(r); p.grams = weight.value === "" ? "" : Number(weight.value); renderTodo(); } });
  const details = el("div", { class: "mg-details", hidden: true }, [
    p.link ? el("div", {}, ["Link: ", el("a", { href: p.link, target: "_blank", rel: "noopener", onclick: e => e.stopPropagation() }, [p.link])]) : null,
    el("div", {}, ["Order #" + p.orderNo + " · " + p.orderType + " · price " + euro(p.orderPrice)]),
    el("div", {}, ["Added " + new Date(p.created).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })]),
    p.orderNotes ? el("div", {}, ["Notes: " + p.orderNotes]) : null
  ]);
  return el("div", { class: "mg-card" + (prepared ? " prepared" : ""), onclick: () => { details.hidden = !details.hidden; } }, [
    el("div", { class: "mg-card-main" }, [
      el("div", { class: "mg-card-top" }, [el("span", { class: "mg-tag" }, ["#" + p.orderNo + " · " + p.orderType]), prepared ? el("span", { class: "mg-tag ok" }, ["Prepared"]) : null]),
      el("div", { class: "mg-card-name" }, [p.name + (p.copies > 1 ? "  × " + p.copies : "")]),
      el("div", { class: "mg-card-meta" }, [p.material ? (p.material + " · " + (p.anyColor ? "Color not important" : p.color)) : "Material not set"]),
      details
    ]),
    el("label", { class: "mg-weight-wrap", onclick: e => e.stopPropagation() }, [weight, "g"]),
    el("div", { class: "mg-actions" }, [
      iconBtn("edit", "Edit", () => editFromTodo(p)),
      iconBtn("check", prepared ? "Prepared — click to undo" : "Mark as prepared for printing", async () => { const r = await api("setPrepared", { id: p.id, on: !prepared }); if (!r.ok) return fail(r); renderTodo(); }, prepared ? "on" : ""),
      iconBtn("printed", "Mark as printed", () => markPrinted(p, g, weight)),
      iconBtn("x", "Delete", async () => {
        if (!confirm('Remove "' + p.name + '" from the to-do list?')) return;
        const r = await api("deletePiece", { id: p.id }); if (!r.ok) return fail(r);
        toast("Removed.", "ok"); renderTodo();
      }, "danger")
    ])
  ]);
}
// Pencil on a card: open that product's whole order, with the weight column.
async function editFromTodo(p) {
  const [r] = await Promise.all([api("listOrders"), State.products.length ? null : loadProducts()]);
  if (!r.ok) return fail(r);
  const order = r.data.find(o => o.key === p.orderKey);
  if (!order) return toast("That order is no longer open.", "err");
  orderForm(order, { mount: $("t-form"), done: renderTodo, weights: true });
}
// Ask which roll was really used (for "color not important" or a colour not in stock).
function chooseRoll(p) {
  return new Promise(resolve => {
    const stock = State.materials.filter(m => !p.material || m.material === p.material);
    const close = v => { overlay.remove(); resolve(v); };
    const overlay = el("div", { class: "mg-overlay", onclick: () => close("") }, [
      el("div", { class: "mg-dialog", onclick: e => e.stopPropagation() }, [
        el("h3", {}, ["Which roll did you use?"]),
        el("p", { class: "adm-card-meta" }, [p.name + " — " + p.grams + " g will be deducted from it."]),
        el("div", { class: "mg-colors" }, stock.length ? stock.map(m => el("button", { type: "button", class: "mg-chip", onclick: () => close(m.id) }, [dot(m.hex), m.material + " " + m.color + " (" + grams(m.grams) + ")"])) : [el("p", {}, ["No " + (p.material || "") + " in Materials. Add it first."])]),
        el("button", { type: "button", class: "btn-text", onclick: () => close("") }, ["Cancel"])
      ])
    ]);
    document.body.appendChild(overlay);
  });
}
async function markPrinted(p, g, weightInput) {
  const w = Number(weightInput.value || p.grams || 0);
  if (!(w > 0)) { weightInput.classList.add("missing"); weightInput.focus(); return toast("Enter the weight in grams before marking it as printed.", "err"); }
  if (String(weightInput.value) !== String(p.grams)) { const s = await api("setGrams", { id: p.id, grams: w }); if (!s.ok) return fail(s); p.grams = w; }
  let roll = "";
  if (p.anyColor || !p.material) { roll = await chooseRoll(p); if (!roll) return; }
  else if (!confirm('Mark "' + p.name + '" as printed?\n' + w + " g will be deducted from " + p.material + " " + p.color + ".")) return;
  let r = await api("printPiece", { id: p.id, roll });
  if (!r.ok && r.error === "roll") { roll = await chooseRoll(p); if (!roll) return; r = await api("printPiece", { id: p.id, roll }); }
  if (!r.ok) return fail(r);
  toast(r.warning || "Printed. Stock updated.", r.warning ? "err" : "ok");
  renderTodo();
}

/* ============================ MATERIALS ============================ */
async function renderMaterials() {
  const v = $("view-materials");
  v.replaceChildren(head("Materials", el("button", { class: "btn", onclick: () => materialRow(null) }, ["New material"])), el("div", { id: "m-list" }, [loading()]));
  const r = await loadMaterials();
  if (!r.ok) { $("m-list").replaceChildren(); return fail(r); }
  $("m-list").replaceChildren(...MATERIAL_TYPES.map(type => {
    const items = State.materials.filter(m => m.material === type);
    return el("div", { class: "mg-mat-section" }, [
      el("h2", { class: "mg-mat-title" }, [type]),
      el("div", { class: "mg-mat-rows", id: "m-rows-" + type }, items.length ? items.map(matRow) : [el("p", { class: "admin-empty mg-mat-empty" }, ["No " + type + " yet."])])
    ]);
  }));
}
function matRow(m) {
  return el("div", { class: "mg-mat" }, [
    el("span", { class: "mg-mat-type" }, [m.material]), dot(m.hex), el("span", { class: "mg-mat-name" }, [m.color]),
    el("span", { class: "mg-mat-g" }, [grams(m.grams)]), el("span", { class: "mg-mat-cost" }, [m.costPerRoll === "" ? "— / roll" : euro(m.costPerRoll) + " / roll"]),
    el("div", { class: "mg-actions" }, [
      iconBtn("cart", "Add a roll to the to-buy list", async () => { const r = await api("repurchase", { id: m.id }); if (!r.ok) return fail(r); toast("1 roll of " + m.material + " " + m.color + " added to the to-buy list.", "ok"); }),
      iconBtn("edit", "Edit", e => materialRow(m, e.currentTarget.closest(".mg-mat"))),
      iconBtn("x", "Delete", async () => {
        if (!confirm("Delete " + m.material + " " + m.color + "?")) return;
        const r = await api("deleteMaterial", { id: m.id }); if (!r.ok) return fail(r);
        toast("Deleted.", "ok"); renderMaterials();
      }, "danger")
    ])
  ]);
}
// An editable row: a new material (added at the top of its section) or an existing one
// after pressing the pencil.
function materialRow(m, replaceEl) {
  const isNew = !m;
  m = m || { id: "", material: "PLA", color: "", hex: "#000000", grams: "", costPerRoll: "" };
  const type = el("select", {}, MATERIAL_TYPES.map(t => el("option", { value: t, selected: m.material === t }, [t])));
  const color = el("input", { type: "text", value: m.color, placeholder: "Color name (e.g. Black)" });
  const hex = el("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(m.hex) ? m.hex : "#cccccc", title: "Pick the color" });
  const g = el("input", { type: "number", min: "0", step: "1", value: m.grams, placeholder: "grams" });
  const cost = el("input", { type: "number", min: "0", step: "0.01", value: m.costPerRoll, placeholder: "€ per roll" });
  const save = el("button", { type: "submit", class: "btn" }, ["Save"]);
  const row = el("form", { class: "mg-mat mg-mat-edit", onsubmit: async e => {
    e.preventDefault();
    if (!color.value.trim()) return toast("Enter the color name.", "err");
    save.disabled = true;
    const r = await api("saveMaterial", { material: { id: m.id, material: type.value, color: color.value.trim(), hex: hex.value, grams: g.value, costPerRoll: cost.value } });
    save.disabled = false;
    if (!r.ok) return fail(r);
    toast(r.merged ? "Added to the existing " + type.value + " " + color.value.trim() + "." : "Saved.", "ok");
    renderMaterials();
  } }, [type, hex, color, g, cost, save, el("button", { type: "button", class: "btn-text", onclick: renderMaterials }, ["Cancel"])]);
  if (replaceEl) { replaceEl.replaceWith(row); return; }
  // New: sits at the top of the section of its type and follows the type if it changes.
  const place = () => { const box = $("m-rows-" + type.value); const empty = box.querySelector(".mg-mat-empty"); if (empty) empty.remove(); box.prepend(row); };
  type.addEventListener("change", place);
  place(); color.focus();
}
