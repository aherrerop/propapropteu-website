/**
 * Prop a Prop Teu — the internal management system (4 sections).
 *
 *   Products   what is sold on the public website
 *   Orders     Yerai enters what has to be made
 *   To-do      Albert's printing queue, grouped by material + colour
 *   Materials  filament left, in grams
 *
 * Google Sheets keeps the records nobody needs on screen:
 *   Operations!Order list / Pieces   the live data behind Orders and To-do
 *   Operations!Print history         one readable row per printed piece
 *   Operations!Deleted               pieces removed without being printed
 *   Finance!Finances                 one row per completed order (price, cost, profit)
 *   Inventory!To buy                 rolls flagged for repurchase
 *
 * Every write is keyed by an id and checks what is already there first, so a double
 * click, a refresh or a retry after an error never records anything twice.
 */

var MATERIAL_TYPES = ['PLA', 'PETG', 'ABS'];
var ORDER_TYPES = ['Product', 'Prototype', 'Personal'];

// Column layouts of the tabs this file owns (new columns go at the END only).
var MG = {
  ORDERS:   ['key', 'no', 'created', 'by', 'type', 'price', 'notes', 'source', 'status', 'completedAt', 'emailSent'],
  PIECES:   ['id', 'orderKey', 'orderNo', 'created', 'productId', 'name', 'link', 'material', 'color', 'anyColor', 'copies', 'grams', 'status', 'preparedAt', 'printedAt', 'roll', 'cost', 'deducted'],
  HISTORY:  ['Date', 'Order', 'Type', 'Product', 'Link', 'Copies', 'Material', 'Color', 'Grams', 'Cost (EUR)', 'Stock left (g)', 'By', 'Piece ID'],
  DELETED:  ['Date', 'Order', 'Type', 'Product', 'Link', 'Copies', 'Material', 'Color', 'Order notes', 'By', 'Piece ID'],
  FINANCES: ['Completed', 'Order', 'Type', 'Products', 'Grams', 'Selling price (EUR)', 'Internal cost (EUR)', 'Profit (EUR)', 'Notes', 'Order key'],
  TOBUY:    ['Date', 'Material', 'Color', 'Rolls', 'Cost per roll (EUR)', 'Added by']
};
function ordersTab_()   { return ensureTab_('ops', 'Order list', MG.ORDERS); }
function piecesTab_()   { return ensureTab_('ops', 'Pieces', MG.PIECES); }
function historyTab_()  { return ensureTab_('ops', 'Print history', MG.HISTORY); }
function deletedTab_()  { return ensureTab_('ops', 'Deleted', MG.DELETED); }
function financesTab_() { return ensureTab_('finance', 'Finances', MG.FINANCES); }
function toBuyTab_()    { return ensureTab_('inv', 'To buy', MG.TOBUY); }

/* ---------- small sheet helpers: rows as objects, keyed by header name ---------- */

// Read a tab into { sh, head, rows } where each row is an object plus its sheet row number.
function table_(sh) {
  var v = sh.getDataRange().getValues();
  var head = v[0].map(function (h) { return String(h).trim(); }), rows = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0] || '').trim() === '') continue;
    var o = { _row: i + 1 };
    head.forEach(function (h, j) { o[h] = v[i][j]; });
    rows.push(o);
  }
  return { sh: sh, head: head, rows: rows };
}
// Append an object as a new row (missing fields stay blank).
function appendObj_(t, obj) {
  t.sh.appendRow(t.head.map(function (h) { return obj[h] != null ? obj[h] : ''; }));
}
// Change some cells of one existing row.
function patchRow_(t, rowNum, patch) {
  for (var k in patch) { var c = t.head.indexOf(k); if (c >= 0) t.sh.getRange(rowNum, c + 1).setValue(patch[k]); }
}
function isTrue_(v) { return v === true || String(v).toLowerCase() === 'true'; }
function who_(session) { return session ? (session.name || session.email || '') : ''; }
function iso_(d) { return (d instanceof Date) ? d.toISOString() : String(d || ''); }
function money_(n) { return Math.round(Number(n || 0) * 100) / 100; }

