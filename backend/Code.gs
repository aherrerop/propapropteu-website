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
var SHEET_PRODUCTS = 'Products';
var SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

/* ============================ ROUTER ============================ */

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var action = req.action;

    // Public action: login.
    if (action === 'login') return json(login(req));

    // Everything else needs a valid session token.
    var session = verifyToken(req.token);
    if (!session) return json({ ok: false, error: 'auth', message: 'Sessió no vàlida o caducada.' });

    switch (action) {
      case 'me':           return json({ ok: true, user: session });
      case 'listProducts': return json({ ok: true, data: readProducts() });
      case 'saveProduct':  return json(saveProduct(req.product));
      case 'deleteProduct':return json(deleteProduct(req.id));
      case 'uploadImage':  return json(uploadImage(req));
      case 'publish':      return json(publish(session));
      default:             return json({ ok: false, error: 'unknown_action', message: 'Acció desconeguda: ' + action });
    }
  } catch (err) {
    return json({ ok: false, error: 'server', message: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: 'propapropteu-admin', time: new Date().toISOString() });
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

  var row = findManager(email);
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
var PRODUCT_COLS = ['id','type','price','stock','featured','cutout','codename','heroImage',
  'labels','images','name','short','description','heroTagline','heroDesc','specs'];
var PRODUCT_JSON_COLS = ['labels','images','name','short','description','heroTagline','heroDesc','specs'];

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
  var payload = {
    _readme: existing._readme || 'Managed from the admin dashboard. Edit via acceso.html.',
    labels: existing.labels || [],
    products: readProducts()
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
