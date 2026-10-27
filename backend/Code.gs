/**
 * Prop a Prop Teu — manager backend (Google Apps Script web app).
 *
 * One web app handles login + product management for the static site.
 * Deploy as a Web app, "Execute as: Me", "Who has access: Anyone".
 * All setup steps are in backend/SETUP.md.
 *
 * Browser talks to this with plain-text JSON POST bodies (a "simple request",
 * so there is no CORS preflight). Every response is JSON.
 *
 * Script Properties required (Project Settings > Script properties):
 *   SESSION_SECRET  random long string, signs session tokens
 *   GH_TOKEN        GitHub fine-grained PAT, this repo only, Contents: read/write
 *   GH_OWNER        e.g. AlbertHerreroParareda (the repo owner / org)
 *   GH_REPO         propapropteu-website
 *   GH_BRANCH       main
 *   DRIVE_FOLDER_ID id of the Drive folder that holds product images
 */

var SHEET_MANAGERS = 'Managers';
var SHEET_CLIENTS = 'Clients';
var SHEET_PRODUCTS = 'Products';
var SHEET_MATERIALS = 'Materials';
var SHEET_ORDERS = 'Orders';
var SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

/* ============================ ROUTER ============================ */

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var action = req.action;

    // Public actions: login + contact form + place an order.
    if (action === 'login') return json(login(req));
    if (action === 'register') return json(register(req));
    if (action === 'contact') return json(contact(req));
    if (action === 'placeOrder') return json(placeOrder(req));

    // Everything else needs a valid session token.
    var session = verifyToken(req.token);
    if (!session) return json({ ok: false, error: 'auth', message: 'Sessió no vàlida o caducada.' });

    switch (action) {
      case 'me':           return json({ ok: true, user: session });
      case 'myAccount':    return json(myAccount(session));
      case 'updateProfile':return json(updateProfile(session, req.data || req));
      case 'reorder':      return json(reorder(session, req.id));
      case 'getInvoice':   return json(getInvoice(session, req.id));
      case 'listProducts': return json({ ok: true, data: readProducts() });
      case 'saveProduct':  return json(saveProduct(req.product));
      case 'deleteProduct':return json(deleteProduct(req.id));
      case 'uploadImage':  return json(uploadImage(req));
      case 'publish':      return json(publish(session));
      case 'listOrders':   return json({ ok: true, data: readOrders() });
      case 'setOrderStatus': return json(setOrderStatus(req.id, req.status));
      case 'deleteOrder':  return json(deleteOrder(req.id));
      case 'listMessages':   return json({ ok: true, data: readMessages() });
      case 'deleteMessage':  return json(deleteMessage(req.row));
      case 'listMaterials':  return json({ ok: true, data: readMaterials() });
      case 'saveMaterial':   return json(saveMaterial(req.material));
      case 'deleteMaterial': return json(deleteMaterial(req.id));
      case 'summary':        return json({ ok: true, data: summary() });
      default:             return json({ ok: false, error: 'unknown_action', message: 'Acció desconeguda: ' + action });
    }
  } catch (err) {
    return json({ ok: false, error: 'server', message: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: 'propapropteu-admin', time: new Date().toISOString() });
}

/* ===================== CONTACT / QUOTE FORM ===================== */
/* Public: website contact + custom-prop quote forms post here. Each message is
   stored in the "Messages" sheet tab and emailed to the business. */