/* ============================ MATERIALS ============================ */

// Inventory lives in Inventory!Filaments. costPerRoll and lastTx were added later, at the end.
function matTable_() {
  var sh = tab_('inv', 'Filaments');
  ensureColumn_(sh, 'costPerRoll'); ensureColumn_(sh, 'lastTx');
  return table_(sh);
}
function matView_(r) {
  return {
    id: matId(r.material, r.color), material: String(r.material).trim(), color: String(r.color || '').trim(),
    hex: String(r.hex || ''), grams: Number(r.grams || 0),
    costPerRoll: (r.costPerRoll === '' || r.costPerRoll == null) ? '' : Number(r.costPerRoll)
  };
}
function readMaterials() { return matTable_().rows.map(matView_); }

// New material (no id) or edit of an existing one (id = the entry being edited).
// Adding a material + colour that already exists adds its grams to that entry.
function saveMaterial(session, m) {
  m = m || {};
  var material = String(m.material || '').trim().toUpperCase(), color = String(m.color || '').trim();
  if (MATERIAL_TYPES.indexOf(material) < 0) return { ok: false, error: 'material', message: 'Choose PLA, PETG or ABS.' };
  if (!color) return { ok: false, error: 'color', message: 'Enter the color name.' };
  var grams = Math.max(0, Number(m.grams || 0));
  var cost = (m.costPerRoll === '' || m.costPerRoll == null) ? '' : Number(m.costPerRoll);
  var t = matTable_(), key = matId(material, color), editId = String(m.id || '');
  var same = null, editing = null;
  t.rows.forEach(function (r) { var id = matId(r.material, r.color); if (id === key) same = r; if (editId && id === editId) editing = r; });

  if (editId) {
    if (!editing) return { ok: false, error: 'notfound', message: 'Material not found.' };
    if (same && same !== editing) return { ok: false, error: 'exists', message: material + ' ' + color + ' already exists.' };
    patchRow_(t, editing._row, { material: material, color: color, hex: String(m.hex || ''), grams: grams, costPerRoll: cost });
    return { ok: true, id: key };
  }
  if (same) {
    var patch = { grams: Number(same.grams || 0) + grams };
    if (m.hex) patch.hex = String(m.hex);
    if (cost !== '') patch.costPerRoll = cost;
    patchRow_(t, same._row, patch);
    return { ok: true, id: key, merged: true };
  }
  appendObj_(t, { material: material, color: color, hex: String(m.hex || ''), grams: grams, costPerRoll: cost, active: true });
  return { ok: true, id: key };
}
function deleteMaterial(id) {
  var t = matTable_();
  for (var i = t.rows.length - 1; i >= 0; i--)
    if (matId(t.rows[i].material, t.rows[i].color) === id) { t.sh.deleteRow(t.rows[i]._row); return { ok: true }; }
  return { ok: false, error: 'notfound', message: 'Material not found.' };
}
// Repurchase icon: add one roll of this material + colour to the Inventory!To buy list.
function repurchase(session, id) {
  var r = matTable_().rows.filter(function (x) { return matId(x.material, x.color) === id; })[0];
  if (!r) return { ok: false, error: 'notfound', message: 'Material not found.' };
  toBuyTab_().appendRow([new Date(), r.material, r.color, 1, r.costPerRoll === '' ? '' : Number(r.costPerRoll || 0), who_(session)]);
  return { ok: true };
}
// One-off: replace the whole inventory with a given list (used to load the starting stock).
function resetMaterials(session, list) {
  if (!list || !list.length) return { ok: false, error: 'missing', message: 'Empty list.' };
  var t = matTable_();
  if (t.sh.getLastRow() > 1) t.sh.deleteRows(2, t.sh.getLastRow() - 1);
  list.forEach(function (m) {
    appendObj_(t, { material: String(m.material).toUpperCase(), color: m.color, hex: m.hex || '', grams: Number(m.grams || 0),
      costPerRoll: (m.costPerRoll == null ? '' : m.costPerRoll), active: true });
  });
  return { ok: true, count: list.length };
}

