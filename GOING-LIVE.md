# Going live — your last-minute inputs

The system is built and tested. Everything below you can do yourself from the
**dashboard** (`/acceso.html` → log in), with no code changes. Items are ordered
by priority.

## 1. Products — prices, photos, internal info
Screen: **Productes**
- Set the real **price** and upload **photos** for each product.
- (Internal, optional but recommended) In each product's *Cost i materials* section:
  **Cost de producció**, **Temps d'impressió estimat** (min/unit) and **Materials
  per unitat** (the bill of materials). These never appear on the public site; they
  drive profit, the print queue's time estimate, and filament deduction.
- When you're happy, press **Publicar** (top right) to push the catalogue to the
  public website.

## 2. Business config — bank, fiscal, invoices, alerts
Screen: **Configuració** (everything here is editable anytime)
- **IBAN** and **Titular del compte** — shown to customers who pay by transfer.
- **Nom fiscal / NIF / Adreça fiscal / Email a les factures** — printed on invoices.
- **IVA (%)** — default 21.
- **Últim número de factura emès** — set to `0` to start invoices at F{year}-0001.
- **Email per avisos** — where new-order / new-job alerts go (default
  `propapropteu@gmail.com`).
- **Nota d'enviament** — shown at checkout.

## 3. Manager logins — Yerai & Albert
Screen: **Configuració → Gestors**
- Add **Yerai** and **Albert** with their own email + password (full access).
- You can't delete the account you're logged in with (lock-out guard).

## 4. Card payments (optional) — Stripe
Screen: **Configuració → Clau secreta Stripe**
- Card checkout is **off** until you add a key, so nothing breaks before then.
- Create a Stripe account → Developers → API keys → copy the **Secret key**
  (`sk_test_…` to trial, `sk_live_…` for real) → paste it into the field → **Desar**.
- The screen then shows "✅ Pagament amb targeta ACTIU".
- Test it: add something to the cart, choose *Targeta*, pay with Stripe's test card
  `4242 4242 4242 4242`, any future date, any CVC. You'll be redirected back and the
  order flips to **pagat** automatically. Switch to the live key when ready.
- No webhook or extra setup needed — payment is confirmed on return.

## Notes
- Managers' dashboard is in Catalan; all the sheets/data are in English.
- Statuses are stored in English (`new`, `awaiting_payment`, `paid`, …) but shown
  in Catalan in the dashboard.
- Completed print jobs move out of the queue into **JobsDone**; each month closes
  automatically into a **Mes YYYY-MM** sheet + the **Monthly** ledger (Finances →
  Tancament mensual) for taxes. You can also close a month manually there.
- The temporary API login `infopropapropteu@gmail.com` can be rotated/removed once
  Yerai and Albert are set up (just don't delete the one you're logged in as).