function contact(req) {
  var name = String(req.name || '').trim();
  var email = String(req.email || '').trim();
  var message = String(req.message || '').trim();
  if (req.company_hp) return { ok: true };                 // honeypot: silently accept bots
  if (!name || !email || !message) return { ok: false, error: 'missing', message: 'Falten camps obligatoris.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'email', message: 'Email no vàlid.' };
  if (message.length > 5000) message = message.slice(0, 5000);

  var source = String(req.source || 'contacte');
  var phone = String(req.phone || '').trim();
  var company = String(req.company || '').trim();
  var extra = String(req.extra || '').trim();

  var sh = ensureMessagesSheet();
  sh.appendRow([new Date(), source, name, email, phone, company, message + (extra ? ('\n\n' + extra) : '')]);

  try {
    MailApp.sendEmail({
      to: 'info@propapropteu.com',
      replyTo: email,
      subject: '[Web · ' + source + '] ' + name,
      body: 'Nom: ' + name + '\nEmail: ' + email + '\nTelèfon: ' + phone +
            '\nEmpresa: ' + company + '\nOrigen: ' + source +
            (extra ? ('\n' + extra) : '') + '\n\nMissatge:\n' + message
    });
  } catch (e) { /* email optional; the row is the durable record */ }

  return { ok: true, message: 'Missatge enviat. Gràcies, et responem aviat.' };
}

function ensureMessagesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Messages');
  if (!sh) {
    sh = ss.insertSheet('Messages');
    sh.appendRow(['date', 'source', 'name', 'email', 'phone', 'company', 'message']);
  }
  return sh;
}
// Manager: list contact/quote messages (newest first), with their sheet row number.
function readMessages() {
  var sh = ensureMessagesSheet();
  var v = sh.getDataRange().getValues(), col = indexMap(v[0]), out = [];
  for (var i = v.length - 1; i >= 1; i--) {
    var r = v[i]; if (!String(r[col.email] || r[col.name] || '').trim()) continue;
    out.push({ row: i + 1, date: r[col.date] ? String(r[col.date]) : '', source: String(r[col.source] || ''),
      name: String(r[col.name] || ''), email: String(r[col.email] || ''), phone: String(r[col.phone] || ''),
      company: String(r[col.company] || ''), message: String(r[col.message] || '') });
  }
  return out;
}
function deleteMessage(row) {
  row = Number(row); if (!row || row < 2) return { ok: false, error: 'bad', message: 'Fila no vàlida.' };
  ensureMessagesSheet().deleteRow(row);
  return { ok: true };
}

/* Sheet menu: adds "Prop a Prop Teu > Publicar al web" so managers can publish
   straight from the spreadsheet, without opening the dashboard. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Prop a Prop Teu')
    .addItem('Publicar al web', 'menuPublish')
    .addToUi();
}

function menuPublish() {
  var ui = SpreadsheetApp.getUi();
  var who = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || 'sheet-menu';
  var r = publish({ email: who });
  ui.alert(r.ok ? r.message : ('No s’ha pogut publicar: ' + r.message));
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================ AUTH ============================ */

function login(req) {
  var email = String(req.email || '').trim().toLowerCase();
  var password = String(req.password || '');
  if (!email || !password) return { ok: false, error: 'missing', message: 'Falta email o contrasenya.' };

  // Managers first, then clients.
  var row = findManager(email);
  if (!row || row.active === false) row = findClient(email);
  if (!row || row.active === false) return { ok: false, error: 'badcreds', message: 'Credencials incorrectes.' };

  var hash = sha256Hex(row.salt + password);
  if (hash !== row.hash) return { ok: false, error: 'badcreds', message: 'Credencials incorrectes.' };

  var user = { email: email, name: row.name, role: row.role || 'manager' };
  return { ok: true, token: makeToken(user), user: user };
}

function findManager(email) {
  var sh = sheet(SHEET_MANAGERS);
  var values = sh.getDataRange().getValues();
  var head = values[0];
  var col = indexMap(head); // email, salt, hash, name, role, active
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[col.email] || '').trim().toLowerCase() === email) {
      return {
        email: email,
        salt: String(r[col.salt] || ''),
        hash: String(r[col.hash] || ''),
        name: String(r[col.name] || ''),
        role: String(r[col.role] || 'manager'),
        active: String(r[col.active]).toLowerCase() !== 'false' && r[col.active] !== false
      };
    }
  }
  return null;
}