/* ============================ ORDERS ============================ */

function pieceView_(p) {
  return {
    id: String(p.id), orderKey: String(p.orderKey), orderNo: Number(p.orderNo || 0), created: iso_(p.created),
    productId: String(p.productId || ''), name: String(p.name || ''), link: String(p.link || ''),
    material: String(p.material || ''), color: String(p.color || ''), anyColor: isTrue_(p.anyColor),
    copies: Math.max(1, Number(p.copies || 1)), grams: (p.grams === '' || p.grams == null) ? '' : Number(p.grams),
    status: String(p.status || 'todo')
  };
}
function isActive_(status) { return status === 'todo' || status === 'prepared' || status === 'printing'; }
function nextOrderNo_() {
  var n = Number(getSetting_('ORDER_SEQ', '0')) + 1;
  setSetting_('ORDER_SEQ', String(n));
  return n;
}
// Validate + normalise one product line coming from the order form.
function cleanPiece_(p, requireMaterial) {
  var material = String(p.material || '').trim().toUpperCase();
  var any = p.anyColor ? true : false;
  var out = {
    id: String(p.id || '').trim(), productId: String(p.productId || '').trim(), name: String(p.name || '').trim(),
    link: String(p.link || '').trim(), material: material, color: any ? '' : String(p.color || '').trim(), anyColor: any,
    copies: Math.max(1, Math.floor(Number(p.copies || 1))),
    grams: (p.grams === '' || p.grams == null) ? '' : Math.max(0, Number(p.grams))
  };
  if (out.id.length < 8) return { error: 'A product line has no id.' };
  if (!out.name) return { error: 'Every product needs a name.' };
  if (requireMaterial) {
    if (MATERIAL_TYPES.indexOf(material) < 0) return { error: 'Choose a material for "' + out.name + '".' };
    if (!any && !out.color) return { error: 'Choose a color (or "Color not important") for "' + out.name + '".' };
  }
  return out;
}

// Create or update an order. The key and the piece ids are made by the browser when the
// form opens, so saving the same form twice updates the same order instead of adding one.
function saveOrder(session, o) {
  o = o || {};
  var key = String(o.key || '').trim();
  if (key.length < 8) return { ok: false, error: 'key', message: 'Missing order key.' };
  var type = ORDER_TYPES.indexOf(String(o.type)) >= 0 ? String(o.type) : 'Product';
  var price = (o.price === '' || o.price == null) ? '' : money_(o.price);
  var notes = String(o.notes || '').trim();
  if (!o.pieces || !o.pieces.length) return { ok: false, error: 'pieces', message: 'Add at least one product.' };
  var clean = [];
  for (var i = 0; i < o.pieces.length; i++) {
    var c = cleanPiece_(o.pieces[i], true);
    if (c.error) return { ok: false, error: 'piece', message: c.error };
    clean.push(c);
  }

  var ot = table_(ordersTab_()), pt = table_(piecesTab_());
  var order = ot.rows.filter(function (r) { return String(r.key) === key; })[0];

  if (!order) {
    var no = nextOrderNo_(), now = new Date();
    appendObj_(ot, { key: key, no: no, created: now, by: who_(session), type: type, price: price, notes: notes, source: 'manual', status: 'active' });
    clean.forEach(function (c) { appendPiece_(pt, key, no, now, c); });
    var mailed = notifyNewOrder_(key);
    return { ok: true, key: key, no: no, created: true, emailed: mailed };
  }

  if (String(order.status) !== 'active') return { ok: false, error: 'closed', message: 'This order is already closed.' };
  patchRow_(ot, order._row, { type: type, price: price, notes: notes });
  var mine = pt.rows.filter(function (r) { return String(r.orderKey) === key; });
  var seen = {};
  clean.forEach(function (c) {
    seen[c.id] = true;
    var ex = mine.filter(function (r) { return String(r.id) === c.id; })[0];
    if (!ex) { appendPiece_(pt, key, order.no, new Date(), c); return; }
    var st = String(ex.status);
    if (st !== 'todo' && st !== 'prepared') return;            // printed / deleted / mid-print: leave as is
    patchRow_(pt, ex._row, { productId: c.productId, name: c.name, link: c.link, material: c.material, color: c.color, anyColor: c.anyColor, copies: c.copies, grams: c.grams });
  });
  // Lines removed from the form are deleted (and kept in the Deleted tab).
  mine.forEach(function (r) {
    var st = String(r.status);
    if (!seen[String(r.id)] && (st === 'todo' || st === 'prepared')) removePiece_(pt, r, order, session);
  });
  closeOrderIfDone_(key);
  return { ok: true, key: key, no: Number(order.no), created: false };
}
function appendPiece_(pt, key, no, when, c) {
  appendObj_(pt, { id: c.id, orderKey: key, orderNo: no, created: when, productId: c.productId, name: c.name, link: c.link,
    material: c.material, color: c.color, anyColor: c.anyColor, copies: c.copies, grams: c.grams, status: 'todo' });
}
// Mark a piece deleted and write a readable row in Operations!Deleted (once).
function removePiece_(pt, r, order, session) {
  var dt = table_(deletedTab_());
  var already = dt.rows.some(function (d) { return String(d['Piece ID']) === String(r.id); });
  if (!already) dt.sh.appendRow([new Date(), '#' + r.orderNo, order ? order.type : '', r.name, r.link, Number(r.copies || 1),
    r.material, isTrue_(r.anyColor) ? 'Color not important' : r.color, order ? order.notes : '', who_(session), r.id]);
  patchRow_(pt, r._row, { status: 'deleted' });
}

