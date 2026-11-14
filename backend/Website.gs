/**
 * Prop a Prop Teu — what the public website needs from the engine:
 *   - the product tags (one fixed list, edited here in code)
 *   - "Request a prop": file uploads + the request itself (one email to us)
 *   - website orders: the customer's "order received" email (with the bank details),
 *     and, when a manager presses "Payment received", the invoice + confirmation email.
 */

// Product tags, by area and use. New tags are added here (not from the website).
var TAGS = [
  { id: 'neteja',    name: { ca: 'Neteja',    es: 'Limpieza',    en: 'Cleaning' } },
  { id: 'penjar',    name: { ca: 'Penjar',    es: 'Colgar',      en: 'Hanging' } },
  { id: 'eina',      name: { ca: 'Eina',      es: 'Herramienta', en: 'Tool' } },
  { id: 'fungible',  name: { ca: 'Fungible',  es: 'Fungible',    en: 'Consumable' } },
  { id: 'accessori', name: { ca: 'Accessori', es: 'Accesorio',   en: 'Accessory' } },
  { id: 'dressing',  name: { ca: 'Dressing',  es: 'Dressing',    en: 'Set dressing' } },
  { id: 'cablejat',  name: { ca: 'Cablejat',  es: 'Cableado',    en: 'Cable management' } },
  { id: 'seguretat', name: { ca: 'Seguretat', es: 'Seguridad',   en: 'Safety' } }
];
function validTags_(list) {
  var ok = {}; TAGS.forEach(function (t) { ok[t.id] = true; });
  return (list || []).map(String).filter(function (t, i, a) { return ok[t] && a.indexOf(t) === i; });
}

/* ============================ REQUEST A PROP ============================ */

var REQUEST_COLS = ['Date', 'Name', 'Email', 'Phone', 'Company', 'What they need', 'Quantity', 'Needed by', 'Delivery', 'Budget', 'Link', 'Files', 'Folder', 'Request ID', 'Language'];
var REQUEST_MAX_FILES = 5, REQUEST_MAX_BYTES = 10 * 1024 * 1024;
var REQUEST_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'mp4', 'mov', 'webm', 'm4v', 'pdf', 'stl', '3mf', 'obj', 'step', 'stp'];

// Drive: <product images folder>/Requests/<request id> (renamed when the request is sent).
function requestsFolder_() {
  var id = prop('DRIVE_FOLDER_ID');
  var parent = id ? DriveApp.getFolderById(id) : DriveApp.getRootFolder();
  var f = parent.getFoldersByName('Requests');
  return f.hasNext() ? f.next() : parent.createFolder('Requests');
}
function requestFolder_(reqId, create) {
  var root = requestsFolder_(), f = root.getFoldersByName(reqId);
  if (f.hasNext()) return f.next();
  return create ? root.createFolder(reqId) : null;
}
function validReqId_(id) { return /^[a-z0-9-]{8,64}$/i.test(String(id || '')); }

