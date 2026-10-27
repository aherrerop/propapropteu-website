/* ============================================================
   Client portal — my orders, invoices, re-order, my details.
   Shares the login/session with the manager dashboard; the API
   decides what a client may see.
   ============================================================ */

const $ = id => document.getElementById(id);
let ACCOUNT = { profile: {}, orders: [] };

function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") n.className = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  (children || []).forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}
function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fmtDate(s) { const d = new Date(s); return isNaN(d) ? String(s).slice(0, 16) : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }); }
let toastTimer;
function toast(msg, kind) { const t = $("admin-toast"); t.textContent = msg; t.className = "admin-toast" + (kind ? " " + kind : ""); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 4000); }

document.addEventListener("DOMContentLoaded", async () => {
  if (!Admin.token) { location.href = "acceso.html"; return; }
  const r = await Admin.call("myAccount");
  if (!r.ok) {
    if (r.error === "auth" && Admin.user && Admin.user.role === "manager") { location.href = "admin.html"; return; }
    Admin.clear(); location.href = "acceso.html"; return;
  }
  ACCOUNT = r;
  $("client-who").textContent = "Hola, " + (r.profile.name || r.profile.email || "");
  $("btn-logout").addEventListener("click", () => { Admin.clear(); location.href = "acceso.html"; });
  document.querySelectorAll("#client-nav button").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
  renderOrders();
  renderProfile();
});

function switchView(v) {
  document.querySelectorAll("#client-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $("view-orders").hidden = v !== "orders";
  $("view-profile").hidden = v !== "profile";
}

function renderOrders() {
  const v = $("view-orders");
  v.innerHTML = '<div class="admin-head"><h1>Mis pedidos</h1></div>';
  if (!ACCOUNT.orders.length) {
    v.insertAdjacentHTML("beforeend", '<p class="admin-empty">Todavía no tienes pedidos. <a href="shop.html">Ir a la tienda</a>.</p>');
    return;
  }
  const list = el("div", { class: "admin-list" });
  ACCOUNT.orders.forEach(o => list.appendChild(orderCard(o)));
  v.appendChild(list);
}

function orderCard(o) {
  const items = o.items.map(i => i.qty + "× " + escapeHtml(i.name)).join(", ");
  const actions = el("div", { class: "adm-card-actions" }, [
    el("button", { class: "btn-outline", onclick: () => reorder(o.id) }, ["Volver a pedir"]),
    el("button", { class: "btn-text", onclick: (e) => invoice(o.id, e.target) }, ["Factura"])
  ]);
  return el("div", { class: "adm-card" }, [
    el("div", { class: "adm-card-main" }, [
      el("div", { class: "adm-card-name", html: escapeHtml(o.id) + ' · <span class="adm-id">' + escapeHtml(o.status) + "</span>" }),
      el("div", { class: "adm-card-meta", html: fmtDate(o.date) + " · " + items }),
      el("div", { class: "adm-card-meta", html: "<strong>" + o.revenue.toFixed(2) + " €</strong> (IVA incl.)" })
    ]),
    actions
  ]);
}

async function reorder(id) {
  toast("Enviando…");
  const r = await Admin.call("reorder", { id });
  if (!r.ok) { toast(r.message || "No se ha podido.", "err"); return; }
  toast("Pedido enviado. Te contactamos para confirmar.", "ok");
  const a = await Admin.call("myAccount"); if (a.ok) { ACCOUNT = a; renderOrders(); }
}

async function invoice(id, btn) {
  const old = btn.textContent; btn.disabled = true; btn.textContent = "…";
  const r = await Admin.call("getInvoice", { id });
  btn.disabled = false; btn.textContent = old;
  if (!r.ok) { toast(r.message || "No disponible.", "err"); return; }
  window.open(r.url, "_blank", "noopener");
}

function renderProfile() {
  const p = ACCOUNT.profile || {};
  const v = $("view-profile");
  v.innerHTML = '<div class="admin-head"><h1>Mis datos</h1></div>';
  const f = (id, label, val, type) => el("div", { class: "adm-field" }, [el("label", {}, [label]), el("input", { id, type: type || "text", value: val || "" })]);
  const form = el("form", { class: "adm-editor", onsubmit: saveProfile }, [
    el("div", { class: "adm-grid-2" }, [f("p-name", "Nombre", p.name), f("p-phone", "Teléfono", p.phone)]),
    el("div", { class: "adm-field" }, [el("label", {}, ["Dirección de envío"]), el("textarea", { id: "p-address" }, [p.address || ""])]),
    f("p-pass", "Nueva contraseña (opcional)", "", "password"),
    el("div", { class: "adm-field" }, [el("label", {}, ["Correo"]), el("input", { id: "p-email", type: "email", value: p.email || "", disabled: "" })]),
    el("button", { class: "btn", type: "submit" }, ["Guardar"]),
    el("p", { class: "form-status", id: "p-status", hidden: "" })
  ]);
  v.appendChild(form);
}

async function saveProfile(e) {
  e.preventDefault();
  const status = $("p-status");
  const data = {
    name: $("p-name").value.trim(),
    phone: $("p-phone").value.trim(),
    address: $("p-address").value.trim()
  };
  const pass = $("p-pass").value;
  if (pass) data.password = pass;
  const r = await Admin.call("updateProfile", { data });
  if (r.ok) { status.textContent = "Datos guardados."; status.className = "form-status ok"; ACCOUNT.profile = Object.assign(ACCOUNT.profile, data); }
  else { status.textContent = r.message || "Error."; status.className = "form-status err"; }
  status.hidden = false;
}