// The single "new order" alert. Sent once, only when the order row is first created.
function notifyNewOrder_(key) {
  var sent = false;
  try { MailApp.sendEmail(notifyEmail_(), 'New order added to the to-do list', ''); sent = true; }
  catch (e) {
    try { MailApp.sendEmail(notifyEmail_(), 'New order added to the to-do list', ' '); sent = true; }
    catch (e2) { logErr_('new-order email ' + key, e2); }
  }
  if (sent) {
    var ot = table_(ordersTab_());
    var o = ot.rows.filter(function (r) { return String(r.key) === key; })[0];
    if (o) patchRow_(ot, o._row, { emailSent: true });
  }
  return sent;
}

// Active orders with their open product lines, newest first (the Orders screen).
function listOrders() {
  var ot = table_(ordersTab_()), pt = table_(piecesTab_()), byOrder = {}, printed = {};
  pt.rows.forEach(function (p) {
    var k = String(p.orderKey), st = String(p.status);
    if (st === 'printed') printed[k] = (printed[k] || 0) + 1;
    if (isActive_(st)) (byOrder[k] = byOrder[k] || []).push(pieceView_(p));
  });
  var out = [];
  ot.rows.forEach(function (o) {
    if (String(o.status) !== 'active') return;
    out.push({ key: String(o.key), no: Number(o.no), created: iso_(o.created), type: String(o.type), price: o.price === '' ? '' : Number(o.price),
      notes: String(o.notes || ''), source: String(o.source || ''), pieces: byOrder[String(o.key)] || [], printed: printed[String(o.key)] || 0 });
  });
  out.sort(function (a, b) { return b.no - a.no; });
  return { ok: true, data: out };
}

// Delete a whole order: every open line goes to the Deleted tab.
function deleteOrder(session, key) {
  key = String(key || '');
  var ot = table_(ordersTab_()), pt = table_(piecesTab_());
  var order = ot.rows.filter(function (r) { return String(r.key) === key; })[0];
  if (!order) return { ok: false, error: 'notfound', message: 'Order not found.' };
  pt.rows.forEach(function (r) { if (String(r.orderKey) === key && isActive_(String(r.status))) removePiece_(pt, r, order, session); });
  closeOrderIfDone_(key);
  return { ok: true };
}

/* ============================ TO-DO ============================ */

