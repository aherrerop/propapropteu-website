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

// Actions that read-modify-write shared state run one-at-a-time under a script lock,
// so two managers (or a manager + a web order) can't corrupt counters, stock or ids.
var MUTATING = {
  placeOrder: 1, register: 1, reorder: 1, updateProfile: 1, getInvoice: 1,
  saveProduct: 1, deleteProduct: 1, publish: 1, setupSystem: 1, closeMonth: 1,
  setOrderStatus: 1, deleteOrder: 1, saveMaterial: 1, purchaseMaterial: 1, deleteMaterial: 1,
  saveExpense: 1, deleteExpense: 1, savePayout: 1, deletePayout: 1,
  saveJob: 1, setJobStatus: 1, deleteJob: 1, saveSettings: 1, deleteClient: 1, verifyPayment: 1,
  addManager: 1, deleteManager: 1, selfTest: 1, reconcileJobs: 1
};

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var action = req.action;
    var run = function () { return dispatch_(action, req); };
    return json(MUTATING[action] ? withLock_(run) : run());
  } catch (err) {
    return json({ ok: false, error: 'server', message: String(err) });
  }
}

// Run fn while holding the script lock; refuse politely if the system is busy.
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); }
  catch (e) { return { ok: false, error: 'busy', message: 'El sistema està ocupat un moment. Torna-ho a provar.' }; }
  try { return fn(); } finally { try { lock.releaseLock(); } catch (e) {} }
}

// Route one request to its handler, returning a plain object (json() wraps it).
function dispatch_(action, req) {
  // Public actions: login + registration + contact form + place an order.
  if (action === 'login')     return login(req);
  if (action === 'register')  return register(req);
  if (action === 'contact')   return contact(req);
  if (action === 'placeOrder')return placeOrder(req);
  if (action === 'pubinfo')   return pubinfo();
  if (action === 'verifyPayment') return verifyPayment(req);

  // Everything else needs a valid session token.
  var session = verifyToken(req.token);
  if (!session) return { ok: false, error: 'auth', message: 'Sessió no vàlida o caducada.' };

  switch (action) {
    case 'me':             return { ok: true, user: session };
    case 'setupSystem':    return setupSystem(session);
    case 'systemStatus':   return systemStatus();
    case 'myAccount':      return myAccount(session);
    case 'updateProfile':  return updateProfile(session, req.data || req);
    case 'reorder':        return reorder(session, req.id);
    case 'getInvoice':     return getInvoice(session, req.id);
    case 'listProducts':   return { ok: true, data: readProducts() };
    case 'saveProduct':    return saveProduct(req.product);
    case 'deleteProduct':  return deleteProduct(req.id);
    case 'uploadImage':    return uploadImage(req);
    case 'publish':        return publish(session);
    case 'listOrders':     return { ok: true, data: readOrders() };
    case 'setOrderStatus': return setOrderStatus(session, req.id, req.status);
    case 'deleteOrder':    return deleteOrder(session, req.id);
    case 'listMessages':   return { ok: true, data: readMessages() };
    case 'deleteMessage':  return deleteMessage(req.row);
    case 'listMaterials':  return { ok: true, data: readMaterials() };
    case 'saveMaterial':   return saveMaterial(req.material, session);
    case 'purchaseMaterial': return purchaseMaterial(session, req.purchase || req.material);
    case 'deleteMaterial': return deleteMaterial(req.id);
    case 'summary':        return { ok: true, data: summary() };
    case 'logs':           return readLogs();
    case 'listExpenses':   return readExpenses();
    case 'saveExpense':    return saveExpense(req.expense, session);
    case 'deleteExpense':  return deleteExpense(req.id);
    case 'listPayouts':    return readPayouts();
    case 'savePayout':     return savePayout(req.payout, session);
    case 'deletePayout':   return deletePayout(req.id);
    case 'pnl':            return pnl();
    case 'listMonthly':    return { ok: true, data: readMonthly_() };
    case 'closeMonth':     return closeMonthAction_(session, req.period);
    case 'listJobs':       return { ok: true, data: readJobs(req.filter) };
    case 'listJobsDone':   return { ok: true, data: readJobsDone_(req.period) };
    case 'saveJob':        return saveJob(req.job, session);
    case 'setJobStatus':   return setJobStatus(session, req.id, req.status);
    case 'deleteJob':      return deleteJob(session, req.id);
    case 'listLinks':      return readLinks();
    case 'batchPlan':      return batchPlan(req.perc);
    case 'getSettings':    return getSettings();
    case 'saveSettings':   return saveSettings(session, req.settings || req.data);
    case 'listClients':    return listClients();
    case 'deleteClient':   return deleteClient(session, req.email);
    case 'listManagers':   return listManagers();
    case 'addManager':     return addManagerAccount(session, req.manager || req.data);
    case 'deleteManager':  return deleteManager(session, req.email);
    case 'health':         return health();
    case 'listErrors':     return listErrors();
    case 'selfTest':       return selfTest(session);
    case 'reconcileJobs':  return reconcileJobs(session);
    case 'snapshot':       return snapshotAll_(session);
    default:               return { ok: false, error: 'unknown_action', message: 'Acció desconeguda: ' + action };
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
  if (!floodOk_('contact')) return { ok: false, error: 'rate', message: 'Massa peticions. Espera un moment.' };
  if (!name || !email || !message) return { ok: false, error: 'missing', message: 'Falten camps obligatoris.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'email', message: 'Email no vàlid.' };
  if (message.length > 5000) message = message.slice(0, 5000);

  var source = String(req.source || 'contacte');
  var phone = String(req.phone || '').trim();
  var company = String(req.company || '').trim();
  var extra = String(req.extra || '').trim();

  var sh = ensureMessagesSheet();
  sh.appendRow([new Date(), source, name, email, phone, company, message + (extra ? ('\n\n' + extra) : '')]);

  sendMail_({
    to: 'info@propapropteu.com',
    replyTo: email,
    subject: '[Web · ' + source + '] ' + name,
    body: 'Nom: ' + name + '\nEmail: ' + email + '\nTelèfon: ' + phone +
          '\nEmpresa: ' + company + '\nOrigen: ' + source +
          (extra ? ('\n' + extra) : '') + '\n\nMissatge:\n' + message
  }, 'contact');

  return { ok: true, message: 'Missatge enviat. Gràcies, et responem aviat.' };
}

function ensureMessagesSheet() {
  // New system: the Messages tab lives in the Config spreadsheet.
  try { return tab_('config', 'Messages'); } catch (e) {}
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
  // New system: client accounts live in the Clients spreadsheet's Accounts tab.
  try { return tab_('clients', 'Accounts'); } catch (e) {}
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
  if (req.company_hp) return { ok: true };                         // honeypot
  if (!floodOk_('register')) return { ok: false, error: 'rate', message: 'Massa peticions. Espera un moment.' };
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
  'labels','images','name','short','description','heroTagline','heroDesc','specs','bom','active','printTimeMin','prodNotes'];
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
  if (col.active != null && (String(r[col.active]).toLowerCase() === 'false' || r[col.active] === false)) p.active = false;
  if (col.printTimeMin != null && String(r[col.printTimeMin]) !== '') p.printTimeMin = Number(r[col.printTimeMin]);
  if (col.prodNotes != null && String(r[col.prodNotes] || '').trim()) p.prodNotes = String(r[col.prodNotes]).trim();
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
    if (k === 'active') return product.active === false ? false : true;
    if (k === 'stock') return (product.stock === '' || product.stock == null) ? '' : Number(product.stock);
    if (k === 'price') return Number(product.price || 0);
    if (k === 'cost') return (product.cost === '' || product.cost == null) ? '' : Number(product.cost);
    if (k === 'printTimeMin') return (product.printTimeMin === '' || product.printTimeMin == null) ? '' : Number(product.printTimeMin);
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
  // New system: filament inventory is the Inventory spreadsheet's Filaments tab.
  try { return tab_('inv', 'Filaments'); } catch (e) {}
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
// The grams column is called "grams" in the new sheet and "stock" in the old draft.
function gramsCol_(col) { return col.grams != null ? col.grams : col.stock; }

function readMaterials() {
  var sh = ensureMaterialsSheet();
  var v = sh.getDataRange().getValues(), col = indexMap(v[0]), gc = gramsCol_(col), out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; if (!String(r[col.material] || '').trim()) continue;
    out.push({
      id: matId(r[col.material], r[col.color]),
      material: String(r[col.material]).trim(), color: String(r[col.color] || '').trim(),
      stock: Number(r[gc] || 0), costPerGram: Number(r[col.costPerGram] || 0), lowAt: Number(r[col.lowAt] || 0),
      hex: col.hex != null ? String(r[col.hex] || '') : '', brand: col.brand != null ? String(r[col.brand] || '') : '',
      active: col.active == null ? true : (String(r[col.active]).toLowerCase() !== 'false' && r[col.active] !== false)
    });
  }
  return out;
}
function saveMaterial(m, session) {
  if (!m || !String(m.material || '').trim()) return { ok: false, error: 'missing', message: 'Falta el material.' };
  var sh = ensureMaterialsSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  var head = v[0], key = matId(m.material, m.color);
  var g = (m.stock != null ? m.stock : m.grams);
  // Fill each column by its header name, so the same code works for the new and old layouts.
  var byName = {
    material: String(m.material).trim(), color: String(m.color || '').trim(),
    hex: String(m.hex || ''), brand: String(m.brand || ''),
    grams: Number(g || 0), stock: Number(g || 0),
    costPerGram: Number(m.costPerGram || 0), lowAt: Number(m.lowAt || 0),
    active: m.active === false ? false : true, updated: new Date()
  };
  var row = head.map(function (h) { var k = String(h).trim(); return byName[k] != null ? byName[k] : ''; });
  logInvHistory_(byName.material, byName.color, '', byName.grams, 'manual edit', session ? session.email : '');
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
// Buy filament: ADD grams to stock (not set), record the purchase (cash + supplier) in
// Inventory!Purchases, and refresh €/g. Purchases are the filament cost basis in the P&L.
function purchaseMaterial(session, p) {
  p = p || {};
  var material = String(p.material || '').trim(), color = String(p.color || '').trim();
  var grams = Number(p.grams || 0), cost = Number(p.cost || 0);
  if (!material || grams <= 0) return { ok: false, error: 'missing', message: 'Falten material i grams (>0).' };
  var sh = ensureMaterialsSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]), gc = gramsCol_(col);
  var key = matId(material, color), found = -1, newStock = grams;
  for (var i = 1; i < v.length; i++) if (matId(v[i][col.material], v[i][col.color]) === key) { found = i; newStock = Number(v[i][gc] || 0) + grams; break; }
  var cpg = (p.costPerGram != null && p.costPerGram !== '') ? Number(p.costPerGram) : (grams > 0 && cost > 0 ? cost / grams : null);
  if (found >= 0) {
    sh.getRange(found + 1, gc + 1).setValue(newStock);
    if (cpg != null && col.costPerGram != null) sh.getRange(found + 1, col.costPerGram + 1).setValue(cpg);
    if (col.updated != null) sh.getRange(found + 1, col.updated + 1).setValue(new Date());
  } else {
    saveMaterial({ material: material, color: color, stock: grams, costPerGram: (cpg || 0), lowAt: Number(p.lowAt || 0), hex: p.hex || '', brand: p.brand || '', active: true }, session);
  }
  try { ensureTab_('inv', 'Purchases', systemSchema().inv.tabs.Purchases).appendRow([new Date(), material, color, grams, cost, String(p.supplier || ''), session ? session.email : '']); }
  catch (e) { logErr_('purchase row', e); }
  logInvHistory_(material, color, grams, newStock, 'compra' + (p.supplier ? (' ' + p.supplier) : ''), session ? session.email : '');
  return { ok: true, stock: newStock, costPerGram: cpg };
}
// Subtract grams from a material/colour on an order; returns remaining, or null if untracked.
// Deduct filament. Stock never goes below 0; any shortfall is reported so it can be flagged.
// Returns { remaining, short } or null if the filament isn't found.
function deductMaterial(material, color, grams) {
  var sh = ensureMaterialsSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]), gc = gramsCol_(col);
  var key = matId(material, color);
  for (var i = 1; i < v.length; i++)
    if (matId(v[i][col.material], v[i][col.color]) === key) {
      var have = Number(v[i][gc] || 0), next = have - grams, short = 0;
      if (next < 0) { short = -next; next = 0; }
      sh.getRange(i + 1, gc + 1).setValue(next);
      if (col.updated != null) sh.getRange(i + 1, col.updated + 1).setValue(new Date());
      return { remaining: next, short: short };
    }
  return null;
}

