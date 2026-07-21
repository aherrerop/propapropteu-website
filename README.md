# Prop a Prop Teu — Website

Static website (plain HTML/CSS/JS, no build step) ready for GitHub Pages.
Everything is editable with a text editor. This README covers every routine task.

## Structure

```
index.html          Shop (catalog with label filters)
product.html        Product detail (?id=product-id)
custom-props.html   Custom props gallery + quote form
about.html / team.html / contact.html / faq.html / legal.html / 404.html
css/theme.css       ALL colors, fonts, shapes — edit this to re-brand
css/styles.css      Layout (rarely needs editing)
js/config.js        Business data: email, WhatsApp, social links, Snipcart key
js/i18n.js          Language engine
js/layout.js        Shared header/footer/nav (edit nav ONCE here)
js/catalog.js       Shop logic
js/product.js       Product page logic
data/products.json  THE CATALOG — add/edit products here
lang/ca.json, es.json, en.json   All UI text per language
assets/logo.svg     Logo (replace with the real one)
assets/img/products/             Product images
```

## 1. Add a product

1. Put images in `assets/img/products/` (square, ~1000×1000 px, JPG or PNG).
2. Open `data/products.json`, copy an existing block inside `"products"`, edit:
   - `id`: unique, no spaces (used in the URL)
   - `type`: `"own"` (your design) | `"std"` (bought product) | `"tool"`
   - `price`: EUR, IVA included
   - `stock`: number; `0` shows "sold out"; delete the field for unlimited
   - `labels`: ids from the `"labels"` list at the top (add new labels there)
   - `name` / `short` / `description`: text in ca/es/en
   - `specs`: datasheet rows (label in 3 languages + value)
   - `featured: true` pins it to the top of the default sort
3. Commit and push. Done — no other file changes needed.

## 2. Change the logo / colors / fonts

- Logo: replace `assets/logo.svg` (any SVG/PNG; if PNG, update the path in
  `js/config.js` → `logo`). Adjust size via `--logo-height` in `css/theme.css`.
- Colors, fonts, corner rounding, shadows: all in `css/theme.css`, commented.
  There's a ready-made dark theme block you can uncomment to try.
- Fonts come from Google Fonts (Oswald + Inter), loaded in each page's `<head>`.
  To change fonts: swap the Google Fonts URL and the `--font-*` variables.

## 3. Edit texts / translations

- UI text: `lang/ca.json`, `lang/es.json`, `lang/en.json` (same keys in each).
- Product text: inside `data/products.json`.
- Legal pages: directly in `legal.html` (one block per language).
- Team member names/bios: keys `team.*` in the lang files.
- Adding a 4th language: copy `lang/en.json` → `lang/fr.json`, translate,
  add `"fr"` to `languages` in `js/config.js`, add translated blocks in `legal.html`.

Default language: auto-detects the browser (ca/es/en), falls back to Catalan.
Configurable in `js/config.js` (`autoDetectLang`, `defaultLang`).

## 4. Set up the cart (Snipcart)

1. Create an account at https://snipcart.com (free in test mode; ~2% + payment
   fees per live transaction, 10 EUR/mo minimum once you have sales).
2. Dashboard → API keys → copy the **public Test key**, paste it into
   `js/config.js` → `snipcartApiKey`. The cart appears automatically.
3. Dashboard → Store configuration:
   - **Taxes**: add IVA 21%, "included in price".
   - **Shipping**: add rates (e.g. Península flat rate, Balears, pickup).
   - **Payments**: connect Stripe or PayPal.
4. When ready to sell, swap the Test key for the **Live key**.

**Live-mode note:** Snipcart validates each order by fetching the product's
`data-item-url` (we point it at `product.html?id=...`). Because this site
renders products with JavaScript, enable one of these in Snipcart:
Dashboard → Store configuration → **Order validation: use JavaScript-rendered
pages**, or switch validation to a JSON file (see
https://docs.snipcart.com/v3/setup/order-validation). Test mode works without this.

## 5. Set up the forms (contact + quotes)

1. Create a free form at https://formspree.io → copy the endpoint URL.
2. Paste it into `js/config.js` → `formEndpoint`. Both forms use it.

## 6. Fill in your real data

In `js/config.js`: email, WhatsApp number, phone, address, social media URLs
(empty string hides an icon). In `legal.html`: replace every `[BRACKETED]`
placeholder and have the texts reviewed — they are templates, not legal advice.

## 7. Deploy to GitHub Pages

```
1. Create a repo (e.g. propaproteu-web) and push these files to main.
2. Repo → Settings → Pages → Source: "Deploy from a branch",
   branch main, folder / (root). Save.
3. Site goes live at https://<user>.github.io/propaproteu-web/
```

Custom domain (recommended for a shop): buy `propaproteu.com`, add it in
Settings → Pages → Custom domain, and create the DNS records GitHub shows you.
HTTPS is automatic.

All internal paths are relative, so the site works both at the repo subpath
and on a custom domain without changes.

## 8. Test locally

Open a terminal in this folder and run either:

```
python -m http.server 8000     # then visit http://localhost:8000
npx serve .
```

(Fetching JSON files requires a local server; double-clicking index.html won't load products.)

## Before going live — checklist

- [ ] Replace `assets/logo.svg` with the real logo
- [ ] Replace all placeholder images (products, custom props gallery, team photos)
- [ ] Real texts in About / Team (currently `[bracketed]` placeholders)
- [ ] Fill `js/config.js` (email, WhatsApp, socials, Formspree endpoint)
- [ ] Complete `legal.html` with real fiscal data + review
- [ ] Snipcart: taxes (IVA 21% included), shipping rates, payment provider, Live key
- [ ] Test one full purchase in Snipcart test mode first