/* ---------- Clients (customer accounts) ---------- */
var CLIENT_COLS = ['email', 'salt', 'hash', 'name', 'phone', 'address', 'active', 'created'];
function ensureClientsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_CLIENTS);
  if (!sh) { sh = ss.insertSheet(SHEET_CLIENTS); sh.appendRow(CLIENT_COLS); return sh; }
  var n = CLIENT_COLS.length;
  var head = sh.getLastColumn() >= n ? sh.getRange(1, 1, 1, n).getValues()[0] : [];
  if (!CLIENT_COLS.every(function (k, i) { return String(head[i] || '').trim() === k; }))
    sh.getRange(1, 1, 1, n).setValues([CLIENT_COLS]);
  return sh;
}
function findClient(email) {
  var sh = ensureClientsSheet();
  var v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][col.email] || '').trim().toLowerCase() === email) {
      return {
        email: email, salt: String(v[i][col.salt] || ''), hash: String(v[i][col.hash] || ''),
        name: String(v[i][col.name] || ''), phone: String(v[i][col.phone] || ''),
        address: String(v[i][col.address] || ''), role: 'client',
        active: String(v[i][col.active]).toLowerCase() !== 'false' && v[i][col.active] !== false, row: i + 1
      };
    }
  }
  return null;
}
// Public: a customer creates an account.
function register(req) {
  var email = String(req.email || '').trim().toLowerCase();
  var password = String(req.password || '');
  var name = String(req.name || '').trim();
  if (!email || !password || !name) return { ok: false, error: 'missing', message: 'Falten nom, email o contrasenya.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'email', message: 'Email no vàlid.' };
  if (password.length < 6) return { ok: false, error: 'weak', message: 'La contrasenya ha de tenir 6 caràcters o més.' };
  if (findManager(email) || findClient(email)) return { ok: false, error: 'exists', message: 'Ja existeix un compte amb aquest email.' };
  var salt = Utilities.getUuid(), hash = sha256Hex(salt + password);
  ensureClientsSheet().appendRow([email, salt, hash, name, String(req.phone || ''), String(req.address || ''), true, new Date()]);
  var user = { email: email, name: name, role: 'client' };
  return { ok: true, token: makeToken(user), user: user };
}
// Client: update own profile (name/phone/address; optional new password).
function updateProfile(session, data) {
  if (!session || session.role !== 'client') return { ok: false, error: 'auth', message: 'Només clients.' };
  var c = findClient(session.email); if (!c) return { ok: false, error: 'notfound', message: 'Compte no trobat.' };
  var sh = ensureClientsSheet(), col = indexMap(sh.getDataRange().getValues()[0]);
  if (data.name != null) sh.getRange(c.row, col.name + 1).setValue(String(data.name).trim());
  if (data.phone != null) sh.getRange(c.row, col.phone + 1).setValue(String(data.phone).trim());
  if (data.address != null) sh.getRange(c.row, col.address + 1).setValue(String(data.address).trim());
  if (data.password && String(data.password).length >= 6) {
    var salt = Utilities.getUuid();
    sh.getRange(c.row, col.salt + 1).setValue(salt);
    sh.getRange(c.row, col.hash + 1).setValue(sha256Hex(salt + String(data.password)));
  }
  return { ok: true };
}
// Client: fetch my profile + my orders.
function myAccount(session) {
  if (!session || session.role !== 'client') return { ok: false, error: 'auth', message: 'Només clients.' };
  var c = findClient(session.email) || {};
  var mine = readOrders().filter(function (o) { return String(o.email).trim().toLowerCase() === session.email; });
  return { ok: true, profile: { email: session.email, name: c.name || session.name, phone: c.phone || '', address: c.address || '' }, orders: mine };
}
// Client: re-order a previous order's items.
function reorder(session, orderId) {
  if (!session || session.role !== 'client') return { ok: false, error: 'auth', message: 'Només clients.' };
  var o = readOrders().filter(function (x) { return x.id === orderId && String(x.email).trim().toLowerCase() === session.email; })[0];
  if (!o) return { ok: false, error: 'notfound', message: 'Comanda no trobada.' };
  var c = findClient(session.email) || {};
  return placeOrder({ name: c.name || session.name, email: session.email, phone: c.phone || '',
    payment: 'transfer', items: o.items.map(function (i) { return { id: i.id, qty: i.qty }; }), note: 'Re-comanda de ' + orderId });
}

/* Stateless signed token: base64(payloadJson).hmacHex  */
function makeToken(user) {
  var payload = { email: user.email, name: user.name, role: user.role, exp: Date.now() + SESSION_TTL_MS };
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  return body + '.' + hmacHex(body);
}

function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  var parts = token.split('.');
  var body = parts[0], sig = parts[1];
  if (hmacHex(body) !== sig) return null;
  try {
    var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return { email: payload.email, name: payload.name, role: payload.role };
  } catch (e) { return null; }
}

/* ======================= PRODUCTS (Sheet) ======================= */
/*
 * Products tab, one row per product. Multilingual / structured fields are
 * stored as JSON strings in a single cell so the schema matches products.json.
 * Columns: id | type | price | stock | featured | codename |
 *          labels(json) | images(json) | name(json) | short(json) |
 *          description(json) | heroTagline(json) | heroDesc(json) | specs(json)
 */
var PRODUCT_COLS = ['id','type','price','cost','stock','featured','cutout','codename','heroImage',
  'labels','images','name','short','description','heroTagline','heroDesc','specs','bom'];
var PRODUCT_JSON_COLS = ['labels','images','name','short','description','heroTagline','heroDesc','specs','bom'];

/* Guarantee the Products header row is exactly PRODUCT_COLS, in order.
   This makes the backend immune to missing/renamed/reordered headers. */
function ensureProductHeaders() {
  var sh = sheet(SHEET_PRODUCTS);
  var n = PRODUCT_COLS.length;
  var head = sh.getLastColumn() >= n ? sh.getRange(1, 1, 1, n).getValues()[0] : [];
  var ok = PRODUCT_COLS.every(function (k, i) { return String(head[i] || '').trim() === k; });
  if (!ok) sh.getRange(1, 1, 1, n).setValues([PRODUCT_COLS]);
}