/* ======================= ORDERS ======================= */
var ORDER_COLS = ['date', 'id', 'status', 'payment', 'name', 'email', 'phone', 'units', 'revenue', 'cost', 'profit', 'items', 'note', 'invoiceNo'];
function ensureOrdersSheet() {
  // New system: orders live in the Operations spreadsheet's Orders tab.
  try { return tab_('ops', 'Orders'); } catch (e) {}
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
// creates print jobs (filament is deducted later when the job is marked done),
// and emails one alert to the shop + one confirmation to the customer.
function placeOrder(req) {
  if (req.company_hp) return { ok: true, id: '' };                 // honeypot: silently accept bots
  if (!floodOk_('order')) return { ok: false, error: 'rate', message: 'Massa peticions. Espera un moment i torna-ho a provar.' };
  var items = req.items;
  if (!items || !items.length) return { ok: false, error: 'missing', message: 'Comanda buida.' };
  var name = String(req.name || '').trim(), email = String(req.email || '').trim();
  // Name is required; email is optional (phone/in-person orders often have none).
  if (!name) return { ok: false, error: 'missing', message: 'Falta el nom.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'email', message: 'Email no vàlid.' };

  // The order id is made first so each filament usage row can reference it.
  var id = uid_('ORD-');
  var byId = {}; readProducts().forEach(function (p) { byId[p.id] = p; });
  var lines = [], units = 0, revenue = 0, cost = 0;
  for (var i = 0; i < items.length; i++) {
    var p = byId[items[i].id]; if (!p) continue;
    var qty = Math.max(1, Math.floor(Number(items[i].qty || 1)));
    units += qty; revenue += p.price * qty; cost += (p.cost || 0) * qty;
    lines.push({ id: p.id, name: (p.name && (p.name.ca || p.name.es || p.name.en)) || p.id, qty: qty, price: p.price, cost: p.cost || 0 });
  }
  if (!lines.length) return { ok: false, error: 'noitems', message: 'Cap producte vàlid a la comanda.' };

  var profit = revenue - cost;
  var payment = (['card', 'cash', 'transfer'].indexOf(String(req.payment || 'transfer')) >= 0) ? String(req.payment) : 'transfer';
  // Cash (in-person via Yerai) is collected on the spot → mark it paid; transfer/card are pending.
  var status = (payment === 'cash') ? 'paid' : 'awaiting_payment';
  // IVA-inclusive prices: split the total into base + tax for the record (rate from Settings).
  var IVA = Number(getSetting_('IVA', '21')) / 100 || 0.21, total = revenue, base = total / (1 + IVA), ivaAmt = total - base;
  // Fill each Orders column by header name, so this works on the new and old layouts.
  var ordersSh = ensureOrdersSheet();
  var oHead = ordersSh.getRange(1, 1, 1, ordersSh.getLastColumn()).getValues()[0];
  var oVals = {
    id: id, date: new Date(), source: String(req.source || 'web'), status: status, payment: payment,
    customerName: name, name: name, email: email, phone: String(req.phone || ''),
    items: JSON.stringify(lines), subtotal: base, iva: ivaAmt, total: total,
    revenue: total, cost: cost, profit: profit, units: units,
    invoiceNo: '', assignedTo: '', notes: String(req.note || ''), note: String(req.note || '')
  };
  ordersSh.appendRow(oHead.map(function (h) { var k = String(h).trim(); return oVals[k] != null ? oVals[k] : ''; }));
  logOps_('order', id, 'created', '', 'source ' + String(req.source || 'web') + ', total ' + total.toFixed(2));
  // Turn each order line into print jobs (filament is deducted when Albert marks them done).
  var jobs = []; try { jobs = createJobsForOrder_(id, lines, byId) || []; } catch (e) { logErr_('createJobsForOrder ' + id, e); }
  // ONE alert to the shop: the order AND the print jobs it generated.
  phase_('order-alert', function () {
    return sendMail_({
      to: notifyEmail_(), replyTo: email || 'info@propapropteu.com', subject: '[Comanda ' + id + '] ' + name,
      body: 'Nova comanda ' + id + ' (' + String(req.source || 'web') + ')\n' +
            'Client: ' + name + (email ? ' <' + email + '>' : '') + (req.phone ? ' · ' + req.phone : '') + '\n\n' +
            lines.map(function (l) { return '· ' + l.qty + 'x ' + l.name + ' (' + l.price + ' €)'; }).join('\n') +
            '\n\nIngressos: ' + revenue.toFixed(2) + ' € · Cost: ' + cost.toFixed(2) + ' € · Benefici: ' + profit.toFixed(2) + ' €' +
            (req.note ? ('\nNota: ' + req.note) : '') +
            (jobs.length ? ('\n\n— Feines d\'impressió generades —\n' + jobLines_(jobs)) : '') +
            '\n\nObre la cua: acceso → Cua d\'impressió.'
    }, 'order');
  });
  // Confirmation to the customer (only when we have their email).
  if (email) phase_('order-confirm', function () {
    return sendMail_({
      to: email, name: 'Prop a Prop Teu', replyTo: 'info@propapropteu.com',
      subject: 'Hemos recibido tu pedido (' + id + ') — Prop a Prop Teu',
      body: 'Hola ' + name + ',\n\nGracias por tu pedido. Lo hemos recibido correctamente y te contactaremos en breve para confirmar el pago y la entrega.\n\n' +
            'Pedido ' + id + ':\n' + lines.map(function (l) { return '· ' + l.qty + 'x ' + l.name + ' — ' + (l.price * l.qty).toFixed(2) + ' €'; }).join('\n') +
            '\n\nTotal: ' + revenue.toFixed(2) + ' € (IVA incl.)' +
            '\n\nSi tienes cualquier duda, responde a este correo o escríbenos a info@propapropteu.com.\n\nUn saludo,\nEl equipo de Prop a Prop Teu'
    }, 'customer');
  });

  // Card payment: if Stripe is configured, hand back a hosted checkout URL to redirect to.
  if (payment === 'card' && cardEnabled_()) {
    try {
      var url = stripeCheckout_(id, lines, total, req.returnUrl);
      return { ok: true, id: id, payment: 'card', checkoutUrl: url };
    } catch (e) {
      logErr_('stripeCheckout ' + id, e);
      return { ok: true, id: id, payment: 'card', checkoutUrl: '', message: 'Comanda registrada; el pagament amb targeta no està disponible ara mateix. Et contactem.' };
    }
  }
  // Transfer (or card while Stripe is off): return the live bank details for the instructions.
  return { ok: true, id: id, payment: payment, bankHolder: getSetting_('BANK_HOLDER', 'Prop a Prop Teu'), bankIban: getSetting_('BANK_IBAN', ''), message: 'Comanda rebuda. Et contactem per confirmar.' };
}
function readOrders() {
  var sh = ensureOrdersSheet();
  var v = sh.getDataRange().getValues(), col = indexMap(v[0]), out = [];
  // Read a value by its header name, with a fallback header for the old layout.
  function g(r, a, b) { var i = col[a] != null ? col[a] : col[b]; return i == null ? '' : r[i]; }
  for (var i = v.length - 1; i >= 1; i--) {
    var r = v[i]; if (!String(r[col.id] || '').trim()) continue;
    var items = []; try { items = JSON.parse(g(r, 'items') || '[]'); } catch (e) {}
    var total = Number(g(r, 'total', 'revenue') || 0);
    // Cost and units are derived from the stored line items when the columns aren't present.
    var cost = col.cost != null ? Number(r[col.cost] || 0) : items.reduce(function (s, it) { return s + Number(it.cost || 0) * Number(it.qty || 0); }, 0);
    var units = col.units != null ? Number(r[col.units] || 0) : items.reduce(function (s, it) { return s + Number(it.qty || 0); }, 0);
    out.push({
      date: g(r, 'date') ? String(g(r, 'date')) : '', id: String(r[col.id]), status: normStatus_(g(r, 'status')),
      payment: String(g(r, 'payment') || ''), source: String(g(r, 'source') || ''),
      name: String(g(r, 'customerName', 'name') || ''), email: String(g(r, 'email') || ''), phone: String(g(r, 'phone') || ''),
      units: units, revenue: total, cost: cost, profit: total - cost, items: items,
      note: String(g(r, 'notes', 'note') || ''), invoiceNo: String(g(r, 'invoiceNo') || '')
    });
  }
  return out;
}
function setOrderStatus(session, id, status) {
  id = String(id || '').trim();
  var sh = ensureOrdersSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = 1; i < v.length; i++)
    if (String(v[i][col.id] || '').trim() === id) {
      var st = normStatus_(status);
      sh.getRange(i + 1, col.status + 1).setValue(st);
      logOps_('order', id, 'status:' + st, session ? session.email : '', '');
      return { ok: true };
    }
  return { ok: false, error: 'notfound', message: 'Comanda no trobada.' };
}
// Archive the order to History, then remove the row. Does NOT restock materials.
function deleteOrder(session, id) {
  id = String(id || '').trim();
  var sh = ensureOrdersSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = v.length - 1; i >= 1; i--)
    if (String(v[i][col.id] || '').trim() === id) {
      var snapshot = {}; v[0].forEach(function (h, j) { snapshot[String(h).trim()] = v[i][j]; });
      logOps_('order', id, 'deleted', session ? session.email : '', JSON.stringify(snapshot));
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  return { ok: false, error: 'notfound', message: 'Comanda no trobada.' };
}
/* ---------- Invoices (VAT PDF) ---------- */
// Fiscal identity for invoices — editable in the Settings screen (Script Property / placeholder fallback).
function fiscalData() {
  var or = function (key, dflt) { var v = getSetting_(key, ''); return v !== '' ? v : dflt; };
  return {
    name: or('FISCAL_NAME', prop('FISCAL_NAME') || '[NOMBRE FISCAL / AUTÓNOMO]'),
    nif: or('FISCAL_NIF', prop('FISCAL_NIF') || '[NIF]'),
    addr: or('FISCAL_ADDR', prop('FISCAL_ADDR') || '[DIRECCIÓN FISCAL COMPLETA]'),
    email: or('FISCAL_EMAIL', 'info@propapropteu.com')
  };
}
// Invoice numbering lives in Settings (editable, resettable); callers are under the script lock.
function assignInvoiceNo(orderId) {
  var sh = ensureOrdersSheet(), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][col.id] || '').trim() === orderId) {
      var cur = String(v[i][col.invoiceNo] || '').trim();
      if (cur) return cur;
      var seq = Number(getSetting_('INVOICE_SEQ', '0')) + 1;
      setSetting_('INVOICE_SEQ', String(seq));
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
  try { maybeCloseMonths_(); } catch (e) { logErr_('maybeCloseMonths', e); }
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
  // Publish only visible products; strip internal-only fields (cost, bom, active).
  var publicProducts = readProducts().filter(function (p) { return p.active !== false; }).map(function (p) {
    var c = {}; for (var k in p) { if (k !== 'cost' && k !== 'bom' && k !== 'active' && k !== 'printTimeMin' && k !== 'prodNotes') c[k] = p[k]; } return c;
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
  // Route the core tables to the new five-spreadsheet system; fall back to the bound draft.
  var map = { Managers: ['config', 'Managers'], Products: ['catalog', 'Products'], Messages: ['config', 'Messages'] };
  if (map[name]) { try { return tab_(map[name][0], map[name][1]); } catch (e) {} }
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

/* ================= NEW SYSTEM: five fresh Google Sheets as the database =================
   One engine, five spreadsheets (one per part of the business). The engine finds each by
   an id stored in Script Properties. setupSystem() creates any that don't exist yet, builds
   every tab with its header row, seeds settings and migrates the current draft's core data. */

// Script Property name that holds each spreadsheet's id.
var SS_KEYS = { catalog: 'SS_CATALOG', ops: 'SS_OPERATIONS', inv: 'SS_INVENTORY', clients: 'SS_CLIENTS', config: 'SS_CONFIG', finance: 'SS_FINANCE' };

// The whole schema: spreadsheet -> tab -> header columns. Add a column at the END of a list,
// never in the middle, so existing rows stay aligned.
function systemSchema() {
  return {
    catalog: { name: 'Prop a Prop Teu · Catalog', tabs: {
      Products: PRODUCT_COLS,
      Categories: ['id', 'name_ca', 'name_es', 'name_en']
    }},
    ops: { name: 'Prop a Prop Teu · Operations', tabs: {
      Orders: ['id', 'date', 'source', 'status', 'payment', 'customerName', 'email', 'phone', 'items', 'subtotal', 'iva', 'total', 'invoiceNo', 'assignedTo', 'notes'],
      Jobs: ['id', 'created', 'category', 'owner', 'source', 'productId', 'link', 'material', 'color', 'anyColor', 'units', 'gramsEst', 'priority', 'status', 'orderRef', 'batchId', 'notes', 'timeEst'],
      JobsDone: ['id', 'created', 'category', 'owner', 'source', 'productId', 'link', 'material', 'color', 'anyColor', 'units', 'gramsEst', 'timeEst', 'priority', 'status', 'orderRef', 'batchId', 'notes', 'doneDate', 'doneBy', 'period'],
      Links: ['url', 'title', 'category', 'material', 'color', 'timesPrinted', 'notes'],
      History: ['date', 'type', 'id', 'action', 'by', 'detail']
    }},
    inv: { name: 'Prop a Prop Teu · Inventory', tabs: {
      Filaments: ['material', 'color', 'hex', 'brand', 'grams', 'costPerGram', 'lowAt', 'active'],
      Purchases: ['date', 'material', 'color', 'grams', 'cost', 'supplier', 'by'],
      Usage: ['date', 'ref', 'material', 'color', 'grams', 'category', 'cost'],
      History: ['date', 'material', 'color', 'change', 'newGrams', 'reason', 'by']
    }},
    clients: { name: 'Prop a Prop Teu · Clients', tabs: {
      Accounts: ['email', 'salt', 'hash', 'name', 'phone', 'address', 'active', 'created'],
      Contacts: ['name', 'email', 'phone', 'notes', 'firstOrder', 'lastOrder']
    }},
    config: { name: 'Prop a Prop Teu · Config', tabs: {
      Managers: ['email', 'salt', 'hash', 'name', 'role', 'active'],
      Settings: ['key', 'value'],
      Invoices: ['number', 'orderId', 'date', 'total', 'pdfUrl'],
      Messages: ['date', 'source', 'name', 'email', 'phone', 'company', 'message']
    }},
    finance: { name: 'Prop a Prop Teu · Finance', tabs: {
      Expenses: ['id', 'date', 'category', 'description', 'amount', 'vat', 'supplier', 'recurring', 'by', 'notes'],
      Payouts: ['id', 'date', 'manager', 'amount', 'period', 'notes'],
      Monthly: ['period', 'ordersCount', 'revenue', 'productionCost', 'filamentCost', 'otherExpenses', 'grossProfit', 'payouts', 'net', 'jobsDone', 'closedAt']
    }}
  };
}

// Report which spreadsheets exist and their links (so a manager can see setup state).
function systemStatus() {
  var props = PropertiesService.getScriptProperties(), out = {};
  for (var key in SS_KEYS) {
    var id = props.getProperty(SS_KEYS[key]);
    var info = { configured: !!id };
    if (id) { try { var ss = SpreadsheetApp.openById(id); info.url = ss.getUrl(); info.name = ss.getName(); } catch (e) { info.configured = false; } }
    out[key] = info;
  }
  return { ok: true, sheets: out };
}

// Create the five spreadsheets (idempotent), build their tabs, seed settings, migrate drafts.
function setupSystem(session) {
  if (session && session.role !== 'manager') return { ok: false, error: 'auth', message: 'Nomes gestors.' };
  var schema = systemSchema(), props = PropertiesService.getScriptProperties(), out = {};

  // One spreadsheet at a time: open it if we have an id, otherwise create and remember the id.
  for (var key in schema) {
    var def = schema[key], id = props.getProperty(SS_KEYS[key]), ss = null;
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
    if (!ss) { ss = SpreadsheetApp.create(def.name); props.setProperty(SS_KEYS[key], ss.getId()); }

    // Build each tab: reuse the empty default sheet for the first tab, insert the rest, write headers.
    var firstTabDone = false;
    for (var tab in def.tabs) {
      var sh = ss.getSheetByName(tab);
      if (!sh) {
        if (!firstTabDone && ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0) { sh = ss.getSheets()[0]; sh.setName(tab); }
        else sh = ss.insertSheet(tab);
      }
      var cols = def.tabs[tab];
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.setFrozenRows(1);
      firstTabDone = true;
    }
    out[key] = { id: ss.getId(), url: ss.getUrl(), name: def.name };
  }

  seedSettings_();
  var migrated = migrateFromDraft_();
  return { ok: true, sheets: out, migrated: migrated };
}

// Open one of the five spreadsheets by its Script-Property id.
function ss_(key) {
  var id = PropertiesService.getScriptProperties().getProperty(SS_KEYS[key]);
  if (!id) throw new Error('System not set up: missing ' + SS_KEYS[key]);
  return SpreadsheetApp.openById(id);
}
function tab_(key, name) {
  var sh = ss_(key).getSheetByName(name);
  if (!sh) throw new Error('Missing tab ' + name + ' in ' + key);
  return sh;
}

// Append a column (by header name) to the end of a sheet if it is not already there.
// Lets new fields appear on sheets created before the field existed, without re-running setup.
function ensureColumn_(sh, colName) {
  var last = sh.getLastColumn();
  var head = last ? sh.getRange(1, 1, 1, last).getValues()[0] : [];
  for (var i = 0; i < head.length; i++) if (String(head[i]).trim() === colName) return;
  sh.getRange(1, last + 1, 1, 1).setValue(colName);
  sh.setFrozenRows(1);
}

// Create a tab with the given headers if missing; otherwise make sure each header exists.
// Lets new tabs (JobsDone, Monthly, …) appear without re-running setupSystem.
function ensureTab_(key, name, cols) {
  var ss = ss_(key), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, cols.length).setValues([cols]); sh.setFrozenRows(1); }
  else { cols.forEach(function (c) { ensureColumn_(sh, c); }); }
  return sh;
}

/* ---------- small shared helpers (ids, periods, settings, flood guard) ---------- */

// A short, collision-resistant id: prefix + timestamp + random suffix.
function uid_(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'GMT+1', 'yyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 5);
}
// Month key "YYYY-MM" (sorts lexicographically).
function period_(d) { return Utilities.formatDate(d || new Date(), 'GMT+1', 'yyyy-MM'); }
function nextPeriod_(p) { var y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7)); m++; if (m > 12) { m = 1; y++; } return y + '-' + ('0' + m).slice(-2); }
function prevPeriod_() { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return period_(d); }
// Normalise a stored period cell to "YYYY-MM" (Sheets may coerce the text to a Date).
function pstr_(v) { if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM'); return String(v == null ? '' : v).slice(0, 7); }
// Force a 1-based column to plain-text format so "YYYY-MM" values aren't coerced to dates.
function textCol_(sh, col1) { try { sh.getRange(1, col1, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@'); } catch (e) {} }

// Read a Config/Settings value by key (falls back to a default).
function getSetting_(key, dflt) {
  try {
    var sh = tab_('config', 'Settings'), v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === key) return String(v[i][1]);
  } catch (e) {}
  return dflt;
}
// Upsert a Config/Settings key.
function setSetting_(key, value) {
  var sh = tab_('config', 'Settings'), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  sh.appendRow([key, value]);
}
// Where to email new-order / new-job alerts (editable in Settings).
function notifyEmail_() { return getSetting_('NOTIFY_EMAIL', 'propapropteu@gmail.com'); }
function stripeKey_() { return getSetting_('STRIPE_SECRET_KEY', '').trim(); }
function cardEnabled_() { return stripeKey_() !== ''; }

/* ---------- editable settings (the dashboard "Configuració" screen) ---------- */
// The last-minute inputs: bank, fiscal identity, IVA, invoice counter, alert email,
// shipping note and the Stripe key. `secret` fields are never sent to public callers.
var SETTINGS_DEFS = [
  { key: 'BANK_HOLDER', label: 'Titular del compte (transferència)', type: 'text', dflt: 'Prop a Prop Teu' },
  { key: 'BANK_IBAN', label: 'IBAN (transferència)', type: 'text', dflt: '' },
  { key: 'FISCAL_NAME', label: 'Nom fiscal / autònom (factures)', type: 'text', dflt: '' },
  { key: 'FISCAL_NIF', label: 'NIF (factures)', type: 'text', dflt: '' },
  { key: 'FISCAL_ADDR', label: 'Adreça fiscal (factures)', type: 'text', dflt: '' },
  { key: 'FISCAL_EMAIL', label: 'Email a les factures', type: 'text', dflt: 'info@propapropteu.com' },
  { key: 'IVA', label: 'IVA (%)', type: 'number', dflt: '21' },
  { key: 'INVOICE_SEQ', label: 'Últim número de factura emès (0 = comença a 1)', type: 'number', dflt: '0' },
  { key: 'NOTIFY_EMAIL', label: 'Email per avisos de comandes/feines', type: 'text', dflt: 'propapropteu@gmail.com' },
  { key: 'SHIPPING_NOTE', label: 'Nota d\'enviament (checkout)', type: 'text', dflt: '' },
  { key: 'STRIPE_SECRET_KEY', label: 'Clau secreta Stripe (activa el pagament amb targeta)', type: 'secret', dflt: '' }
];
function getSettings() {
  var data = SETTINGS_DEFS.map(function (d) {
    var v = getSetting_(d.key, d.dflt);
    // Don't return the raw secret; say whether it's set so the UI can show a placeholder.
    if (d.type === 'secret') return { key: d.key, label: d.label, type: d.type, value: '', set: String(v || '') !== '' };
    return { key: d.key, label: d.label, type: d.type, value: v };
  });
  return { ok: true, data: data, cardEnabled: cardEnabled_() };
}
function saveSettings(session, map) {
  if (!map || typeof map !== 'object') return { ok: false, error: 'missing', message: 'Res a desar.' };
  var allowed = {}; SETTINGS_DEFS.forEach(function (d) { allowed[d.key] = d; });
  var changed = 0;
  Object.keys(map).forEach(function (k) {
    var d = allowed[k]; if (!d) return;                 // ignore unknown keys
    var val = map[k];
    // A blank secret means "leave the existing key untouched".
    if (d.type === 'secret' && String(val || '').trim() === '') return;
    setSetting_(k, d.type === 'number' ? String(Number(val) || 0) : String(val == null ? '' : val));
    changed++;
  });
  logOps_('settings', 'config', 'saved', session ? session.email : '', changed + ' keys');
  return { ok: true, changed: changed };
}
// Public, non-secret config the storefront needs (bank details, IVA, card availability).
function pubinfo() {
  return {
    ok: true,
    bankHolder: getSetting_('BANK_HOLDER', 'Prop a Prop Teu'),
    bankIban: getSetting_('BANK_IBAN', ''),
    iva: Number(getSetting_('IVA', '21')),
    shippingNote: getSetting_('SHIPPING_NOTE', ''),
    cardEnabled: cardEnabled_()
  };
}

/* ---------- managers (Yerai + Albert) screen ---------- */
function listManagers() {
  var out = [];
  try {
    var sh = sheet(SHEET_MANAGERS), v = sh.getDataRange().getValues(), c = indexMap(v[0]);
    for (var i = 1; i < v.length; i++) {
      var em = String(v[i][c.email] || '').trim(); if (!em) continue;
      out.push({ email: em, name: String(v[i][c.name] || ''), role: String(v[i][c.role] || 'manager'), active: String(v[i][c.active]).toLowerCase() !== 'false' && v[i][c.active] !== false });
    }
  } catch (e) {}
  return { ok: true, data: out };
}
// Create a manager login (full access). Any manager can add another.
function addManagerAccount(session, m) {
  m = m || {};
  var email = String(m.email || '').trim().toLowerCase(), name = String(m.name || '').trim(), password = String(m.password || '');
  if (!email || !name || !password) return { ok: false, error: 'missing', message: 'Falten nom, email o contrasenya.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'email', message: 'Email no vàlid.' };
  if (password.length < 6) return { ok: false, error: 'weak', message: 'La contrasenya ha de tenir 6 caràcters o més.' };
  if (findManager(email)) return { ok: false, error: 'exists', message: 'Ja existeix un gestor amb aquest email.' };
  var sh = sheet(SHEET_MANAGERS), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var salt = Utilities.getUuid(), hash = sha256Hex(salt + password);
  var vals = { email: email, salt: salt, hash: hash, name: name, role: 'manager', active: true };
  sh.appendRow(head.map(function (h) { var k = String(h).trim(); return vals[k] != null ? vals[k] : ''; }));
  logOps_('manager', email, 'created', session ? session.email : '', name);
  return { ok: true };
}
// Delete a manager — but never the one making the request (don't lock yourself out).
function deleteManager(session, email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'missing', message: 'Falta l\'email.' };
  if (session && String(session.email).trim().toLowerCase() === email) return { ok: false, error: 'self', message: 'No pots esborrar el teu propi compte.' };
  var sh = sheet(SHEET_MANAGERS), v = sh.getDataRange().getValues(), c = indexMap(v[0]);
  for (var i = v.length - 1; i >= 1; i--)
    if (String(v[i][c.email] || '').trim().toLowerCase() === email) {
      logOps_('manager', email, 'deleted', session ? session.email : '', '');
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  return { ok: false, error: 'notfound', message: 'Gestor no trobat.' };
}

/* ---------- clients (accounts + contacts) screen ---------- */
function listClients() {
  var accounts = [], contacts = [];
  try {
    var sh = tab_('clients', 'Accounts'), v = sh.getDataRange().getValues(), c = indexMap(v[0]);
    for (var i = 1; i < v.length; i++) {
      var em = String(v[i][c.email] || '').trim(); if (!em) continue;
      accounts.push({ email: em, name: String(v[i][c.name] || ''), phone: String(v[i][c.phone] || ''), address: String(v[i][c.address] || ''), active: v[i][c.active] !== false, created: v[i][c.created] ? String(v[i][c.created]) : '' });
    }
  } catch (e) {}
  try {
    var ct = tab_('clients', 'Contacts'), cv = ct.getDataRange().getValues(), cc = indexMap(cv[0]);
    for (var j = 1; j < cv.length; j++) {
      var nm = String(cv[j][cc.name] || '').trim(), ce = String(cv[j][cc.email] || '').trim();
      if (!nm && !ce) continue;
      contacts.push({ name: nm, email: ce, phone: String(cv[j][cc.phone] || ''), notes: String(cv[j][cc.notes] || '') });
    }
  } catch (e) {}
  return { ok: true, accounts: accounts, contacts: contacts };
}
// Delete a client account (archived to History first). Does not touch their past orders.
function deleteClient(session, email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'missing', message: 'Falta l\'email.' };
  var sh = tab_('clients', 'Accounts'), v = sh.getDataRange().getValues(), c = indexMap(v[0]);
  for (var i = v.length - 1; i >= 1; i--)
    if (String(v[i][c.email] || '').trim().toLowerCase() === email) {
      var snap = {}; v[0].forEach(function (h, j) { if (String(h).trim() !== 'salt' && String(h).trim() !== 'hash') snap[String(h).trim()] = v[i][j]; });
      logOps_('client', email, 'deleted', session ? session.email : '', JSON.stringify(snap));
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  return { ok: false, error: 'notfound', message: 'Compte no trobat.' };
}

/* ---------- Stripe card checkout (dormant until STRIPE_SECRET_KEY is set) ---------- */
// Call the Stripe REST API, form-encoded, with the secret key from Settings.
function stripeApi_(method, path, params) {
  var key = stripeKey_(); if (!key) throw new Error('Stripe not configured');
  var opts = { method: method, headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true };
  if (params) opts.payload = params;                    // UrlFetchApp form-encodes a plain object
  var res = UrlFetchApp.fetch('https://api.stripe.com/v1/' + path, opts);
  var body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 300) throw new Error((body.error && body.error.message) || ('Stripe ' + res.getResponseCode()));
  return body;
}
// Create a Checkout Session for an order; returns the hosted payment URL.
function stripeCheckout_(orderId, lines, total, returnUrl) {
  var base = String(returnUrl || '').replace(/\/$/, '') || 'https://propapropteu.com';
  var p = {
    mode: 'payment',
    success_url: base + '/?paid=' + encodeURIComponent(orderId) + '&cs={CHECKOUT_SESSION_ID}',
    cancel_url: base + '/?cancel=' + encodeURIComponent(orderId),
    'metadata[order]': orderId,
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': Math.round(Number(total) * 100),
    'line_items[0][price_data][product_data][name]': 'Comanda ' + orderId
  };
  var s = stripeApi_('post', 'checkout/sessions', p);
  return s.url;
}
// Public: after the Stripe redirect, confirm the session was paid and mark the order paid.
function verifyPayment(req) {
  if (!floodOk_('verify')) return { ok: false, error: 'rate', message: 'Espera un moment.' };
  var orderId = String(req.order || '').trim(), cs = String(req.cs || '').trim();
  if (!orderId || !cs) return { ok: false, error: 'missing' };
  if (!cardEnabled_()) return { ok: false, error: 'disabled' };
  try {
    var s = stripeApi_('get', 'checkout/sessions/' + encodeURIComponent(cs), null);
    var paid = s && s.payment_status === 'paid' && s.metadata && String(s.metadata.order) === orderId;
    if (paid) { setOrderStatus(null, orderId, 'paid'); return { ok: true, paid: true }; }
    return { ok: true, paid: false, status: s && s.payment_status };
  } catch (e) { logErr_('verifyPayment ' + orderId, e); return { ok: false, error: 'stripe', message: String(e) }; }
}

// Crude global flood cap for public endpoints (no client IP available in Apps Script).
function floodOk_(kind) {
  try {
    var c = CacheService.getScriptCache(), k = 'flood_' + kind + '_' + Math.floor(Date.now() / 60000);
    var n = Number(c.get(k) || 0) + 1; c.put(k, String(n), 120);
    return n <= 20; // max 20 of a kind per minute, across everyone
  } catch (e) { return true; }
}

// Record a swallowed error so failures are recoverable instead of silent.
function logErr_(where, err) { try { logOps_('error', where, 'exception', '', String(err)); } catch (e) {} }

/* ---------- order status: English codes stored, Catalan shown in the UI ---------- */
var ORDER_STATUS = ['new', 'awaiting_payment', 'paid', 'in_production', 'ready', 'delivered', 'cancelled'];
// Map legacy Catalan statuses (and anything unknown) onto the English codes.
function normStatus_(s) {
  s = String(s || '').trim();
  var m = {
    'nou': 'new', 'pendent pagament': 'awaiting_payment', 'pagat': 'paid',
    'en preparació': 'in_production', 'en preparacio': 'in_production',
    'a punt': 'ready', 'entregat': 'delivered', 'cancel·lat': 'cancelled', 'cancel.lat': 'cancelled'
  };
  if (m[s]) return m[s];
  return ORDER_STATUS.indexOf(s) >= 0 ? s : (s ? s : 'new');
}

// Fill Config/Settings with the keys managers will edit, taking current values where we have them.
function seedSettings_() {
  var sh = tab_('config', 'Settings');
  if (sh.getLastRow() > 1) return;
  var P = PropertiesService.getScriptProperties();
  var rows = [
    ['BANK_HOLDER', 'Prop a Prop Teu'],
    ['BANK_IBAN', 'ES00 0000 0000 0000 0000 0000'],
    ['FISCAL_NAME', P.getProperty('FISCAL_NAME') || '[NOMBRE FISCAL / AUTONOMO]'],
    ['FISCAL_NIF', P.getProperty('FISCAL_NIF') || '[NIF]'],
    ['FISCAL_ADDR', P.getProperty('FISCAL_ADDR') || '[DIRECCION FISCAL]'],
    ['IVA', '21'],
    ['INVOICE_SEQ', '0'],
    ['NOTIFY_EMAIL', 'propapropteu@gmail.com'],
    ['LAST_CLOSED_MONTH', ''],
    ['SHIPPING_NOTE', 'Entrega personalizada; te confirmamos coste y plazo por email.']
  ];
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

// Copy the current draft spreadsheet's core data into the new sheets (only when the target is empty).
function migrateFromDraft_() {
  var draft = SpreadsheetApp.getActiveSpreadsheet(), done = {};

  done.managers = copyRows_(draft.getSheetByName('Managers'), tab_('config', 'Managers'));
  done.accounts = copyRows_(draft.getSheetByName('Clients'), tab_('clients', 'Accounts'));
  done.products = copyRows_(draft.getSheetByName('Products'), tab_('catalog', 'Products'));
  done.messages = copyRows_(draft.getSheetByName('Messages'), tab_('config', 'Messages'));

  // Materials -> Filaments needs a small remap (stock becomes grams; add hex/brand/active).
  var mat = draft.getSheetByName('Materials'), fil = tab_('inv', 'Filaments');
  if (mat && fil.getLastRow() <= 1) {
    var v = mat.getDataRange().getValues(), col = indexMap(v[0]), rows = [];
    for (var i = 1; i < v.length; i++) {
      if (!String(v[i][col.material] || '').trim()) continue;
      rows.push([v[i][col.material], v[i][col.color], '', '', Number(v[i][col.stock] || 0), Number(v[i][col.costPerGram] || 0), Number(v[i][col.lowAt] || 0), true]);
    }
    if (rows.length) fil.getRange(2, 1, rows.length, 8).setValues(rows);
    done.filaments = rows.length;
  } else done.filaments = 0;

  return done;
}

// Append every data row of a source sheet onto a target sheet, matching by header name. Skips a non-empty target.
function copyRows_(src, dst) {
  if (!src || dst.getLastRow() > 1) return 0;
  var sv = src.getDataRange().getValues(); if (sv.length < 2) return 0;
  var sCol = indexMap(sv[0]);
  var dHead = dst.getRange(1, 1, 1, dst.getLastColumn()).getValues()[0];
  var out = [];
  for (var i = 1; i < sv.length; i++) {
    var blank = true, row = dHead.map(function (h) {
      var idx = sCol[String(h).trim()];
      var val = idx == null ? '' : sv[i][idx];
      if (val !== '' && val != null) blank = false;
      return val == null ? '' : val;
    });
    if (!blank) out.push(row);
  }
  if (out.length) dst.getRange(2, 1, out.length, dHead.length).setValues(out);
  return out.length;
}

/* ================= HISTORY & USAGE LOGS (append-only; never overwritten) ================= */
// Record an operations event (order/job created, status changed, deleted) for the audit trail.
function logOps_(type, id, action, by, detail) {
  try { tab_('ops', 'History').appendRow([new Date(), type, id, action, by || '', detail || '']); } catch (e) {}
}
// Record a filament consumption line so we can run the numbers by category later.
function logUsage_(ref, material, color, grams, category, cost) {
  try { tab_('inv', 'Usage').appendRow([new Date(), ref, material, color, grams, category, cost]); } catch (e) {}
}
// Record a filament stock movement (deduction, manual edit, restock) with the resulting grams.
function logInvHistory_(material, color, change, newGrams, reason, by) {
  try { tab_('inv', 'History').appendRow([new Date(), material, color, change, newGrams, reason, by || '']); } catch (e) {}
}

// Manager: read the tail of the append-only logs (for verification + future analytics views).
function readLogs() {
  function tail(key, name, n) {
    var out = [];
    try {
      var sh = tab_(key, name), v = sh.getDataRange().getValues(), head = v[0];
      for (var i = v.length - 1; i >= 1 && out.length < n; i--) {
        var o = {}; head.forEach(function (h, j) { o[String(h).trim()] = v[i][j]; }); out.push(o);
      }
    } catch (e) {}
    return out;
  }
  return { ok: true, usage: tail('inv', 'Usage', 20), opsHistory: tail('ops', 'History', 20), invHistory: tail('inv', 'History', 20) };
}

/* ================= FINANCE: other costs, manager payouts, profit/loss ================= */
// Make a short unique id for an expense or payout row.
function finId_(prefix) { return uid_(prefix + '-'); }

// Read every row of a Finance tab, newest first, as objects keyed by header name.
function readFinance_(name) {
  var out = [];
  try {
    var sh = tab_('finance', name), v = sh.getDataRange().getValues(), head = v[0];
    for (var i = v.length - 1; i >= 1; i--) {
      if (!String(v[i][0] || '').trim()) continue;
      var o = {}; head.forEach(function (h, j) { o[String(h).trim()] = v[i][j]; });
      if (o.date) o.date = String(o.date);
      out.push(o);
    }
  } catch (e) {}
  return out;
}

// Insert or update one Finance row, matched by its id; fills each column by header name.
function saveFinance_(name, prefix, obj, session) {
  var sh = tab_('finance', name), v = sh.getDataRange().getValues(), head = v[0];
  var id = String(obj.id || '').trim() || finId_(prefix);
  obj.id = id;
  if (obj.by == null && session) obj.by = session.email;
  if (!obj.date) obj.date = new Date();
  obj.amount = Number(obj.amount || 0);
  var row = head.map(function (h) { var k = String(h).trim(); return obj[k] != null ? obj[k] : ''; });
  for (var i = 1; i < v.length; i++)
    if (String(v[i][0] || '').trim() === id) { sh.getRange(i + 1, 1, 1, row.length).setValues([row]); return { ok: true, id: id }; }
  sh.appendRow(row); return { ok: true, id: id };
}

function deleteFinance_(name, id) {
  id = String(id || '').trim();
  var sh = tab_('finance', name), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--)
    if (String(v[i][0] || '').trim() === id) { sh.deleteRow(i + 1); return { ok: true }; }
  return { ok: false, error: 'notfound', message: 'No trobat.' };
}

function readExpenses() { return { ok: true, data: readFinance_('Expenses') }; }
function saveExpense(e, session) { if (!e) return { ok: false, error: 'missing', message: 'Falta la despesa.' }; return saveFinance_('Expenses', 'EXP', e, session); }
function deleteExpense(id) { return deleteFinance_('Expenses', id); }
function readPayouts() { return { ok: true, data: readFinance_('Payouts') }; }
function savePayout(p, session) { if (!p) return { ok: false, error: 'missing', message: 'Falta el pagament.' }; return saveFinance_('Payouts', 'PAY', p, session); }
function deletePayout(id) { return deleteFinance_('Payouts', id); }

// Profit and loss: revenue from orders, minus production cost and other expenses, minus manager payouts.
// Sum a cost column from an Inventory tab, optionally only for one "YYYY-MM" period.
function sumInvCost_(tabName, period) {
  var total = 0;
  try {
    var u = tab_('inv', tabName).getDataRange().getValues(), c = indexMap(u[0]);
    for (var i = 1; i < u.length; i++) { if (period && !inPeriod_(u[i][c.date], period)) continue; total += Number(u[i][c.cost] || 0); }
  } catch (e) {}
  return total;
}
// Cash-basis P&L: money in (sales) minus money out (filament bought + other expenses + payouts).
function pnl() {
  try { maybeCloseMonths_(); } catch (e) { logErr_('maybeCloseMonths', e); }
  var orders = readOrders();
  var revenue = 0, productCostEstimate = 0, counted = 0;
  orders.forEach(function (o) { if (normStatus_(o.status) === 'cancelled') return; counted++; revenue += Number(o.revenue || 0); productCostEstimate += Number(o.cost || 0); });
  var expenses = readFinance_('Expenses'), payouts = readFinance_('Payouts');
  var byCat = {}, otherExpenses = 0;
  expenses.forEach(function (e) { var a = Number(e.amount || 0); otherExpenses += a; var c = String(e.category || 'altres'); byCat[c] = (byCat[c] || 0) + a; });
  var payoutTotal = 0, byManager = {};
  payouts.forEach(function (p) { var a = Number(p.amount || 0); payoutTotal += a; var m = String(p.manager || '?'); byManager[m] = (byManager[m] || 0) + a; });
  var filamentPurchased = sumInvCost_('Purchases');     // real cash spent on filament (cost basis)
  var filamentUsed = sumInvCost_('Usage');              // value consumed so far (informational)
  var grossProfit = revenue - filamentPurchased - otherExpenses;
  return {
    ok: true, data: {
      ordersCount: counted, revenue: revenue, filamentPurchased: filamentPurchased,
      otherExpenses: otherExpenses, expensesByCategory: byCat,
      filamentUsed: filamentUsed, productCostEstimate: productCostEstimate,
      grossProfit: grossProfit, payouts: payoutTotal, payoutsByManager: byManager,
      net: grossProfit - payoutTotal
    }
  };
}

/* ================= MONTH-END: close the books + a per-month tax packet ================= */

// True if a value's date falls in "YYYY-MM".
function inPeriod_(dateVal, period) {
  if (!dateVal) return false;
  var d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal).slice(0, 7) === period; // already "YYYY-MM-..."
  return period_(d) === period;
}

// Compute + store the P&L for one finished month, and write a detailed per-month sheet
// (jobs done + expenses) in the Finance file — the packet you hand the accountant.
function closeMonth_(period) {
  var orders = readOrders().filter(function (o) { return inPeriod_(o.date, period) && normStatus_(o.status) !== 'cancelled'; });
  var revenue = 0;
  orders.forEach(function (o) { revenue += Number(o.revenue || 0); });

  var expenses = readFinance_('Expenses').filter(function (e) { return inPeriod_(e.date, period); });
  var otherExpenses = 0; expenses.forEach(function (e) { otherExpenses += Number(e.amount || 0); });
  var payouts = readFinance_('Payouts').filter(function (p) { return String(p.period || '') === period || inPeriod_(p.date, period); });
  var payoutTotal = 0; payouts.forEach(function (p) { payoutTotal += Number(p.amount || 0); });

  // Filament cost = what we BOUGHT this month (cash basis), same as the live P&L.
  var filamentCost = sumInvCost_('Purchases', period);

  var jobsDone = readJobsDone_(period);
  var grossProfit = revenue - filamentCost - otherExpenses, net = grossProfit - payoutTotal;

  // 1) one row per month in Finance!Monthly (keyed by period). Period column is
  // kept as plain text so "YYYY-MM" isn't silently turned into a date by Sheets.
  var mSh = ensureTab_('finance', 'Monthly', systemSchema().finance.tabs.Monthly);
  textCol_(mSh, 1);
  var mv = mSh.getDataRange().getValues(), mHead = mv[0];
  var row = { period: period, ordersCount: orders.length, revenue: revenue, productionCost: filamentCost, filamentCost: filamentCost, otherExpenses: otherExpenses, grossProfit: grossProfit, payouts: payoutTotal, net: net, jobsDone: jobsDone.length, closedAt: new Date() };
  var rowArr = mHead.map(function (h) { var k = String(h).trim(); return row[k] != null ? row[k] : ''; });
  // Collect every row for this period: overwrite the first, delete any extras
  // (self-heals duplicates), or append if none exists yet.
  var matches = []; for (var r = 1; r < mv.length; r++) if (pstr_(mv[r][0]) === period) matches.push(r);
  if (matches.length) {
    mSh.getRange(matches[0] + 1, 1, 1, rowArr.length).setValues([rowArr]);
    for (var d = matches.length - 1; d >= 1; d--) mSh.deleteRow(matches[d] + 1);
  } else {
    mSh.appendRow(rowArr);
  }

  // 2) a per-month detail sheet (overwritten each run so it's always current).
  var ss = ss_('finance'), name = 'Mes ' + period, dSh = ss.getSheetByName(name);
  if (!dSh) dSh = ss.insertSheet(name); else dSh.clear();
  var block = [
    ['Tancament mensual', period], ['', ''],
    ['Comandes', orders.length], ['Ingressos (€)', revenue.toFixed(2)],
    ['Filament comprat (€)', filamentCost.toFixed(2)], ['Filament consumit (€, info)', sumInvCost_('Usage', period).toFixed(2)],
    ['Altres despeses (€)', otherExpenses.toFixed(2)], ['Benefici brut (€)', grossProfit.toFixed(2)],
    ['Pagaments a gestors (€)', payoutTotal.toFixed(2)], ['Net (€)', net.toFixed(2)],
    ['Feines impreses', jobsDone.length], ['', '']
  ];
  dSh.getRange(1, 1, block.length, 2).setValues(block);
  var rowN = block.length + 1;
  // Jobs-done table.
  dSh.getRange(rowN, 1).setValue('FEINES IMPRESES'); rowN++;
  var jHead = ['doneDate', 'category', 'owner', 'material', 'color', 'gramsEst', 'timeEst', 'orderRef', 'notes'];
  dSh.getRange(rowN, 1, 1, jHead.length).setValues([jHead]); rowN++;
  if (jobsDone.length) {
    var jRows = jobsDone.map(function (j) { return jHead.map(function (k) { var val = j[k]; return (val instanceof Date) ? Utilities.formatDate(val, 'GMT+1', 'yyyy-MM-dd') : (val != null ? val : ''); }); });
    dSh.getRange(rowN, 1, jRows.length, jHead.length).setValues(jRows); rowN += jRows.length;
  }
  rowN++;
  // Expenses table.
  dSh.getRange(rowN, 1).setValue('DESPESES'); rowN++;
  var eHead = ['date', 'category', 'description', 'amount', 'vat', 'supplier'];
  dSh.getRange(rowN, 1, 1, eHead.length).setValues([eHead]); rowN++;
  if (expenses.length) {
    var eRows = expenses.map(function (e) { return eHead.map(function (k) { var val = e[k]; return (val instanceof Date) ? Utilities.formatDate(val, 'GMT+1', 'yyyy-MM-dd') : (val != null ? val : ''); }); });
    dSh.getRange(rowN, 1, eRows.length, eHead.length).setValues(eRows);
  }
  dSh.setFrozenRows(1);
  logOps_('month', period, 'closed', '', 'rev ' + revenue.toFixed(2) + ' net ' + net.toFixed(2));
  return row;
}

// Lazily close any finished months we haven't closed yet (no time-trigger needed): runs
// cheaply on every dashboard load and does nothing once the previous month is recorded.
function maybeCloseMonths_() {
  // Cheap pre-check (no lock): nothing to do once the previous month is recorded.
  if (getSetting_('LAST_CLOSED_MONTH', '') >= prevPeriod_()) return;
  withLock_(function () {
    // Re-check inside the lock so two concurrent loads don't both close.
    var last = getSetting_('LAST_CLOSED_MONTH', ''), target = prevPeriod_();
    if (last && last >= target) return;
    var toClose = [];
    if (!last) toClose = [target];                     // first run: just the previous month
    else { var p = nextPeriod_(last); while (p <= target) { toClose.push(p); p = nextPeriod_(p); } }
    if (toClose.length > 12) toClose = toClose.slice(-12);
    toClose.forEach(function (pp) { try { closeMonth_(pp); } catch (e) { logErr_('closeMonth ' + pp, e); } });
    setSetting_('LAST_CLOSED_MONTH', target);
  });
}

// Manager: read the monthly ledger (newest first).
function readMonthly_() {
  try {
    var sh = ensureTab_('finance', 'Monthly', systemSchema().finance.tabs.Monthly), v = sh.getDataRange().getValues(), head = v[0], out = [];
    for (var i = v.length - 1; i >= 1; i--) { if (!String(v[i][0] || '').trim()) continue; var o = {}; head.forEach(function (h, j) { o[String(h).trim()] = v[i][j]; }); o.period = pstr_(o.period); out.push(o); }
    return out;
  } catch (e) { return []; }
}

// Manager: force-close a specific month on demand (e.g. re-run after late edits).
function closeMonthAction_(session, period) {
  period = String(period || prevPeriod_()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: 'period', message: 'Període no vàlid (YYYY-MM).' };
  var row = closeMonth_(period);
  return { ok: true, data: row };
}

/* ================= PRINT JOBS: the queue Albert prints from ================= */
// Read jobs (newest first) as objects, optionally filtered by status/category/owner.
function readJobs(filter) {
  var out = [];
  try {
    var sh = tab_('ops', 'Jobs'), v = sh.getDataRange().getValues(), head = v[0];
    for (var i = v.length - 1; i >= 1; i--) {
      if (!String(v[i][0] || '').trim()) continue;
      var o = {}; head.forEach(function (h, j) { o[String(h).trim()] = v[i][j]; });
      o.gramsEst = Number(o.gramsEst || 0); o.units = Number(o.units || 0); o.timeEst = Number(o.timeEst || 0);
      o.anyColor = String(o.anyColor).toLowerCase() === 'true' || o.anyColor === true;
      if (o.created) o.created = String(o.created);
      out.push(o);
    }
  } catch (e) {}
  if (filter) out = out.filter(function (j) {
    return (!filter.status || j.status === filter.status) &&
           (!filter.category || j.category === filter.category) &&
           (!filter.owner || j.owner === filter.owner);
  });
  return out;
}

// Insert or update one job (manager-created, or auto-made from an order). Keyed by id.
function saveJob(job, session) {
  if (!job) return { ok: false, error: 'missing', message: 'Falta la feina.' };
  var sh = tab_('ops', 'Jobs'); ensureColumn_(sh, 'timeEst');
  var v = sh.getDataRange().getValues(), head = v[0];
  var id = String(job.id || '').trim() || uid_('JOB-');
  var existed = !!String(job.id || '').trim();
  var vals = {
    id: id, created: job.created || new Date(), category: String(job.category || 'product'),
    owner: String(job.owner || ''), source: String(job.source || 'direct'),
    productId: String(job.productId || ''), link: String(job.link || ''),
    material: String(job.material || ''), color: String(job.color || ''),
    anyColor: job.anyColor ? true : false, units: Number(job.units || 1),
    gramsEst: Number(job.gramsEst || 0), timeEst: Number(job.timeEst || 0), priority: Number(job.priority || 0),
    status: String(job.status || 'pending'), orderRef: String(job.orderRef || ''),
    batchId: String(job.batchId || ''), notes: String(job.notes || '')
  };
  var row = head.map(function (h) { var k = String(h).trim(); return vals[k] != null ? vals[k] : ''; });
  // Remember a saved link in the reusable library.
  if (vals.link) { try { logLink_(vals.link, vals.category, vals.material, vals.color); } catch (e) {} }
  for (var i = 1; i < v.length; i++)
    if (String(v[i][0] || '').trim() === id) { sh.getRange(i + 1, 1, 1, row.length).setValues([row]); logOps_('job', id, 'edited', session ? session.email : '', vals.category); return { ok: true, id: id }; }
  sh.appendRow(row);
  logOps_('job', id, 'created', session ? session.email : '', vals.category);
  // Alert the workshop that there is a new print job.
  notifyNewJobs_('Nova feina d\'impressió', [vals]);
  return { ok: true, id: id };
}

// Bullet list + totals for a set of jobs (shared by the order alert and the new-job alert).
function jobLines_(jobs) {
  var totG = 0, totMin = 0;
  var body = jobs.map(function (j) {
    totG += Number(j.gramsEst || 0); totMin += Number(j.timeEst || 0);
    var what = j.link ? j.link : (j.notes || j.productId || '');
    return '• ' + String(j.category || '') + (j.owner ? '/' + j.owner : '') + ' — ' +
      j.material + ' ' + (j.anyColor ? '(qualsevol color)' : j.color) + ' · ' +
      Number(j.gramsEst || 0) + ' g · ~' + fmtMin_(j.timeEst) + (j.units > 1 ? ' · x' + j.units : '') + (what ? ' · ' + what : '');
  }).join('\n');
  return body + '\n\nTotal: ' + totG + ' g · ~' + fmtMin_(totMin) + ' de temps estimat.';
}
// Email the shop a summary of new print jobs (materials + rough time).
function notifyNewJobs_(title, jobs) {
  sendMail_({
    to: notifyEmail_(), subject: '[Impressió] ' + title + ' (' + jobs.length + ')',
    body: title + '\n\n' + jobLines_(jobs) + '\n\nObre la cua: acceso → Cua d\'impressió.'
  }, 'jobs');
}
function fmtMin_(min) { min = Number(min || 0); if (!min) return '?'; var h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + 'h ' : '') + (m ? m + 'min' : (h ? '' : '0min')); }

// Columns of the completed-jobs archive (Jobs columns + when/who/which month).
var JOBSDONE_COLS = ['id', 'created', 'category', 'owner', 'source', 'productId', 'link', 'material', 'color', 'anyColor', 'units', 'gramsEst', 'timeEst', 'priority', 'status', 'orderRef', 'batchId', 'notes', 'doneDate', 'doneBy', 'period'];

// Move a job through pending -> printing -> done. On the first "done": deduct filament,
// log it, archive the job to Operations!JobsDone (for monthly/tax tracking) and remove it
// from the live queue so the to-do list only ever shows outstanding work.
function setJobStatus(session, id, status) {
  id = String(id || '').trim(); status = String(status || 'pending');
  var by = session ? session.email : '';
  var sh = tab_('ops', 'Jobs'), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][col.id] || '').trim() !== id) continue;

    if (status !== 'done') {                       // ordinary status change, stays in the queue
      sh.getRange(i + 1, col.status + 1).setValue(status);
      logOps_('job', id, 'status:' + status, by, '');
      return { ok: true };
    }

    // --- marking done ---
    var material = String(v[i][col.material] || ''), color = String(v[i][col.color] || '');
    var grams = Number(v[i][col.gramsEst] || 0), category = String(v[i][col.category] || 'product');
    var warning = '';
    if (grams > 0 && material) {
      var fil = {}; readMaterials().forEach(function (f) { fil[matId(f.material, f.color)] = f; });
      var f = fil[matId(material, color)];
      var d = deductMaterial(material, color, grams);
      logUsage_(id, material, color, grams, category, grams * (f ? f.costPerGram : 0));
      var note = 'job ' + id + (d && d.short > 0 ? ' · FALTA ' + d.short + 'g' : '');
      logInvHistory_(material, color, -grams, d ? d.remaining : '', note, by);
      if (d && d.short > 0) warning = 'Atenció: ' + material + ' ' + color + ' sense estoc suficient (falten ' + d.short + ' g). Marcat igualment.';
    }
    // Archive a full snapshot, then delete the live row.
    var snap = {}; v[0].forEach(function (h, j) { snap[String(h).trim()] = v[i][j]; });
    snap.status = 'done'; snap.doneDate = new Date(); snap.doneBy = by; snap.period = period_(new Date());
    var doneSh = ensureTab_('ops', 'JobsDone', JOBSDONE_COLS);
    var dh = doneSh.getRange(1, 1, 1, doneSh.getLastColumn()).getValues()[0];
    var periodCol = dh.map(function (h) { return String(h).trim(); }).indexOf('period');
    if (periodCol >= 0) textCol_(doneSh, periodCol + 1);     // keep "YYYY-MM" as text
    doneSh.appendRow(dh.map(function (h) { var k = String(h).trim(); return snap[k] != null ? snap[k] : ''; }));
    sh.deleteRow(i + 1);
    logOps_('job', id, 'done', by, 'archived');
    return { ok: true, warning: warning };
  }
  return { ok: false, error: 'notfound', message: 'Feina no trobada.' };
}