// Public: one file of a request. Files go up one by one (each call stays small), into a
// folder named after the request id that the browser made when the page opened.
function requestFile(req) {
  if (!floodOk_('requestFile')) return { ok: false, error: 'rate' };
  if (!validReqId_(req.reqId)) return { ok: false, error: 'missing' };
  var name = String(req.filename || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  var ext = (name.split('.').pop() || '').toLowerCase();
  if (REQUEST_EXT.indexOf(ext) < 0) return { ok: false, error: 'type' };
  var b64 = String(req.dataBase64 || '');
  if (b64.indexOf(',') >= 0) b64 = b64.split(',')[1];
  var bytes = Utilities.base64Decode(b64);
  if (!bytes.length || bytes.length > REQUEST_MAX_BYTES) return { ok: false, error: 'size' };
  var folder = requestFolder_(String(req.reqId), true);
  // A retry of a file that already arrived is accepted without saving it twice.
  var count = 0, it = folder.getFiles(); while (it.hasNext()) { if (it.next().getName() === name) return { ok: true, already: true }; count++; }
  if (count >= REQUEST_MAX_FILES) return { ok: false, error: 'count' };
  folder.createFile(Utilities.newBlob(bytes, String(req.mimeType || 'application/octet-stream'), name));
  return { ok: true };
}

// Public: the request itself. Stored in Clients!Requests and emailed to us once.
function requestProp(req) {
  if (req.company_hp) return { ok: true };
  if (!floodOk_('requestProp')) return { ok: false, error: 'rate' };
  var reqId = String(req.reqId || '');
  if (!validReqId_(reqId)) return { ok: false, error: 'missing' };
  var f = function (k, max) { return String(req[k] || '').trim().slice(0, max || 300); };
  var d = { name: f('name'), email: f('email'), phone: f('phone'), company: f('company'), what: f('what', 5000),
    quantity: f('quantity', 40), needBy: f('needBy', 40), delivery: f('delivery', 60), budget: f('budget', 80), link: f('link', 600), lang: f('lang', 4) };
  if (!d.name || !d.email || !d.what) return { ok: false, error: 'missing' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return { ok: false, error: 'email' };

  var sh = ensureTab_('clients', 'Requests', REQUEST_COLS), v = sh.getDataRange().getValues(), idCol = v[0].map(String).indexOf('Request ID');
  for (var i = 1; i < v.length; i++) if (String(v[i][idCol]) === reqId) return { ok: true, already: true };

  // Name the request's file folder so it reads well in Drive.
  var folder = requestFolder_(reqId, false), files = [], blobs = [], total = 0, folderUrl = '';
  if (folder) {
    folder.setName(Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd') + ' ' + d.name.replace(/[\/\\]/g, ' ') + ' (' + reqId.slice(0, 8) + ')');
    folderUrl = folder.getUrl();
    var it = folder.getFiles();
    while (it.hasNext()) { var file = it.next(); files.push(file); total += file.getSize(); }
    if (total <= 15 * 1024 * 1024) files.forEach(function (x) { blobs.push(x.getBlob()); });
  }
  var row = { 'Date': new Date(), 'Name': d.name, 'Email': d.email, 'Phone': d.phone, 'Company': d.company, 'What they need': d.what,
    'Quantity': d.quantity, 'Needed by': d.needBy, 'Delivery': d.delivery, 'Budget': d.budget, 'Link': d.link,
    'Files': files.map(function (x) { return x.getName(); }).join(', '), 'Folder': folderUrl, 'Request ID': reqId, 'Language': d.lang };
  sh.appendRow(v[0].map(function (h) { return row[String(h)] != null ? row[String(h)] : ''; }));

  var body = 'New prop request\n\n' +
    'Name: ' + d.name + '\nEmail: ' + d.email + '\nPhone: ' + (d.phone || '—') + '\nCompany: ' + (d.company || '—') + '\n' +
    'Quantity: ' + (d.quantity || '—') + '\nNeeded by: ' + (d.needBy || '—') + '\nDelivery: ' + (d.delivery || '—') + '\nBudget: ' + (d.budget || '—') + '\n\n' +
    'What they need:\n' + d.what + '\n\n' +
    (d.link ? 'Link to files: ' + d.link + '\n' : '') +
    (files.length ? 'Files (' + files.length + '): ' + folderUrl + '\n' + files.map(function (x) { return '· ' + x.getName() + ' — ' + x.getUrl(); }).join('\n') + '\n' : 'No files attached.\n') +
    (files.length && !blobs.length ? '(Files are too big to attach; open the folder above.)\n' : '') +
    '\nReply to this email to answer the customer directly.';
  var opts = { to: notifyEmail_(), replyTo: d.email, subject: 'New prop request — ' + d.name + (d.company ? ' (' + d.company + ')' : ''), body: body };
  if (blobs.length) opts.attachments = blobs;
  sendMail_(opts, 'request');
  return { ok: true };
}

/* ============================ WEBSITE ORDERS: CUSTOMER EMAILS ============================ */

var MAILS = {
  received: {
    subject: { es: 'Pedido {id} recibido — Prop a Prop Teu', ca: 'Comanda {id} rebuda — Prop a Prop Teu', en: 'Order {id} received — Prop a Prop Teu' },
    body: {
      es: 'Hola {name},\n\nGracias por tu pedido. Estos son los detalles:\n\n{lines}\nTotal: {total} € (IVA incluido)\n\n' +
          'Para completar la compra, haz una transferencia bancaria por el importe total:\n\nTitular: {holder}\nIBAN: {iban}\nConcepto: {id}\n\n' +
          'Cuando recibamos la transferencia, te enviaremos un email confirmando la compra, con la factura adjunta. Después te escribiremos para acordar el envío o la recogida.\n\n' +
          'Si tienes cualquier duda, responde a este correo.\n\nUn saludo,\nProp a Prop Teu',
      ca: 'Hola {name},\n\nGràcies per la teva comanda. Aquests són els detalls:\n\n{lines}\nTotal: {total} € (IVA inclòs)\n\n' +
          'Per completar la compra, fes una transferència bancària per l\'import total:\n\nTitular: {holder}\nIBAN: {iban}\nConcepte: {id}\n\n' +
          'Quan rebem la transferència, t\'enviarem un correu confirmant la compra, amb la factura adjunta. Després t\'escriurem per acordar l\'enviament o la recollida.\n\n' +
          'Si tens qualsevol dubte, respon aquest correu.\n\nUna salutació,\nProp a Prop Teu',
      en: 'Hello {name},\n\nThank you for your order. Here are the details:\n\n{lines}\nTotal: {total} € (VAT included)\n\n' +
          'To complete the purchase, please make a bank transfer for the total amount:\n\nAccount holder: {holder}\nIBAN: {iban}\nReference: {id}\n\n' +
          'Once we receive the transfer, we\'ll email you to confirm the purchase, with the invoice attached. We\'ll then get in touch to arrange delivery or pickup.\n\n' +
          'If you have any questions, just reply to this email.\n\nBest regards,\nProp a Prop Teu'
    }
  },
  paid: {
    subject: { es: 'Pago recibido — pedido {id}', ca: 'Pagament rebut — comanda {id}', en: 'Payment received — order {id}' },
    body: {
      es: 'Hola {name},\n\nHemos recibido el pago de tu pedido {id}. ¡Muchas gracias!\n\nTe adjuntamos la factura {invoice}.\n\nEn breve te escribimos para acordar el envío o la recogida.\n\nUn saludo,\nProp a Prop Teu',
      ca: 'Hola {name},\n\nHem rebut el pagament de la teva comanda {id}. Moltes gràcies!\n\nT\'adjuntem la factura {invoice}.\n\nAviat t\'escriurem per acordar l\'enviament o la recollida.\n\nUna salutació,\nProp a Prop Teu',
      en: 'Hello {name},\n\nWe\'ve received the payment for your order {id}. Thank you very much!\n\nPlease find invoice {invoice} attached.\n\nWe\'ll be in touch shortly to arrange delivery or pickup.\n\nBest regards,\nProp a Prop Teu'
    }
  }
};
function fill_(tpl, v) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
function mailLang_(l) { l = String(l || '').toLowerCase(); return (l === 'ca' || l === 'en') ? l : 'es'; }
function orderLines_(items) {
  return (items || []).map(function (l) { return '· ' + l.qty + ' × ' + l.name + ' — ' + (Number(l.price) * Number(l.qty)).toFixed(2) + ' €'; }).join('\n') + '\n';
}

// Email 1, sent when the website order is placed: summary + bank details (never shown on the site).
function sendOrderReceived_(order) {
  if (!order.email) return false;
  var lang = mailLang_(order.lang), items = parseItems_(order.items);
  var v = { name: order.customerName, id: order.key, lines: orderLines_(items), total: Number(order.price || 0).toFixed(2),
    holder: getSetting_('BANK_HOLDER', 'Prop a Prop Teu'), iban: getSetting_('BANK_IBAN', '[IBAN]') };
  return sendMail_({ to: order.email, name: 'Prop a Prop Teu', subject: fill_(MAILS.received.subject[lang], v), body: fill_(MAILS.received.body[lang], v) }, 'customer');
}
function parseItems_(s) { try { return JSON.parse(String(s || '[]')) || []; } catch (e) { return []; } }

/* ============================ PAYMENT RECEIVED + INVOICE ============================ */

function isTestOrder_(o) { return /ZZTEST/.test(String(o.customerName || '') + ' ' + String(o.notes || '')); }

// The pre-filled email shown to the manager before sending (editable).
function paymentDraft(session, key) {
  var o = byKey_(tbl_('orders'), 'key', key);
  if (!o) return { ok: false, error: 'notfound', message: 'Order not found.' };
  if (!o.email) return { ok: false, error: 'email', message: 'This order has no customer email.' };
  var lang = mailLang_(o.lang);
  var invoice = String(o.invoiceNo || '') || (isTestOrder_(o) ? 'TEST-…' : null) || ('F' + new Date().getFullYear() + '-' + ('0000' + (Number(getSetting_('INVOICE_SEQ', '0')) + 1)).slice(-4));
  var v = { name: o.customerName, id: o.key, invoice: invoice };
  return { ok: true, to: String(o.email), subject: fill_(MAILS.paid.subject[lang], v), body: fill_(MAILS.paid.body[lang], v),
    invoiceNo: invoice, already: !!o.payEmailAt };
}

// "Payment received": number + create the invoice (once), email it with the edited text
// (once), and mark the order paid. A retry reuses the same invoice and never sends twice.
function confirmPayment(session, key, subject, body) {
  var ot = tbl_('orders'), o = byKey_(ot, 'key', key);
  if (!o) return { ok: false, error: 'notfound', message: 'Order not found.' };
  if (o.payEmailAt) return { ok: true, already: true, invoiceNo: String(o.invoiceNo), invoiceUrl: String(o.invoiceUrl) };
  if (!o.email) return { ok: false, error: 'email', message: 'This order has no customer email.' };
  if (!String(subject || '').trim() || !String(body || '').trim()) return { ok: false, error: 'missing', message: 'The email needs a subject and a text.' };

  // A test order (ZZTEST) never uses a real invoice number: the real series must stay consecutive.
  if (!o.invoiceNo && isTestOrder_(o)) setRow_(ot, o, { invoiceNo: 'TEST-' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyMMddHHmmss') });
  if (!o.invoiceNo) {
    var seq = Number(getSetting_('INVOICE_SEQ', '0')) + 1;
    setSetting_('INVOICE_SEQ', String(seq));
    setRow_(ot, o, { invoiceNo: 'F' + new Date().getFullYear() + '-' + ('0000' + seq).slice(-4) });
  }
  var file = null;
  if (o.invoiceUrl) { try { file = DriveApp.getFileById(String(o.invoiceUrl).match(/[-\w]{25,}/)[0]); } catch (e) { file = null; } }
  if (!file) { file = makeInvoicePdf_(o); setRow_(ot, o, { invoiceUrl: file.getUrl() }); }

  var sent = sendMail_({ to: String(o.email), name: 'Prop a Prop Teu', subject: String(subject), body: String(body), attachments: [file.getBlob()] }, 'payment');
  if (!sent) return { ok: false, error: 'mail', message: 'The invoice was created but the email could not be sent. Try again.' };
  setRow_(ot, o, { paidAt: o.paidAt || new Date(), payEmailAt: new Date() });
  logOps_('order', key, 'paid', session ? session.email : '', 'invoice ' + o.invoiceNo);
  return { ok: true, invoiceNo: String(o.invoiceNo), invoiceUrl: String(o.invoiceUrl) };
}

// The invoice PDF, saved in Drive: <images folder>/Invoices/<year>/<number>.pdf.
// With a company + NIF it is a full invoice; otherwise a simplified invoice.
function makeInvoicePdf_(o) {
  var f = fiscalData(), items = parseItems_(o.items), total = Number(o.price || 0);
  var ivaPct = Number(getSetting_('IVA', '21')) || 21, base = total / (1 + ivaPct / 100), iva = total - base;
  var full = !!(String(o.company || '').trim() && String(o.nif || '').trim());
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
  var rows = items.map(function (l) {
    return '<tr><td>' + esc(l.qty) + '</td><td>' + esc(l.name) + '</td><td class="r">' + Number(l.price).toFixed(2) + ' €</td><td class="r">' + (Number(l.price) * Number(l.qty)).toFixed(2) + ' €</td></tr>';
  }).join('');
  var client = full
    ? '<strong>' + esc(o.company) + '</strong><br>NIF: ' + esc(o.nif) + '<br>' + esc(o.billingAddress || o.address || '')
    : esc(o.customerName) + (o.email ? '<br>' + esc(o.email) : '');
  var html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#111;font-size:12px;padding:34px}' +
    'h1{font-size:20px;letter-spacing:1px;margin:0 0 18px}table{width:100%;border-collapse:collapse;margin-top:16px}' +
    'th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}.r{text-align:right}.muted{color:#666}' +
    '.tot td{border:none;padding:3px 7px}.tot tr:last-child td{font-weight:bold}.cols{display:flex;justify-content:space-between;gap:30px}</style></head><body>' +
    '<h1>' + (full ? 'FACTURA' : 'FACTURA SIMPLIFICADA') + '</h1>' +
    '<p class="muted">Nº <strong>' + esc(o.invoiceNo) + '</strong> · Fecha ' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy') + ' · Pedido ' + esc(o.key) + '</p>' +
    '<table style="margin-top:6px"><tr><td style="border:none;vertical-align:top;width:50%"><strong>' + esc(f.name) + '</strong><br>NIF: ' + esc(f.nif) + '<br>' + esc(f.addr) + '<br>' + esc(f.email) + '</td>' +
    '<td style="border:none;vertical-align:top"><span class="muted">Cliente</span><br>' + client + '</td></tr></table>' +
    '<table><tr><th>Ud.</th><th>Concepto</th><th class="r">Precio</th><th class="r">Importe</th></tr>' + rows + '</table>' +
    '<table class="tot" style="width:45%;margin-left:auto;margin-top:12px">' +
    '<tr><td>Base imponible</td><td class="r">' + base.toFixed(2) + ' €</td></tr>' +
    '<tr><td>IVA (' + ivaPct + '%)</td><td class="r">' + iva.toFixed(2) + ' €</td></tr>' +
    '<tr><td>TOTAL</td><td class="r">' + total.toFixed(2) + ' €</td></tr></table>' +
    '<p class="muted" style="margin-top:34px">Precios con IVA incluido.</p></body></html>';
  var pdf = Utilities.newBlob(html, 'text/html', 'invoice.html').getAs('application/pdf').setName(o.invoiceNo + ' - ' + o.key + '.pdf');
  var id = prop('DRIVE_FOLDER_ID'), parent = id ? DriveApp.getFolderById(id) : DriveApp.getRootFolder();
  var inv = parent.getFoldersByName('Invoices'); inv = inv.hasNext() ? inv.next() : parent.createFolder('Invoices');
  var year = String(new Date().getFullYear()), y = inv.getFoldersByName(year); y = y.hasNext() ? y.next() : inv.createFolder(year);
  return y.createFile(pdf);
}