// Group the open pieces for printing. PURE (no sheets) so it can be unit-tested.
//  - same material + same colour = one group
//  - "color not important" joins the smallest group of its material (own group if none)
//  - inside a group: prepared first, then oldest first
//  - groups: those with something prepared first, then heaviest, then oldest
function groupTodo_(pieces, mats) {
  var hex = {};
  (mats || []).forEach(function (m) { hex[String(m.material).toUpperCase() + '|' + String(m.color).toLowerCase()] = m.hex || ''; });
  var byTime = function (a, b) { return String(a.created).localeCompare(String(b.created)) || (a.orderNo - b.orderNo) || String(a.id).localeCompare(String(b.id)); };
  var sorted = pieces.slice().sort(byTime), groups = {}, list = [];
  function group(key, material, color, label) {
    if (!groups[key]) { groups[key] = { key: key, material: material, color: color, label: label, hex: hex[key] || '', pieces: [] }; list.push(groups[key]); }
    return groups[key];
  }
  sorted.forEach(function (p) {
    if (!p.material || p.anyColor) return;
    var key = String(p.material).toUpperCase() + '|' + String(p.color).toLowerCase();
    group(key, p.material, p.color, p.material + ' · ' + p.color).pieces.push(p);
  });
  var weight = function (g) { return g.pieces.reduce(function (s, p) { return s + Number(p.grams || 0); }, 0); };
  var copies = function (g) { return g.pieces.reduce(function (s, p) { return s + Number(p.copies || 1); }, 0); };
  // Sizes are measured before any "color not important" piece joins, so the choice is stable.
  var size = {}; list.forEach(function (g) { size[g.key] = { w: weight(g), c: copies(g), t: String(g.pieces[0].created) }; });
  sorted.forEach(function (p) {
    if (!p.material || !p.anyColor) return;
    var cands = list.filter(function (g) { return size[g.key] && String(g.material).toUpperCase() === String(p.material).toUpperCase(); });
    if (!cands.length) { group(String(p.material).toUpperCase() + '|*', p.material, '', p.material + ' · Any color').pieces.push(p); return; }
    cands.sort(function (a, b) { return (size[a.key].w - size[b.key].w) || (size[a.key].c - size[b.key].c) || size[a.key].t.localeCompare(size[b.key].t); });
    cands[0].pieces.push(p);
  });
  sorted.forEach(function (p) { if (!p.material) group('?', '', '', 'Material not set').pieces.push(p); });

  var prepared = function (p) { return p.status === 'prepared' || p.status === 'printing'; };
  list.forEach(function (g) {
    g.pieces.sort(function (a, b) { return (prepared(b) ? 1 : 0) - (prepared(a) ? 1 : 0) || byTime(a, b); });
    g.grams = weight(g);
    g.hasPrepared = g.pieces.some(prepared);
    g.oldest = g.pieces.reduce(function (m, p) { return (!m || String(p.created) < m) ? String(p.created) : m; }, '');
  });
  list.sort(function (a, b) {
    return ((a.key === '?') - (b.key === '?')) || ((b.hasPrepared ? 1 : 0) - (a.hasPrepared ? 1 : 0)) || (b.grams - a.grams) || a.oldest.localeCompare(b.oldest);
  });
  return list;
}

// The To-do screen: open pieces (with their order's details) already grouped and ordered.
function todo() {
  var ot = table_(ordersTab_()), pt = table_(piecesTab_()), orders = {};
  ot.rows.forEach(function (o) { orders[String(o.key)] = o; });
  var pieces = [];
  pt.rows.forEach(function (p) {
    if (!isActive_(String(p.status))) return;
    var v = pieceView_(p), o = orders[v.orderKey] || {};
    v.orderType = String(o.type || ''); v.orderPrice = (o.price === '' || o.price == null) ? '' : Number(o.price); v.orderNotes = String(o.notes || '');
    pieces.push(v);
  });
  var mats = readMaterials();
  return { ok: true, groups: groupTodo_(pieces, mats), materials: mats };
}

function findPiece_(pt, id) { return pt.rows.filter(function (r) { return String(r.id) === String(id); })[0]; }