// Read archived (completed) jobs, optionally for one "YYYY-MM" period, newest first.
function readJobsDone_(period) {
  try {
    var sh = ensureTab_('ops', 'JobsDone', JOBSDONE_COLS), v = sh.getDataRange().getValues(), head = v[0], out = [];
    for (var i = v.length - 1; i >= 1; i--) {
      if (!String(v[i][0] || '').trim()) continue;
      var o = {}; head.forEach(function (h, j) { o[String(h).trim()] = v[i][j]; });
      o.period = pstr_(o.period);
      if (period && o.period !== period) continue;
      out.push(o);
    }
    return out;
  } catch (e) { return []; }
}

function deleteJob(session, id) {
  id = String(id || '').trim();
  var sh = tab_('ops', 'Jobs'), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = v.length - 1; i >= 1; i--)
    if (String(v[i][col.id] || '').trim() === id) {
      var snap = {}; v[0].forEach(function (h, j) { snap[String(h).trim()] = v[i][j]; });
      logOps_('job', id, 'deleted', session ? session.email : '', JSON.stringify(snap));
      sh.deleteRow(i + 1); return { ok: true };
    }
  return { ok: false, error: 'notfound', message: 'Feina no trobada.' };
}

// Save/refresh a MakerWorld/Thingiverse link in the reusable Links library.
function logLink_(url, category, material, color) {
  var sh = tab_('ops', 'Links'), v = sh.getDataRange().getValues(), col = indexMap(v[0]);
  for (var i = 1; i < v.length; i++)
    if (String(v[i][col.url] || '').trim() === url) { sh.getRange(i + 1, col.timesPrinted + 1).setValue(Number(v[i][col.timesPrinted] || 0) + 1); return; }
  sh.appendRow([url, '', category || '', material || '', color || '', 1, '']);
}
function readLinks() { try { var sh = tab_('ops', 'Links'), v = sh.getDataRange().getValues(), head = v[0], out = []; for (var i = 1; i < v.length; i++) { if (!String(v[i][0] || '').trim()) continue; var o = {}; head.forEach(function (h, j) { o[String(h).trim()] = v[i][j]; }); out.push(o); } return { ok: true, data: out }; } catch (e) { return { ok: true, data: [] }; } }