function readProducts() {
  var sh = sheet(SHEET_PRODUCTS);
  ensureProductHeaders();
  var values = sh.getDataRange().getValues();
  var head = values[0];
  var col = indexMap(head);
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!String(r[col.id] || '').trim()) continue;
    out.push(rowToProduct(r, col));
  }
  return out;
}

function rowToProduct(r, col) {
  var p = {};
  p.id = String(r[col.id]).trim();
  p.type = String(r[col.type] || 'own').trim();
  p.price = Number(r[col.price] || 0);
  if (col.cost != null && String(r[col.cost]) !== '') p.cost = Number(r[col.cost]);
  if (String(r[col.stock]) !== '') p.stock = Number(r[col.stock]);
  if (String(r[col.featured]).toLowerCase() === 'true' || r[col.featured] === true) p.featured = true;
  if (col.cutout != null && (String(r[col.cutout]).toLowerCase() === 'true' || r[col.cutout] === true)) p.cutout = true;
  if (String(r[col.codename] || '').trim()) p.codename = String(r[col.codename]).trim();
  if (col.heroImage != null && String(r[col.heroImage] || '').trim()) p.heroImage = String(r[col.heroImage]).trim();
  PRODUCT_JSON_COLS.forEach(function (k) {
    if (col[k] == null) return;
    var raw = String(r[col[k]] || '').trim();
    if (!raw) return;
    try { p[k] = JSON.parse(raw); } catch (e) { /* skip malformed */ }
  });
  return p;
}

function saveProduct(product) {
  if (!product || !product.id) return { ok: false, error: 'missing', message: 'Falta id de producte.' };
  var id = String(product.id).trim();
  var sh = sheet(SHEET_PRODUCTS);
  ensureProductHeaders();
  var values = sh.getDataRange().getValues();
  var head = values[0];
  var col = indexMap(head);

  var rowArr = PRODUCT_COLS.map(function (k) {
    if (col[k] == null) return '';
    if (k === 'featured') return product.featured ? true : false;
    if (k === 'cutout') return product.cutout ? true : false;
    if (k === 'stock') return (product.stock === '' || product.stock == null) ? '' : Number(product.stock);
    if (k === 'price') return Number(product.price || 0);
    if (k === 'cost') return (product.cost === '' || product.cost == null) ? '' : Number(product.cost);
    if (PRODUCT_JSON_COLS.indexOf(k) >= 0) return product[k] != null ? JSON.stringify(product[k]) : '';
    return product[k] != null ? product[k] : '';
  });

  // Update existing row or append.
  var foundRow = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][col.id] || '').trim() === id) { foundRow = i + 1; break; }
  }
  if (foundRow > 0) {
    sh.getRange(foundRow, 1, 1, rowArr.length).setValues([rowArr]);
  } else {
    sh.appendRow(rowArr);
  }
  return { ok: true, id: id };
}

function deleteProduct(id) {
  id = String(id || '').trim();
  if (!id) return { ok: false, error: 'missing', message: 'Falta id.' };
  var sh = sheet(SHEET_PRODUCTS);
  var values = sh.getDataRange().getValues();
  var col = indexMap(values[0]);
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][col.id] || '').trim() === id) { sh.deleteRow(i + 1); return { ok: true, id: id }; }
  }
  return { ok: false, error: 'notfound', message: 'Producte no trobat: ' + id };
}

/* ======================= MATERIALS (inventory) ======================= */
/* Materials tab: filament/materials stock in grams, by material + colour.
   Columns: material | color | stock(g) | costPerGram(€) | lowAt(g) | updated */
var MATERIAL_COLS = ['material', 'color', 'stock', 'costPerGram', 'lowAt', 'updated'];

function ensureMaterialsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_MATERIALS);
  if (!sh) { sh = ss.insertSheet(SHEET_MATERIALS); sh.appendRow(MATERIAL_COLS); return sh; }
  var n = MATERIAL_COLS.length;
  var head = sh.getLastColumn() >= n ? sh.getRange(1, 1, 1, n).getValues()[0] : [];
  if (!MATERIAL_COLS.every(function (k, i) { return String(head[i] || '').trim() === k; }))
    sh.getRange(1, 1, 1, n).setValues([MATERIAL_COLS]);
  return sh;
}
function matId(material, color) {
  return (String(material || '').trim() + '|' + String(color || '').trim()).toLowerCase();
}
function readMaterials() {
  var sh = ensureMaterialsSheet();
  var v = sh.getDataRange().getValues(), col = indexMap(v[0]), out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; if (!String(r[col.material] || '').trim()) continue;
    out.push({
      id: matId(r[col.material], r[col.color]),
      material: String(r[col.material]).trim(), color: String(r[col.color] || '').trim(),
      stock: Number(r[col.stock] || 0), costPerGram: Number(r[col.costPerGram] || 0),
      lowAt: Number(r[col.lowAt] || 0), updated: r[col.updated] ? String(r[col.updated]) : ''
    });
  }
  return out;
}
function saveMaterial(m) {
  if (!m || !String(m.material || '').trim()) return { ok: false, error: 'missing', message: 'Falta el material.' };
  var sh = ensureMaterialsSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  var key = matId(m.material, m.color);
  var row = [String(m.material).trim(), String(m.color || '').trim(), Number(m.stock || 0), Number(m.costPerGram || 0), Number(m.lowAt || 0), new Date()];
  for (var i = 1; i < v.length; i++)
    if (matId(v[i][col.material], v[i][col.color]) === key) { sh.getRange(i + 1, 1, 1, row.length).setValues([row]); return { ok: true, id: key }; }
  sh.appendRow(row); return { ok: true, id: key };
}
function deleteMaterial(id) {
  var sh = ensureMaterialsSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = v.length - 1; i >= 1; i--)
    if (matId(v[i][col.material], v[i][col.color]) === id) { sh.deleteRow(i + 1); return { ok: true }; }
  return { ok: false, error: 'notfound', message: 'Material no trobat.' };
}
// Subtract grams from a material/colour on an order; returns remaining, or null if untracked.
function deductMaterial(material, color, grams) {
  var sh = ensureMaterialsSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  var key = matId(material, color);
  for (var i = 1; i < v.length; i++)
    if (matId(v[i][col.material], v[i][col.color]) === key) {
      var next = Number(v[i][col.stock] || 0) - grams;
      sh.getRange(i + 1, col.stock + 1).setValue(next);
      sh.getRange(i + 1, col.updated + 1).setValue(new Date());
      return next;
    }
  return null;
}

