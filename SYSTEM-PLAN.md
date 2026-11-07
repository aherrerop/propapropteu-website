# Prop a Prop Teu — cohesive system plan (v1 proposal)

Goal: one machine that runs the whole business. Orders (online **and** offline),
production (what Albert prints), filament inventory (materials + colours, with how
much is left), and the numbers (spend by product / research / personal) — all
connected, all editable by managers from the **website**, with Google Sheets as
the durable database and manual fallback.

Design priorities: **flexibility** (add domains without rewrites) and
**scalability** (append-only history so we can "run the numbers" later).

---

## 1. Shape of the system

```
          ┌───────────────────────── WEBSITE (GitHub Pages) ─────────────────────────┐
          │  Public shop        Manager dashboard (Albert & Yerai)     Client portal  │
          │  (products.json)    Comandes · Cua d'impressió · Filaments  (orders/invoices)│
          └───────────────┬───────────────────────┬──────────────────────┬───────────┘
                          │ calls (JSON over HTTPS)│                       │
                   ┌──────┴────────────────────────┴───────────────────────┴──────┐
                   │              ONE Apps Script "engine" (web app)               │
                   │   auth · orders · jobs · inventory · invoices · publish       │
                   └──────┬───────────┬───────────┬───────────┬───────────┬────────┘
                 opens by ID    by ID       by ID       by ID        by ID
            ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
            │ CATÀLEG  │ │OPERACIONS│ │INVENTARI │ │ CLIENTS  │ │  CONFIG  │   ← 5 Google Sheets
            └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

One engine, **five separate Google Sheets** (one per part of the business), each
with tabs. The engine opens each by its ID (stored in Script Properties:
`SS_CATALEG`, `SS_OPS`, `SS_INV`, `SS_CRM`, `SS_CONFIG`). Adding a new domain later
(e.g. Accounting, Suppliers) = a new sheet + ID, no restructuring.

> The engine can **create all five sheets itself** (a one-time `setupSystem()`
> that builds every tab with the right headers and saves the IDs). No manual sheet
> building, and it's reproducible.

---

## 2. The five databases (sheets → tabs → columns)

### A. CATÀLEG — the shop
- **Products**: id · type · price · cost · stock · visible · featured · codename ·
  heroImage · images · labels · name/short/description (ca/es/en) · hero texts ·
  specs · **BOM** (material + color + grams per unit). *(Internal fields never
  reach the public site.)*
- **Categories**: label id + names (ca/es/en).
- *(later)* **Packs**.

### B. OPERACIONS — orders & production (the daily engine)
- **Comandes** (every order, web + phone + in-person):
  id · date · **source** (web / telèfon / presencial) · client (name/email/phone or
  account) · items · subtotal · IVA · total · payment (transfer/card/cash/pending) ·
  **status** (nova → en cua → imprimint → feta → lliurada / cancel·lada) ·
  assignedTo · invoiceNo · notes.
- **Cua d'impressió** (Albert's to-do — the heart of production):
  jobId · created · **origin** (comanda id *or* "directa") · **category**
  (producte / recerca / personal) · what (product id *or* external link) ·
  **material** · **color** (or "qualsevol") · units · gramsEst · priority ·
  status (pendent / imprimint / fet) · batchId · notes.
  A customer order auto-creates jobs; Yerai can also add a job directly.
- **Enllaços** (MakerWorld / Thingiverse links log): url · title · category ·
  default material/color · times printed · notes. (reusable library)

### C. INVENTARI — filament (materials + colours + the numbers)
- **Filaments** (= "what colours we have, and how much"): material · color · hex ·
  brand · **gramsStock** · costPerGram · lowAt · active. Yerai's dropdowns read
  this and show grams left.
- **Compres** (restock log, append-only): date · material · color · grams · cost ·
  supplier · by.
- **Ús** (consumption log, append-only — the gold for analytics): date · jobId ·
  material · color · grams · **category** (producte/recerca/personal) · cost.
  Every finished job writes a row here → spend by category / product over time.

### D. CLIENTS — CRM
- **Comptes** (client logins: email · salt · hash · name · phone · address).
- **Contactes** (anyone who ordered, incl. phone customers with no account) →
  so offline customers are still recorded and reusable.

### E. CONFIG — admin & settings
- **Gestors** (manager logins + role).
- **Config** (editable settings so managers never touch code: IBAN, fiscal
  name/NIF/address, IVA %, shipping note, invoice counter).
- **Factures** (invoice log: number · order · date · total · pdf link).
- **Missatges** (contact/quote form submissions).

---

## 3. How the people actually work (core flows)

**Yerai takes an order in person/phone →** opens *Comandes → Nova comanda*,
picks products (or types a custom line), marks **source = telèfon/presencial**,
enters the customer. Saving auto-creates the **print jobs** (category = producte).

**Yerai asks Albert to print from a link →** *Cua d'impressió → Nova feina*: pastes
the MakerWorld/Thingiverse link, picks **category** (recerca / personal / producte),
**material** and **color from the available list (with grams shown)**; "qualsevol
color" if it can go on any plate. The link is saved to **Enllaços** for reuse.

**Albert prints →** opens **Cua d'impressió** (his to-do list), optionally the
**Batch planner** (below), prints, and marks each job **fet**. On "fet" the engine
**deducts the grams** from Filaments and writes an **Ús** row with the category.

**Online customer →** buys on the web; an order lands in **Comandes**
(source = web) and auto-creates jobs — identical downstream to an offline order.
*Initially most orders are offline, so "Nova comanda" is the primary tool and the
web shop is just another source.*

**Delivery/payment →** manager advances status to *feta → lliurada*, generates the
**invoice** (VAT PDF) when paid.

---

## 4. Batch planner (Pat's optimisation)

A computed view over pending **Cua d'impressió** jobs (no extra data entry):
- **By type**: one list per material, then grouped by colour, ordered so Albert
  changes filament as little as possible (consecutive same-material/colour).
- **"Qualsevol color" jobs** slot into whichever colour plate has room → fewer
  changes, fuller plates.
- **Combined plan with percentages**: a single ordered run mixing producte /
  recerca / personal, showing how much of each plate (%) is each category — so we
  see at a glance how print time splits across the business.
- Exportable as a simple printable checklist.

---

## 5. Roles

Two managers, **both with full access** (can do every job). In practice:
**Yerai** = intake (comandes + print requests, picks material/colour),
**Albert** = production (works the queue, marks done). Clients see only their own
orders/invoices. Everything a manager does is on the website; **Sheets access
becomes optional** (kept as source-of-truth + manual fallback).

---

## 6. Flexibility & scalability choices

- **Multi-sheet by ID** → add Accounting/Suppliers/Packs later with no rewrite.
- **Append-only logs** (Compres, Ús) → full history; never overwrite the numbers.
- **Everything carries `category`** (producte/recerca/personal) → slice spend any
  way later.
- **Header-proof tabs** (the engine fixes headers; new columns appended, never
  inserted) → the column-shift bugs we already hit can't recur.
- **Stable IDs**; website is a thin client → UI can evolve without touching data.
- **Separation of concerns**: Catalog (what we sell) vs Operations (what we do) vs
  Inventory (what we have) vs Clients vs Config.

---

## 7. Lessons from the R&R build (already applied here)

Sheets-as-DB + one Apps Script web app + static site is cheap, reliable and
manager-friendly. Specifics we carry over: header-proof reads; keep internal
fields out of public JSON; per-person hashed logins + stateless tokens; `clasp`
for autonomous deploys; "Publish" = commit the public JSON to the repo; and
**build the schema fresh and clean rather than patching drafts** — which is
exactly this plan.

---

## 8. Build phases (after you approve)

1. **`setupSystem()`** creates the 5 sheets + tabs + headers, stores IDs.
2. **New engine** (multi-sheet) deployed via clasp; migrate logins.
3. **Daily tools** in the dashboard: Comandes (incl. phone/in-person + source),
   Cua d'impressió, Nova feina, Filaments.
4. **Wire the web**: web orders → Comandes/jobs; publish products from Catàleg.
5. **Batch planner + analytics** (spend by category/product).
6. **Seed real data** (real products, real filaments/colours).

---

## 9. Decisions I need from you

1. **Five-sheet split** as above — OK, or prefer fewer (e.g. one sheet, many tabs)?
2. **Statuses/labels** in Catalan — confirm the order statuses and the three job
   categories (producte / recerca / personal).
3. **Let the engine create the sheets** (`setupSystem`) vs you create them by hand?
4. Migrate off the current draft spreadsheet entirely (recommended), keeping it as
   a read-only backup?
5. Authorize Google Drive (`/mcp`) if you want me to inventory existing Drive
   files / pull anything from R&R first.