// One order line can use several materials; make a print job for each, deferring deduction to print time.
function createJobsForOrder_(orderId, lines, productsById) {
  var sh = tab_('ops', 'Jobs'); ensureColumn_(sh, 'timeEst');
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var made = [];
  lines.forEach(function (line) {
    var p = productsById[line.id];
    var bom = (p && p.bom && p.bom.length) ? p.bom : [{ material: '', color: '', grams: 0 }];
    var qty = Number(line.qty || 1);
    // Rough print time comes from the product's internal estimate (minutes per unit).
    var timeEst = Number(p && p.printTimeMin ? p.printTimeMin : 0) * qty;
    bom.forEach(function (b) {
      var vals = {
        id: uid_('JOB-'), created: new Date(), category: 'product', owner: '', source: 'order',
        productId: line.id, link: '', material: String(b.material || ''), color: String(b.color || ''),
        anyColor: false, units: qty, gramsEst: Number(b.grams || 0) * qty, timeEst: timeEst,
        priority: 0, status: 'pending', orderRef: orderId, batchId: '', notes: line.name
      };
      sh.appendRow(head.map(function (h) { var k = String(h).trim(); return vals[k] != null ? vals[k] : ''; }));
      made.push(vals);
    });
  });
  // The caller (placeOrder) folds these into the single order alert — no separate email here.
  return made;
}

