/* ============================================================
   Product pages + sitemap.
   Every product gets its own page, p/<id>.html: a copy of product.html with the product's
   name, description and picture written into the <head>, so WhatsApp, Google and social
   networks show them (they don't run the site's JavaScript). Made on every publish, and
   locally by tools/build-pages.js — both use the two pure functions below.
   ============================================================ */

var SITE_URL = 'https://propapropteu.com';
var SITE_LANGS = ['es', 'ca', 'en'];          // es = default (no ?lang)
var SITEMAP_PAGES = ['', 'shop.html', 'custom-props.html', 'about.html', 'contact.html', 'faq.html', 'envios.html', 'packs.html', 'legal.html'];

function pickLang_(v, l) { return v == null ? '' : (typeof v === 'string' ? v : (v[l] || v.es || v.ca || v.en || '')); }
function escHtml_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function absUrl_(u) { u = String(u || ''); return /^https?:\/\//.test(u) ? u : SITE_URL + '/' + u.replace(/^\.?\//, ''); }

// product.html (the template) -> p/<id>.html for one product.
function productPageHtml_(template, p) {
  var name = pickLang_(p.name, 'es'), desc = pickLang_(p.short, 'es') || name;
  var url = SITE_URL + '/p/' + encodeURIComponent(p.id) + '.html';
  var img = absUrl_((p.images && p.images[0]) || 'assets/og-image.png');
  var title = name + ' — Prop a Prop Teu';
  var head =
    '\n  <!-- Made automatically from product.html on publish. Do not edit: edit product.html. -->' +
    '\n  <base href="/">' +
    '\n  <meta name="description" content="' + escHtml_(desc) + '">' +
    '\n  <link rel="canonical" href="' + url + '">' +
    '\n  <meta property="og:type" content="product">' +
    '\n  <meta property="og:site_name" content="Prop a Prop Teu">' +
    '\n  <meta property="og:title" content="' + escHtml_(title) + '">' +
    '\n  <meta property="og:description" content="' + escHtml_(desc) + '">' +
    '\n  <meta property="og:image" content="' + escHtml_(img) + '">' +
    '\n  <meta property="og:url" content="' + url + '">' +
    '\n  <meta name="twitter:card" content="summary_large_image">';
  var s = String(template).replace(/\r\n/g, '\n');
  s = s.replace(/<html lang="[a-z]+">/, '<html lang="es">');
  s = s.replace(/(<meta charset="[^"]*">)/i, function (m) { return m + head; });
  s = s.replace(/<title>[\s\S]*?<\/title>/, '<title>' + escHtml_(title) + '</title>');
  s = s.replace(/<body([^>]*)>/, '<body$1 data-product="' + escHtml_(p.id) + '">');
  return s;
}

// sitemap.xml: every page in every language (?lang=), plus every product page.
function sitemapXml_(products) {
  var loc = function (path, l) { return SITE_URL + '/' + path + (l === 'es' ? '' : '?lang=' + l); };
  var entry = function (path) {
    return SITE_LANGS.map(function (l) {
      return '  <url><loc>' + escHtml_(loc(path, l)) + '</loc>' +
        SITE_LANGS.map(function (a) { return '<xhtml:link rel="alternate" hreflang="' + a + '" href="' + escHtml_(loc(path, a)) + '"/>'; }).join('') +
        '<xhtml:link rel="alternate" hreflang="x-default" href="' + escHtml_(loc(path, 'es')) + '"/></url>';
    }).join('\n');
  };
  var paths = SITEMAP_PAGES.concat((products || []).map(function (p) { return 'p/' + encodeURIComponent(p.id) + '.html'; }));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    paths.map(entry).join('\n') + '\n</urlset>\n';
}

// On publish: write p/*.html + sitemap.xml in ONE commit (and remove pages of deleted
// products). Never breaks the publish itself: errors come back as a short note.
function publishPages_(products) {
  try {
    var token = prop('GH_TOKEN'), owner = prop('GH_OWNER'), repo = prop('GH_REPO'), branch = prop('GH_BRANCH') || 'main';
    var base = 'https://api.github.com/repos/' + owner + '/' + repo;
    var h = { Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
    var call = function (method, path, body) {
      var r = UrlFetchApp.fetch(base + path, { method: method, headers: h, contentType: 'application/json', muteHttpExceptions: true, payload: body ? JSON.stringify(body) : undefined });
      return { code: r.getResponseCode(), json: (function () { try { return JSON.parse(r.getContentText()); } catch (e) { return null; } })() };
    };
    var ref = call('get', '/git/ref/heads/' + branch); if (ref.code !== 200) return 'pages: ref ' + ref.code;
    var head = ref.json.object.sha;
    var commit = call('get', '/git/commits/' + head); if (commit.code !== 200) return 'pages: commit ' + commit.code;
    var tpl = call('get', '/contents/product.html?ref=' + branch); if (tpl.code !== 200) return 'pages: template ' + tpl.code;
    var template = Utilities.newBlob(Utilities.base64Decode(tpl.json.content.replace(/\n/g, ''))).getDataAsString('UTF-8');

    var tree = [], keep = {};
    products.forEach(function (p) {
      var path = 'p/' + p.id + '.html'; keep[path] = true;
      tree.push({ path: path, mode: '100644', type: 'blob', content: productPageHtml_(template, p) });
    });
    tree.push({ path: 'sitemap.xml', mode: '100644', type: 'blob', content: sitemapXml_(products) });
    var dir = call('get', '/contents/p?ref=' + branch);
    if (dir.code === 200) dir.json.forEach(function (f) { if (/\.html$/.test(f.name) && !keep[f.path]) tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); });

    var nt = call('post', '/git/trees', { base_tree: commit.json.tree.sha, tree: tree }); if (nt.code !== 201) return 'pages: tree ' + nt.code;
    if (nt.json.sha === commit.json.tree.sha) return 'pages: unchanged';
    var nc = call('post', '/git/commits', { message: 'Product pages + sitemap (publish)', tree: nt.json.sha, parents: [head] }); if (nc.code !== 201) return 'pages: new commit ' + nc.code;
    var up = call('patch', '/git/refs/heads/' + branch, { sha: nc.json.sha }); if (up.code !== 200) return 'pages: update ' + up.code;
    return 'pages: ok';
  } catch (e) { return 'pages: ' + e.message; }
}
