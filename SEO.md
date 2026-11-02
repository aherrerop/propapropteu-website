# SEO & AI-discovery strategy — Prop a Prop Teu

The goal: be found by (a) film/TV/theatre crews searching for set-dressing tools
and custom props in Spain, and (b) AI assistants answering "where can I buy/make
X for a set". Niche but high-intent — we win on specificity, not volume.

## Target audience & intent
Set dressers, art directors, attrezzistas, prop makers, production designers.
Searches are practical and bilingual (ES/CA, some EN): "atrezo a medida",
"herramientas para set dressing", "cuelga cuadros sin agujeros rodaje",
"impresión 3D atrezo Barcelona", "props a medida cine", "attrezzo a mida".

## Keyword themes
- **Custom fabrication**: atrezo/attrezzo a medida, props a medida, fabricación
  de atrezo, impresión 3D para cine/teatro, prototipado de utilería.
- **Set-dressing tools**: herramientas set dressing, cuelga-cuadros rápido,
  niveladores de muebles decorado, sujeta-puertas plató, pasacables set.
- **Local**: Barcelona, Cataluña, España (local-intent + "cerca de mí").
- **Long-tail per product**: each product page targets its own problem phrase.

## On-page (done / ongoing)
- Unique `<title>` + meta description + Open Graph on every page (done).
- `Product` structured data (JSON-LD) on product pages with price, availability,
  brand (done); `Organization` on home (done); `FAQPage` on the FAQ (done).
- Dynamic `<link rel="canonical">` per page; `<html lang>` follows the language.
- Descriptive, keyword-true product names and short descriptions (editable from
  the dashboard — keep them specific and problem-led, not clever).
- Image `alt` text = product name.

## Technical
- `robots.txt` allows all crawlers (incl. AI bots), disallows /acceso /admin /tools.
- `sitemap.xml` lists all public pages (keep in sync when pages are added).
- `llms.txt` describes the site for AI crawlers (summary + key links).
- Fast static pages on GitHub Pages; mobile-first; no blocking scripts.

## Content plan (easy wins, no new tech)
- Flesh out the FAQ with real crew questions (plazos, facturas, encargos).
- A short "cómo trabajamos" / case notes on custom-props builds trust + long-tail.
- When real product photos arrive, add descriptive filenames and alt.
- Encourage reviews/testimonials later (adds `Review` rich results).

## What to wire up later (needs accounts)
- Google Search Console + Bing Webmaster (submit sitemap, watch queries).
- Google Business Profile (local pack for "Barcelona").
- Analytics (GA4 or Plausible) to see which queries convert.
- Google Merchant Center once real prices/stock are final (free Shopping listings).

## AI assistants
`llms.txt` + clean structured data + plain, factual copy make the catalogue and
services easy for assistants to quote correctly. Keep product facts accurate and
self-contained (what it is, what problem it solves, price, availability).