// Order the pending queue: mix categories by percentage, and keep same material/colour together to cut filament changes.
function batchPlan(perc) {
  return planQueue_(readJobs({ status: 'pending' }), perc);
}

// Pure ordering algorithm (no sheets) so it can be unit-tested directly.
// Weighted round-robin by category %, with same-material/colour lookahead to cut filament swaps.
function planQueue_(jobs, perc) {
  var cats = { product: [], research: [], personal: [] };
  jobs.forEach(function (j) { var c = (j.category === 'research' || j.category === 'personal') ? j.category : 'product'; cats[c].push(j); });
  var sortMC = function (a, b) {
    return String(a.material).localeCompare(String(b.material)) ||
           ((a.anyColor ? 1 : 0) - (b.anyColor ? 1 : 0)) ||
           String(a.color).localeCompare(String(b.color));
  };
  ['product', 'research', 'personal'].forEach(function (k) { cats[k].sort(sortMC); });

  var p = perc || { product: 60, research: 30, personal: 10 };
  var totalW = (Number(p.product) || 0) + (Number(p.research) || 0) + (Number(p.personal) || 0) || 100;
  var credit = { product: 0, research: 0, personal: 0 }, order = [], last = null, changes = 0;

  while (cats.product.length || cats.research.length || cats.personal.length) {
    credit.product += Number(p.product) || 0; credit.research += Number(p.research) || 0; credit.personal += Number(p.personal) || 0;
    // Pick the category most "owed" a turn that still has jobs.
    var pick = null, best = -Infinity;
    ['product', 'research', 'personal'].forEach(function (c) { if (cats[c].length && credit[c] > best) { best = credit[c]; pick = c; } });
    if (!pick) break;
    credit[pick] -= totalW;
    // Within that category, prefer a job on the same material/colour as the last one printed.
    var bucket = cats[pick], idx = 0;
    if (last) { for (var k = 0; k < bucket.length; k++) { if (bucket[k].material === last.material && (bucket[k].anyColor || bucket[k].color === last.color)) { idx = k; break; } } }
    var job = bucket.splice(idx, 1)[0];
    if (last && (last.material !== job.material || (!job.anyColor && last.color !== job.color))) changes++;
    order.push(job); last = job;
  }
  return { ok: true, order: order, filamentChanges: changes, count: order.length };
}

