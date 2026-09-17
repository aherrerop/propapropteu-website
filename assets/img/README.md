# Image guide — what each picture is & how to replace it

Drop a new file with the **same name/path** to replace any image. Sizes are
suggestions; keep a similar aspect ratio so the layout stays right.

## Brand
| Path | What it is | Notes |
|------|------------|-------|
| `../logo_mark.svg` | Header logo mark (the black geometric symbol) | **PROVISIONAL trace** — replace with the real vector from your designer. |
| `../logo_estandar_svg.svg` | Favicon + social share image | Old colour icon; swap if you want the new mark here too. |

## Home hero (the ATLAS carousel)
The hero is driven by the **featured products** in `../../data/products.json`.
For each featured product it shows:
- the product image (`images[0]`),
- the big faint watermark = the product's `codename` (e.g. `"ATLAS"`),
- the headline = the product's `heroTagline`,
- the paragraph = the product's `short` text,
- "Saber més" → that product's page.

To change a hero slide, edit that product in `products.json` (or set
`"featured": true/false` to add/remove slides).

## Products
| Path | What it is |
|------|------------|
| `products/atlas.svg` | **Provisional** product graphic (the ATLAS quick-hang bracket). Used by the featured products right now. Replace with the real cutout — e.g. save it as `products/atlas.png` and update the `images` path in `products.json`. |
| `products/<id>.svg` | Per-product image. The path for each product lives in its `images` array in `products.json`. |

Transparent-background PNG (or a tightly-cropped JPG on the same grey `#dcdbd8`)
works best for products, since they sit on the grey hero/cards.

## Other pages (used once those pages are rebuilt)
| Path | What it is |
|------|------------|
| `custom/work-1…6.jpg` | Custom-props "our work" gallery (square, Instagram-style). |
| `team/member-1…3.jpg` | Team portraits (portrait 4:5). |
| `about/workshop.jpg` | About-page workshop image (landscape). |
| `placeholder-landscape.svg` / `placeholder-portrait.svg` | Generic "coming soon" placeholders. |