/* ======================= ORDERS ======================= */
var ORDER_COLS = ['date', 'id', 'status', 'payment', 'name', 'email', 'phone', 'units', 'revenue', 'cost', 'profit', 'items', 'note', 'invoiceNo'];
function ensureOrdersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) { sh = ss.insertSheet(SHEET_ORDERS); sh.appendRow(ORDER_COLS); return sh; }
  var n = ORDER_COLS.length;
  var head = sh.getLastColumn() >= n ? sh.getRange(1, 1, 1, n).getValues()[0] : [];
  if (!ORDER_COLS.every(function (k, i) { return String(head[i] || '').trim() === k; }))
    sh.getRange(1, 1, 1, n).setValues([ORDER_COLS]);
  return sh;
}
// Public: a customer places an order (no payment). Records it, computes profit,
// deducts material inventory per each product's bill-of-materials, emails the shop.
function placeOrder(req) {
  var items = req.items;
  if (!items || !items.length) return { ok: false, error: 'missing', message: 'Comanda buida.' };
  var name = String(req.name || '').trim(), email = String(req.email || '').trim();
  if (!name || !email) return { ok: false, error: 'missing', message: 'Falten nom o email.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'email', message: 'Email no vàlid.' };

  var byId = {}; readProducts().forEach(function (p) { byId[p.id] = p; });
  var lines = [], units = 0, revenue = 0, cost = 0, lowFlags = [];
  for (var i = 0; i < items.length; i++) {
    var p = byId[items[i].id]; if (!p) continue;
    var qty = Math.max(1, Math.floor(Number(items[i].qty || 1)));
    units += qty; revenue += p.price * qty; cost += (p.cost || 0) * qty;
    lines.push({ id: p.id, name: (p.name && (p.name.ca || p.name.es || p.name.en)) || p.id, qty: qty, price: p.price, cost: p.cost || 0 });
    if (p.bom && p.bom.length) p.bom.forEach(function (b) {
      var rem = deductMaterial(b.material, b.color, Number(b.grams || 0) * qty);
      if (rem != null && rem < 0) lowFlags.push(b.material + ' ' + b.color);
    });
  }
  if (!lines.length) return { ok: false, error: 'noitems', message: 'Cap producte vàlid a la comanda.' };

  var profit = revenue - cost;
  var payment = (String(req.payment || 'transfer') === 'card') ? 'card' : 'transfer';
  var status = payment === 'transfer' ? 'pendent pagament' : 'nou';
  var id = 'ORD-' + Utilities.formatDate(new Date(), 'GMT+1', 'yyMMdd-HHmmss');
  ensureOrdersSheet().appendRow([new Date(), id, status, payment, name, email, String(req.phone || ''), units, revenue, cost, profit, JSON.stringify(lines), String(req.note || ''), '']);
  try {
    MailApp.sendEmail({
      to: 'info@propapropteu.com', replyTo: email, subject: '[Comanda ' + id + '] ' + name,
      body: 'Nova comanda ' + id + '\nClient: ' + name + ' <' + email + '> ' + (req.phone || '') + '\n\n' +
            lines.map(function (l) { return l.qty + 'x ' + l.name + ' (' + l.price + ' €)'; }).join('\n') +
            '\n\nIngressos: ' + revenue.toFixed(2) + ' €\nCost: ' + cost.toFixed(2) + ' €\nBenefici: ' + profit.toFixed(2) + ' €' +
            (req.note ? ('\n\nNota: ' + req.note) : '') + (lowFlags.length ? ('\n\nMaterial sota mínim: ' + lowFlags.join(', ')) : '')
    });
  } catch (e) { /* email optional */ }
  // Confirmation to the customer
  try {
    MailApp.sendEmail({
      to: email, name: 'Prop a Prop Teu', replyTo: 'info@propapropteu.com',
      subject: 'Hemos recibido tu pedido (' + id + ') — Prop a Prop Teu',
      body: 'Hola ' + name + ',\n\nGracias por tu pedido. Lo hemos recibido correctamente y te contactaremos en breve para confirmar el pago y la entrega.\n\n' +
            'Pedido ' + id + ':\n' + lines.map(function (l) { return '· ' + l.qty + 'x ' + l.name + ' — ' + (l.price * l.qty).toFixed(2) + ' €'; }).join('\n') +
            '\n\nTotal: ' + revenue.toFixed(2) + ' € (IVA incl.)' +
            '\n\nSi tienes cualquier duda, responde a este correo o escríbenos a info@propapropteu.com.\n\nUn saludo,\nEl equipo de Prop a Prop Teu'
    });
  } catch (e) { /* customer email optional */ }
  return { ok: true, id: id, message: 'Comanda rebuda. Et contactem per confirmar.' };
}
function readOrders() {
  var sh = ensureOrdersSheet();
  var v = sh.getDataRange().getValues(), col = indexMap(v[0]), out = [];
  for (var i = v.length - 1; i >= 1; i--) {
    var r = v[i]; if (!String(r[col.id] || '').trim()) continue;
    var items = []; try { items = JSON.parse(r[col.items] || '[]'); } catch (e) {}
    out.push({
      date: r[col.date] ? String(r[col.date]) : '', id: String(r[col.id]), status: String(r[col.status] || 'nou'),
      payment: col.payment != null ? String(r[col.payment] || '') : '',
      name: String(r[col.name] || ''), email: String(r[col.email] || ''), phone: String(r[col.phone] || ''),
      units: Number(r[col.units] || 0), revenue: Number(r[col.revenue] || 0), cost: Number(r[col.cost] || 0),
      profit: Number(r[col.profit] || 0), items: items, note: String(r[col.note] || ''),
      invoiceNo: col.invoiceNo != null ? String(r[col.invoiceNo] || '') : ''
    });
  }
  return out;
}
function setOrderStatus(id, status) {
  id = String(id || '').trim();
  var sh = ensureOrdersSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = 1; i < v.length; i++)
    if (String(v[i][col.id] || '').trim() === id) { sh.getRange(i + 1, col.status + 1).setValue(String(status || 'nou')); return { ok: true }; }
  return { ok: false, error: 'notfound', message: 'Comanda no trobada.' };
}
// Removes an order row. Does NOT restock materials (do that manually if needed).
function deleteOrder(id) {
  id = String(id || '').trim();
  var sh = ensureOrdersSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = v.length - 1; i >= 1; i--)
    if (String(v[i][col.id] || '').trim() === id) { sh.deleteRow(i + 1); return { ok: true }; }
  return { ok: false, error: 'notfound', message: 'Comanda no trobada.' };
}
/* ---------- Invoices (VAT PDF) ---------- */
function fiscalData() {
  return {
    name: prop('FISCAL_NAME') || '[NOMBRE FISCAL / AUTÓNOMO]',
    nif: prop('FISCAL_NIF') || '[NIF]',
    addr: prop('FISCAL_ADDR') || '[DIRECCIÓN FISCAL COMPLETA]',
    email: 'info@propapropteu.com'
  };
}
function assignInvoiceNo(orderId) {
  var sh = ensureOrdersSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][col.id] || '').trim() === orderId) {
      var cur = String(v[i][col.invoiceNo] || '').trim();
      if (cur) return cur;
      var props = PropertiesService.getScriptProperties();
      var seq = Number(props.getProperty('INVOICE_SEQ') || '0') + 1;
      props.setProperty('INVOICE_SEQ', String(seq));
      var no = 'F' + new Date().getFullYear() + '-' + ('0000' + seq).slice(-4);
      sh.getRange(i + 1, col.invoiceNo + 1).setValue(no);
      return no;
    }
  }
  return null;
}
// Manager (any) or the owning client: generate/fetch a VAT invoice PDF, return its link.
function getInvoice(session, orderId) {
  var o = readOrders().filter(function (x) { return x.id === orderId; })[0];
  if (!o) return { ok: false, error: 'notfound', message: 'Comanda no trobada.' };
  if (session.role !== 'manager' && String(o.email).trim().toLowerCase() !== session.email)
    return { ok: false, error: 'auth', message: 'No autoritzat.' };

  var no = assignInvoiceNo(orderId);
  var f = fiscalData();
  var total = o.revenue, base = total / 1.21, iva = total - base;
  var rows = o.items.map(function (l) {
    var lt = l.price * l.qty;
    return '<tr><td>' + l.qty + '</td><td>' + esc(l.name) + '</td><td class="r">' + l.price.toFixed(2) + ' €</td><td class="r">' + lt.toFixed(2) + ' €</td></tr>';
  }).join('');
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  var html =
    '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#111;font-size:12px;padding:30px}' +
    'h1{font-size:20px;letter-spacing:1px}table{width:100%;border-collapse:collapse;margin-top:16px}' +
    'th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}.r{text-align:right}' +
    '.tot td{border:none;padding:3px 7px}.tot .r{font-weight:bold}.muted{color:#666}</style></head><body>' +
    '<h1>FACTURA</h1>' +
    '<p><strong>' + esc(f.name) + '</strong><br>NIF: ' + esc(f.nif) + '<br>' + esc(f.addr) + '<br>' + esc(f.email) + '</p>' +
    '<p class="muted">Factura nº <strong>' + no + '</strong> · ' + Utilities.formatDate(new Date(), 'GMT+1', 'dd/MM/yyyy') + ' · Comanda ' + esc(orderId) + '</p>' +
    '<p><strong>Cliente:</strong><br>' + esc(o.name) + '<br>' + esc(o.email) + (o.phone ? '<br>' + esc(o.phone) : '') + '</p>' +
    '<table><tr><th>Ud.</th><th>Concepto</th><th class="r">Precio</th><th class="r">Importe</th></tr>' + rows + '</table>' +
    '<table class="tot" style="width:40%;margin-left:auto;margin-top:12px">' +
    '<tr><td>Base imponible</td><td class="r">' + base.toFixed(2) + ' €</td></tr>' +
    '<tr><td>IVA (21%)</td><td class="r">' + iva.toFixed(2) + ' €</td></tr>' +
    '<tr><td><strong>TOTAL</strong></td><td class="r">' + total.toFixed(2) + ' €</td></tr></table>' +
    '<p class="muted" style="margin-top:30px">Los precios incluyen IVA. Documento generado automáticamente.</p>' +
    '</body></html>';
  var pdf = Utilities.newBlob(html, 'text/html', no + '.html').getAs('application/pdf').setName(no + ' - ' + orderId + '.pdf');

  var folderId = prop('DRIVE_FOLDER_ID');
  var parent = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  var subs = parent.getFoldersByName('Factures');
  var folder = subs.hasNext() ? subs.next() : parent.createFolder('Factures');
  var file = folder.createFile(pdf);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, invoiceNo: no, url: file.getUrl() };
}