/* ================= RESILIENCE: version, health, self-test, recovery, visibility ================= */

// Bump on every backend deploy so the dashboard can show which engine it's talking to.
var ENGINE_VERSION = '2026-11-08.2';

// Run a labelled phase: a failure is LOGGED (visible in Estat) and returned as a flag, never thrown.
// Lets a multi-step action keep its critical result when a non-critical step fails.
function phase_(name, fn) {
  try { return { ok: true, value: fn() }; }
  catch (e) { logErr_('phase:' + name, e); return { ok: false, error: String(e) }; }
}

// Consumer MailApp is ~100 emails/day. Check before sending so we degrade visibly, not silently.
function canEmail_() { try { return MailApp.getRemainingDailyQuota() > 3; } catch (e) { return true; } }

// One place that sends mail: skips (and logs) when the quota is gone, logs any failure.
function sendMail_(opts, where) {
  if (!canEmail_()) { logErr_('mail-quota', 'skipped ' + (where || '') + ' (Gmail quota ~0)'); return false; }
  try { MailApp.sendEmail(opts); return true; }
  catch (e) { logErr_('mail:' + (where || ''), e); return false; }
}

// Recent error rows from Operations!History (type = error), newest first.
function recentErrors_(limit) {
  var out = [];
  try {
    var sh = tab_('ops', 'History'), v = sh.getDataRange().getValues(), c = indexMap(v[0]);
    for (var i = v.length - 1; i >= 1 && out.length < (limit || 50); i--) {
      if (String(v[i][c.type]) !== 'error') continue;
      out.push({ date: String(v[i][c.date]), where: String(v[i][c.id]), detail: String(v[i][c.detail]) });
    }
  } catch (e) {}
  return out;
}
function listErrors() { return { ok: true, data: recentErrors_(100) }; }