// Tick / untick "prepared for printing" (G-code sent). Never touches inventory.
function setPrepared(session, id, on) {
  var pt = table_(piecesTab_()), p = findPiece_(pt, id);
  if (!p) return { ok: false, error: 'notfound', message: 'Not found.' };
  var st = String(p.status);
  if (st !== 'todo' && st !== 'prepared') return { ok: true, status: st };
  patchRow_(pt, p._row, on ? { status: 'prepared', preparedAt: new Date() } : { status: 'todo', preparedAt: '' });
  return { ok: true, status: on ? 'prepared' : 'todo' };
}
// Albert enters the real weight (total grams for the card).
function setGrams(session, id, grams) {
  var pt = table_(piecesTab_()), p = findPiece_(pt, id);
  if (!p) return { ok: false, error: 'notfound', message: 'Not found.' };
  if (!isActive_(String(p.status)) || String(p.status) === 'printing') return { ok: false, error: 'closed', message: 'This product is already closed.' };
  patchRow_(pt, p._row, { grams: (grams === '' || grams == null) ? '' : Math.max(0, Number(grams)) });
  return { ok: true };
}
// The X on a card: remove that product from the to-do (kept in the Deleted tab).
function deletePiece(session, id) {
  var pt = table_(piecesTab_()), p = findPiece_(pt, id);
  if (!p) return { ok: false, error: 'notfound', message: 'Not found.' };
  var st = String(p.status);
  if (st === 'deleted' || st === 'printed') return { ok: true };
  if (st === 'printing') return { ok: false, error: 'printing', message: 'This product is half-recorded as printed. Press Printed again to finish it.' };
  var order = table_(ordersTab_()).rows.filter(function (r) { return String(r.key) === String(p.orderKey); })[0];
  removePiece_(pt, p, order, session);
  closeOrderIfDone_(String(p.orderKey));
  return { ok: true };
}

// PRINTED: deduct the real grams, write the history row, close the order if it was the last
// piece. Each step first checks whether it already happened, so pressing twice (or retrying
// after an error half-way) finishes the same transaction instead of repeating it.
function printPiece(session, id, roll) {
  var pt = table_(piecesTab_()), p = findPiece_(pt, id);
  if (!p) return { ok: false, error: 'notfound', message: 'Not found.' };
  var st = String(p.status);
  if (st === 'printed') return { ok: true, already: true };
  if (st === 'deleted') return { ok: false, error: 'deleted', message: 'This product was deleted.' };
  var grams = Number(p.grams || 0);
  if (!(grams > 0)) return { ok: false, error: 'weight', message: 'Enter the weight in grams before marking it as printed.' };

  // Which roll was used: the one already recorded, the one chosen now, or the piece's own colour.
  var rollId = String(p.roll || '') || String(roll || '') || (isTrue_(p.anyColor) || !p.material ? '' : matId(p.material, p.color));
  var mt = matTable_();
  var m = mt.rows.filter(function (r) { return matId(r.material, r.color) === rollId; })[0];
  if (!m) return { ok: false, error: 'roll', message: 'Choose the roll that was used.' };

  // 1. Remember the decision, so a retry uses the same roll and weight.
  if (st !== 'printing') patchRow_(pt, p._row, { status: 'printing', roll: rollId, printedAt: new Date() });

  // 2. Deduct once. The roll keeps the id of the last piece deducted from it (lastTx),
  //    written in the same call as the new grams.
  var have = Number(m.grams || 0), left = have, shortBy = 0;
  if (!isTrue_(p.deducted)) {
    if (String(m.lastTx) !== String(p.id)) {
      left = have - grams; if (left < 0) { shortBy = -left; left = 0; }
      var row = mt.head.map(function (h) { return h === 'grams' ? left : (h === 'lastTx' ? String(p.id) : (m[h] != null ? m[h] : '')); });
      mt.sh.getRange(m._row, 1, 1, row.length).setValues([row]);
    }
    patchRow_(pt, p._row, { deducted: true });
  }

  // 3. One readable history row per piece.
  var cost = money_(grams * Number(m.costPerRoll || 0) / 1000);
  var order = table_(ordersTab_()).rows.filter(function (r) { return String(r.key) === String(p.orderKey); })[0];
  var ht = table_(historyTab_());
  if (!ht.rows.some(function (h) { return String(h['Piece ID']) === String(p.id); }))
    ht.sh.appendRow([new Date(), '#' + p.orderNo, order ? order.type : '', p.name, p.link, Number(p.copies || 1), m.material, m.color, grams, cost, left, who_(session), p.id]);

  // 4. Done: it leaves the to-do. 5. Last piece of the order -> one finance row.
  patchRow_(pt, p._row, { status: 'printed', cost: cost });
  closeOrderIfDone_(String(p.orderKey));
  return { ok: true, stockLeft: left, warning: shortBy ? ('Stock for ' + m.material + ' ' + m.color + ' was ' + shortBy + ' g short; it is now 0.') : '' };
}