function summary() {
  var orders = readOrders(), mats = readMaterials();
  var t = { orders: orders.length, revenue: 0, cost: 0, profit: 0, byStatus: {} };
  orders.forEach(function (o) { t.revenue += o.revenue; t.cost += o.cost; t.profit += o.profit; t.byStatus[o.status] = (t.byStatus[o.status] || 0) + 1; });
  var low = mats.filter(function (m) { return m.stock <= m.lowAt; })
    .map(function (m) { return { material: m.material, color: m.color, stock: m.stock, lowAt: m.lowAt }; });
  return { totals: t, lowMaterials: low, materialsCount: mats.length };
}

/* ======================= IMAGE UPLOAD (Drive) ======================= */

function uploadImage(req) {
  var folderId = prop('DRIVE_FOLDER_ID');
  if (!folderId) return { ok: false, error: 'config', message: 'DRIVE_FOLDER_ID no configurat.' };
  var b64 = String(req.dataBase64 || '');
  if (b64.indexOf(',') >= 0) b64 = b64.split(',')[1]; // strip data: prefix
  if (!b64) return { ok: false, error: 'missing', message: 'Falta imatge.' };

  var bytes = Utilities.base64Decode(b64);
  var name = (String(req.filename || 'img').replace(/[^\w.\-]+/g, '_')) ;
  var blob = Utilities.newBlob(bytes, req.mimeType || 'image/jpeg', name);
  var folder = DriveApp.getFolderById(folderId);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // Direct-view link that works as an <img src>.
  var url = 'https://lh3.googleusercontent.com/d/' + file.getId();
  return { ok: true, url: url, id: file.getId() };
}