// Quick health snapshot (manager): version, sheets, counts, mail quota, recent errors, timings.
function health() {
  var t0 = Date.now(), out = { ok: true, version: ENGINE_VERSION, cardEnabled: cardEnabled_(), counts: {}, timings: {} };
  out.sheets = systemStatus().sheets;
  var tt = Date.now();
  try { out.counts.products = readProducts().length; } catch (e) { out.counts.products = 'ERR'; out.ok = false; }
  try { out.counts.orders = readOrders().length; } catch (e) { out.ok = false; }
  try { out.counts.jobsPending = readJobs({ status: 'pending' }).length; } catch (e) { out.ok = false; }
  try { out.counts.jobsDone = readJobsDone_('').length; } catch (e) {}
  try { out.counts.filaments = readMaterials().length; } catch (e) { out.ok = false; }
  out.timings.readsMs = Date.now() - tt;
  try { out.mailQuotaRemaining = MailApp.getRemainingDailyQuota(); } catch (e) {}
  var errs = recentErrors_(100); out.errorCount = errs.length; out.lastError = errs[0] || null;
  out.timings.totalMs = Date.now() - t0;
  return out;
}

// Live self-test (manager): exercises the real write paths on throwaway data, then cleans up.
// Mirrors R&R's runPortalSelfTest. Sends ONE alert email (saveJob) -- expected.
function selfTest(session) {
  var steps = [], t0 = Date.now(), ok = true;
  function step(name, fn) { var s = Date.now(); var r = phase_(name, fn); steps.push({ step: name, ok: r.ok, ms: Date.now() - s, error: r.error || '' }); if (!r.ok) ok = false; return r.value; }

  step('open 6 sheets', function () { for (var k in SS_KEYS) ss_(k); return true; });
  step('read settings', function () { if (!getSettings().ok) throw new Error('settings'); return true; });
  var mat = 'SELFTEST', col = '__st' + Math.floor(Math.random() * 1e6);
  step('save filament', function () { if (!saveMaterial({ material: mat, color: col, stock: 20, costPerGram: 0.02, lowAt: 5, active: true }, session).ok) throw new Error('saveMaterial'); return true; });
  var jobId = step('create job', function () { var r = saveJob({ category: 'research', material: mat, color: col, gramsEst: 30, units: 1, notes: '__selftest__', status: 'pending' }, session); if (!r.ok) throw new Error('saveJob'); return r.id; });
  step('mark done (deduct+archive)', function () { if (!setJobStatus(session, jobId, 'done').ok) throw new Error('setJobStatus'); return true; });
  step('verify archived', function () {
    if (readJobs({}).some(function (j) { return j.id === jobId; })) throw new Error('still in live queue');
    if (!readJobsDone_('').some(function (j) { return String(j.id) === jobId; })) throw new Error('not in JobsDone');
    return true;
  });
  step('cleanup', function () {
    try { var sh = tab_('ops', 'JobsDone'), v = sh.getDataRange().getValues(); for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]) === jobId) { sh.deleteRow(i + 1); break; } } catch (e) {}
    deleteMaterial(matId(mat, col));
    return true;
  });
  return { ok: ok, version: ENGINE_VERSION, totalMs: Date.now() - t0, steps: steps };
}

