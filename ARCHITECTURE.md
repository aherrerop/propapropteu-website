# Prop a Prop Teu — how the site works

A static site (HTML/CSS/JS) on GitHub Pages, trilingual (ca/es/en), with a
Google Sheets + Apps Script backend for manager login and product management.
No build step: edit a file, push to `main`, and GitHub Pages redeploys.

## Where things live

| You want to change… | Edit this |
|---|---|
| A product's name, price, stock, photo | The **dashboard** at `/acceso` → Publicar (writes `data/products.json`) |
| Site text / translations | `lang/ca.json`, `lang/es.json`, `lang/en.json` (keys referenced by `data-i18n`) |
| Colours, fonts, spacing | `css/theme.css` (design tokens — change once, applies everywhere) |
| Layout & components | `css/styles.css` |
| Header / footer / nav | `js/layout.js` (rendered on every page) |
| Contact details, social, cart key, API URL | `js/config.js` |
| Product categories (labels) | `data/products.json` → `labels` (preserved across Publicar) |
| Backend logic (auth, save, publish) | `backend/Code.gs` → deploy with clasp (below) |

## Data flow (products)

1. Managers edit products in the **Sheet** (via the dashboard, or the sheet directly).
2. **Publicar** (dashboard button, or the "Prop a Prop Teu → Publicar al web"
   menu in the sheet) makes Apps Script write `data/products.json` into this
   repo via the GitHub API.
3. GitHub Pages redeploys; the public pages read the static JSON (fast).

The backend is **header-proof**: `ensureProductHeaders()` rewrites the Products
tab's header row to the exact schema on every read/save, so a missing or
reordered header can no longer drop fields.

### Product fields (`data/products.json`)
`id, type (own|std|tool), price, stock, featured, cutout, codename, heroImage,
labels[], images[], name{ca,es,en}, short{...}, description{...},
heroTagline{...}, heroDesc{...}, specs[{label{...}, value}]`

- **images[]** — product photos (shown "cover"/filled in cards & gallery).
- **heroImage** — a transparent *cutout* for the home hero + shop featured band
  (shown "contain" on the grey panel). Falls back to `images[0]`.
- **cutout: true** — the card image has no background → show it contained, not
  filled. Set it per product in the dashboard.

## Orders, profit & materials inventory

The dashboard (`/acceso` → **Comandes / Materials**) and the product pages run a
small shop backend on the same Sheet:

- **Products** carry two *internal* fields (never published to the public site):
  `cost` (€, production cost → profit) and `bom` (bill of materials:
  `[{material, color, grams}]`). Set them in the product editor.
- **Materials** tab = filament stock in grams, by material + colour, with
  €/gram and a low-stock threshold. Manage it under dashboard → Materials.
- **Orders** tab: a customer places an order from a product page ("Demanar" →
  qty + contact, no online payment). The backend records it, computes
  revenue / cost / **profit**, **deducts the materials** each item uses (BOM ×
  qty), and emails `info@propapropteu.com`. Managers see every order, change its
  status, or delete it under dashboard → Comandes (with running profit totals
  and a low-stock warning).

Deleting an order does **not** restock materials — adjust by hand if needed.

## Images

- `assets/img/products/<id>.*` — product images (uploads from the dashboard go
  to Google Drive and are linked automatically).
- `assets/img/placeholder*.svg` — "coming soon" placeholders.
- `assets/logo_mark.svg`, `assets/logo_a.svg` — brand marks (the `logo_a` frame
  is reused as the shop-card corner and the "A" in the wordmark).

## Deploying the backend (clasp)

Backend code is version-controlled in `backend/` and deployed with
[clasp](https://github.com/google/clasp). The owner Google account is stored as
the clasp profile `propapat`.

```bash
cd backend
clasp -u propapat push -f
clasp -u propapat redeploy <web-app-deployment-id> -d "what changed"
```

`redeploy` keeps the same `/exec` URL that `js/config.js` points at. The current
deployment id and Script ID are in `backend/.clasp.json` / project memory.

## Still to provide (real data)

- `legal.html` — fiscal name, NIF, full address, companies-registry line.
- Real product photos (upload via the dashboard; they replace the provisional
  traced/placeholder images, including the ATLAS hero cutout).
- Team photos → `assets/img/team/member-1.jpg`, `member-2.jpg`.