/* ======================= PUBLISH (GitHub) ======================= */

function publish(session) {
  var token = prop('GH_TOKEN'), owner = prop('GH_OWNER'), repo = prop('GH_REPO');
  var branch = prop('GH_BRANCH') || 'main';
  if (!token || !owner || !repo) return { ok: false, error: 'config', message: 'GitHub no configurat (GH_TOKEN/GH_OWNER/GH_REPO).' };

  var path = 'data/products.json';
  var api = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;
  var headers = { Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };

  // Current file sha (needed to update).
  var sha = null;
  var get = UrlFetchApp.fetch(api + '?ref=' + branch, { method: 'get', headers: headers, muteHttpExceptions: true });
  if (get.getResponseCode() === 200) sha = JSON.parse(get.getContentText()).sha;

  // Build products.json, preserving the existing labels + _readme block.
  var existing = sha ? JSON.parse(Utilities.newBlob(Utilities.base64Decode(JSON.parse(get.getContentText()).content)).getDataAsString()) : {};
  // Strip internal-only fields (cost, bom) before publishing to the public site.
  var publicProducts = readProducts().map(function (p) {
    var c = {}; for (var k in p) { if (k !== 'cost' && k !== 'bom') c[k] = p[k]; } return c;
  });
  var payload = {
    _readme: existing._readme || 'Managed from the admin dashboard. Edit via acceso.html.',
    labels: existing.labels || [],
    products: publicProducts
  };
  var content = JSON.stringify(payload, null, 2) + '\n';

  var put = UrlFetchApp.fetch(api, {
    method: 'put', headers: headers, contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      message: 'Publish products.json via admin (' + session.email + ')',
      content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
      sha: sha || undefined,
      branch: branch
    })
  });
  var code = put.getResponseCode();
  if (code === 200 || code === 201) return { ok: true, message: 'Publicat. El web s’actualitzarà en 1-2 minuts.' };
  return { ok: false, error: 'github', message: 'GitHub ' + code + ': ' + put.getContentText() };
}

/* ============================ HELPERS ============================ */

function sheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Falta la pestanya "' + name + '" al full.');
  return sh;
}

function indexMap(head) {
  var m = {};
  head.forEach(function (h, i) { m[String(h).trim()] = i; });
  return m;
}

function prop(key) { return PropertiesService.getScriptProperties().getProperty(key); }

function sha256Hex(s) {
  return toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}
function hmacHex(s) {
  var secret = prop('SESSION_SECRET') || 'change-me';
  return toHex(Utilities.computeHmacSha256Signature(s, secret, Utilities.Charset.UTF_8));
}
function toHex(bytes) {
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

/* ---- Run this ONCE from the editor to seed/update a manager account ---- */
function addManager() {
  var email = 'albert@propapropteu.com';   // <-- edit
  var name  = 'Albert Herrero';            // <-- edit
  var role  = 'manager';
  var password = 'CHANGE_ME_NOW';          // <-- edit, then delete after running

  var salt = Utilities.getUuid();
  var hash = sha256Hex(salt + password);
  var sh = sheet(SHEET_MANAGERS);
  if (sh.getLastRow() === 0) sh.appendRow(['email','salt','hash','name','role','active']);
  // Replace if the email already exists.
  var values = sh.getDataRange().getValues();
  var col = indexMap(values[0]);
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][col.email]).trim().toLowerCase() === email.toLowerCase()) {
      sh.getRange(i + 1, 1, 1, 6).setValues([[email, salt, hash, name, role, true]]);
      Logger.log('Updated ' + email); return;
    }
  }
  sh.appendRow([email, salt, hash, name, role, true]);
  Logger.log('Added ' + email);
}