// Self-heal: every active order should have its print jobs. Recreate jobs for any active
// order that has none (orders are the source of truth; jobs derive from them). No duplicates:
// an order that already has pending OR archived jobs is left alone.
function reconcileJobs(session) {
  var orders = readOrders(), byId = {}; readProducts().forEach(function (p) { byId[p.id] = p; });
  var covered = {};
  readJobs({}).forEach(function (j) { if (j.orderRef) covered[j.orderRef] = true; });
  readJobsDone_('').forEach(function (j) { if (j.orderRef) covered[j.orderRef] = true; });
  var checked = 0, restored = 0;
  orders.forEach(function (o) {
    var st = normStatus_(o.status);
    if (st === 'cancelled' || st === 'delivered') return;
    checked++;
    if (covered[o.id]) return;
    var lines = (o.items || []).map(function (it) { return { id: it.id, name: it.name, qty: it.qty, price: it.price, cost: it.cost }; });
    if (!lines.length) return;
    try { var made = createJobsForOrder_(o.id, lines, byId) || []; restored += made.length; }
    catch (e) { logErr_('reconcileJobs ' + o.id, e); }
  });
  logOps_('reconcile', 'jobs', 'run', session ? session.email : '', 'checked ' + checked + ' restored ' + restored);
  return { ok: true, ordersChecked: checked, jobsRestored: restored };
}

// Off-site-ish backup: export every tab to one dated JSON file in the Drive "Backups" folder,
// so a wiped sheet can be restored (the sheets are the only source of truth otherwise).
function snapshotAll_(session) {
  var dump = { version: ENGINE_VERSION, at: new Date().toISOString(), sheets: {} }, schema = systemSchema();
  for (var key in schema) {
    dump.sheets[key] = {};
    for (var name in schema[key].tabs) {
      try { var sh = ss_(key).getSheetByName(name); if (sh) dump.sheets[key][name] = sh.getDataRange().getValues(); } catch (e) {}
    }
  }
  var blob = Utilities.newBlob(JSON.stringify(dump), 'application/json', 'backup-' + Utilities.formatDate(new Date(), 'GMT+1', 'yyyyMMdd-HHmmss') + '.json');
  var folderId = prop('DRIVE_FOLDER_ID');
  var parent = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  var subs = parent.getFoldersByName('Backups'), folder = subs.hasNext() ? subs.next() : parent.createFolder('Backups');
  var file = folder.createFile(blob);
  logOps_('backup', 'all', 'snapshot', session ? session.email : '', file.getId());
  return { ok: true, url: file.getUrl(), name: file.getName() };
}