// When an order has no open pieces left: completed (one Finances row) if anything was
// printed, otherwise just closed as deleted. Safe to call any number of times.
function closeOrderIfDone_(key) {
  var ot = table_(ordersTab_()), order = ot.rows.filter(function (r) { return String(r.key) === key; })[0];
  if (!order || String(order.status) !== 'active') return;
  var mine = table_(piecesTab_()).rows.filter(function (r) { return String(r.orderKey) === key; });
  if (mine.some(function (r) { return isActive_(String(r.status)); })) return;
  var printed = mine.filter(function (r) { return String(r.status) === 'printed'; });
  if (!printed.length) { patchRow_(ot, order._row, { status: 'deleted', completedAt: new Date() }); return; }

  var ft = table_(financesTab_());
  if (!ft.rows.some(function (f) { return String(f['Order key']) === key; })) {
    var grams = 0, cost = 0, names = [];
    printed.forEach(function (r) {
      grams += Number(r.grams || 0); cost += Number(r.cost || 0);
      names.push((Number(r.copies || 1) > 1 ? r.copies + 'x ' : '') + r.name);
    });
    var price = Number(order.price || 0);
    ft.sh.appendRow([new Date(), '#' + order.no, order.type, names.join(', '), grams, money_(price), money_(cost), money_(price - cost), order.notes, key]);
  }
  patchRow_(ot, order._row, { status: 'completed', completedAt: new Date() });
}

// A checkout on the public website also lands in the to-do (material still to be chosen).
function addWebOrderToTodo_(orderId, lines, total, note) {
  var ot = table_(ordersTab_());
  if (ot.rows.some(function (r) { return String(r.key) === orderId; })) return;
  var pt = table_(piecesTab_()), no = nextOrderNo_(), now = new Date();
  appendObj_(ot, { key: orderId, no: no, created: now, by: 'website', type: 'Product', price: money_(total),
    notes: 'Web order ' + orderId + (note ? ' — ' + note : ''), source: 'web', status: 'active' });
  lines.forEach(function (l, i) {
    appendPiece_(pt, orderId, no, now, { id: orderId + '-' + (i + 1), productId: l.id, name: l.name, link: '', material: '', color: '', anyColor: false, copies: Math.max(1, Number(l.qty || 1)), grams: '' });
  });
  notifyNewOrder_(orderId);
}

/* ============================ PRODUCTS ============================ */

// Only the fields the Products screen shows.
function productView_(p) {
  var tri = function (v) { v = v || {}; return (typeof v === 'string') ? { en: v, ca: v, es: v } : { en: v.en || '', ca: v.ca || '', es: v.es || '' }; };
  return { id: p.id, code: p.codename || '', name: tri(p.name), price: Number(p.price || 0),
    printTime: p.printTimeMin == null ? '' : p.printTimeMin, short: tri(p.short), description: tri(p.description), image: (p.images && p.images[0]) || '' };
}
function listProductsSimple() { return { ok: true, data: readProducts().map(productView_) }; }

// Keep only simple formatting in the long description.
function sanitizeHtml_(s) {
  var allowed = ['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'p', 'br'];
  s = String(s || '').replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)[^>]*>/g, function (all, slash, tag) {
    tag = tag.toLowerCase(); if (tag === 'div') tag = 'p';
    return allowed.indexOf(tag) < 0 ? '' : '<' + slash + tag + '>';
  });
  return s.replace(/&nbsp;/g, ' ').trim();
}
// "Easy Hang ATLAS" -> "easy-hang-atlas" (made unique among existing ids).
function slug_(name, taken) {
  var s = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
  var out = s, n = 2;
  while (taken[out]) out = s + '-' + (n++);
  return out;
}
// English is what the manager types. A missing Catalan/Spanish text is machine-translated;
// if that fails the English text is copied, so no language is ever left empty.
function fillLanguages_(v, html) {
  v = v || {};
  var en = html ? sanitizeHtml_(v.en) : String(v.en || '').trim(), out = { en: en };
  ['ca', 'es'].forEach(function (l) {
    var t = html ? sanitizeHtml_(v[l]) : String(v[l] || '').trim();
    if (!t && en) {
      try { t = LanguageApp.translate(en, 'en', l, html ? { contentType: 'html' } : {}); } catch (e) { t = ''; }
      t = html ? sanitizeHtml_(t) : String(t || '').trim();
      if (!t) t = en;
    }
    out[l] = t;
  });
  return out;
}

// Save a product and put it on the public website straight away (no Publish button).
function saveProductSimple(session, d) {
  d = d || {};
  if (!d.name || !String(d.name.en || '').trim()) return { ok: false, error: 'name', message: 'Enter the product name.' };
  var all = readProducts(), taken = {}, existing = null;
  all.forEach(function (p) { taken[p.id] = true; if (d.id && p.id === d.id) existing = p; });
  if (d.id && !existing) return { ok: false, error: 'notfound', message: 'Product not found.' };

  var p = existing || { type: 'own', labels: [], images: [] };
  p.id = existing ? existing.id : slug_(d.name.en, taken);
  p.name = fillLanguages_(d.name, false);
  p.short = fillLanguages_(d.short, false);
  p.description = fillLanguages_(d.description, true);
  p.price = Number(d.price || 0);
  p.codename = String(d.code || '').trim();
  p.printTimeMin = (d.printTime === '' || d.printTime == null) ? '' : Number(d.printTime);
  if (d.image) p.images = [String(d.image)];
  if (!p.labels) p.labels = [];
  p.active = true;

  var saved = saveProduct(p);
  if (!saved.ok) return saved;
  var pub = publish(session);
  return { ok: true, id: p.id, published: pub.ok, message: pub.ok ? '' : ('Saved, but the website update failed: ' + (pub.message || '')) };
}
function deleteProductSimple(session, id) {
  var del = deleteProduct(id);
  if (!del.ok) return del;
  var pub = publish(session);
  return { ok: true, published: pub.ok, message: pub.ok ? '' : ('Deleted, but the website update failed: ' + (pub.message || '')) };
}

/* ============================ MAINTENANCE ============================ */

// Remove TEST rows (their product name or notes contain `marker`) from the tabs this file
// owns, so a test run leaves the records clean. Not used by any screen.
function purgeTest(session, marker) {
  marker = String(marker || '').trim();
  if (marker.length < 6) return { ok: false, error: 'marker', message: 'Marker too short.' };
  var removed = {};
  function purge(sh, cols, label) {
    var t = table_(sh), n = 0;
    for (var i = t.rows.length - 1; i >= 0; i--) {
      var r = t.rows[i];
      if (cols.some(function (c) { return String(r[c] == null ? '' : r[c]).indexOf(marker) >= 0; })) { sh.deleteRow(r._row); n++; }
    }
    removed[label] = n;
  }
  purge(piecesTab_(), ['name'], 'pieces');
  purge(ordersTab_(), ['notes'], 'orders');
  purge(historyTab_(), ['Product'], 'history');
  purge(deletedTab_(), ['Product', 'Order notes'], 'deleted');
  purge(financesTab_(), ['Products', 'Notes'], 'finances');
  purge(toBuyTab_(), ['Color'], 'toBuy');
  return { ok: true, removed: removed };
}
