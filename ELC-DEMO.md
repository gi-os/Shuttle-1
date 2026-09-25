# ELC Demo Store

A demo Shuttle store for ELC (client demo, Oct 1–2 2026). It is a **phase-1 reference catalog**: item name, SKU, photo and description, with no prices shown. Ordering runs on a purchase order, and every order is held as `Pending` until someone releases it.

All branding, copy, imagery and the brand list are **placeholders**. Contact addresses are `demo@example.com`, so demo orders never email a real ELC or LR Paris inbox.

## What the demo shows

| # | Feature | How |
|---|---------|-----|
| 1 | Minimal store + order workflow | `DATABASE/` below; orders go to `Orders/orders.csv` |
| 2 + 8 | PO Upload product ($0, PDF required before Add to Cart) | `Order Tools/PO Upload` with `Details/UploadRequired.txt` = `pdf` |
| 3 + 6 | Order form: brand, ship-to + billing, need-by date, budget, PO number, artwork **link**, notes | `Presets/DataRequired.txt` extended toggles |
| 4 | Reference catalog, no prices | `Presets/HidePrices.txt` = `true`, costs = `0` |
| 5 | Brand selector (25 placeholder brands) | `Design/Details/Brands.txt` |
| 7 | PO number required; PO file not forced when the cart has a PO Upload PDF | `Presets/ShopType.txt` = `type: po` |
| 9 | Approval hold | Orders are written `Pending`; `POST /api/orders/:id/release` flips to `Released` |
| 10 | EUR, $0 shipping | `Presets/Currency.txt` = `EUR`; `shipping_handler: false` (no shipping line exists) |

## DATABASE layout

```
DATABASE/
├── Design/
│   ├── Details/
│   │   ├── CompanyName.txt        ELC Demo
│   │   ├── Colors.txt             neutral navy/grey palette (PLACEHOLDER)
│   │   ├── Descriptions.txt       tagline / about / footer (PLACEHOLDER)
│   │   ├── Fonts.txt, Style.txt   system fonts, 4px corners
│   │   ├── Brands.txt             25 placeholder brands (one per line)
│   │   ├── Email.txt              contact: demo@example.com
│   │   ├── AdminEmail.txt         demo@example.com
│   │   └── Password.txt           CHANGE-ME-elc-demo  (placeholder, change before sharing)
│   ├── FAQ/FAQ.txt
│   ├── Logos/logo.png, logo-white.png                  placeholder wordmark
│   └── ShowcasePhotos/hero-1.jpg, Collections/*.jpg    placeholder images
├── ShopCollections/
│   ├── Reference Catalog/
│   │   ├── Bottle - AI2/    SKU ELC-AI2
│   │   ├── Jewelry - AH1/   SKU ELC-AH1
│   │   └── Bottle - AI1/    SKU ELC-AI1
│   └── Order Tools/
│       └── PO Upload/       SKU ELC-PO-UPLOAD, UploadRequired.txt = pdf
│   (each product: Details/{Name,SKU,Description,BoxCost=0,ItemCost=0,UnitsPerBox=1}.txt + Photos/main.png)
├── Presets/
│   ├── ShopType.txt         type: po
│   ├── DataRequired.txt     address/details/extra_notes true, shipping_handler/hotel_list false,
│   │                        brand/billing_address/need_by_date/budget/artwork_link true
│   ├── HidePrices.txt       true
│   └── Currency.txt         EUR
├── Orders/orders.csv        header only
└── Inventory/inventory.csv  100 of each reference item, 9999 of PO Upload
```

Product names and SKUs match the live Liftoff ELC store. Descriptions and photos are placeholders.

## New config flags

These are all optional. When a file or key is missing, the shop behaves exactly as before.

| File | Values | Effect |
|------|--------|--------|
| `ShopCollections/<C>/<P>/Details/UploadRequired.txt` | `pdf` | Product page shows a PDF picker. Add to Cart stays disabled until a valid PDF is uploaded, and the file name is shown. The PDF is staged in `Orders/.pending-uploads/` and moved to `Orders/<OrderID>.pdf` when the order is placed. |
| `Presets/HidePrices.txt` | `true` / `false` (default `false`) | Hides prices on product cards, the product page, cart, checkout and the PDF receipt. Totals are still computed and stored. |
| `Presets/Currency.txt` | ISO 4217 code (default `USD`) | Currency used wherever prices render (`€12.50`; `EUR 12.50` on the PDF receipt). |
| `Presets/DataRequired.txt` `brand` | default `false` | Required Brand field. Options come from `Design/Details/Brands.txt`; without that file it is a free-text field. |
| `… billing_address` | default `false` | Billing address with a "Same as shipping" checkbox |
| `… need_by_date` | default `false` | Required need-by date (today or later) |
| `… budget` | default `false` | Optional estimated budget, labelled with the currency |
| `… artwork_link` | default `false` | Optional http(s) URL for artwork (a link, not a file upload) |

**PO behaviour (`type: po`):** the PO number is always required, and the server rejects an order without it (400). The checkout PO-file upload is only required when the cart has **no** upload-required product. If the cart has one, its PDF becomes the order's PO file (`PO File` column = `<OrderID>.pdf`), so Launchpad's "PO file" link finds it.

**New `orders.csv` columns** are appended after `Tracking Number`: `Brand, Billing Address, Need By Date, Estimated Budget, Artwork Link, Attachments`. Existing CSVs are migrated automatically the next time an order is placed, and existing rows are padded with empty values. The same fields are sent in the Launchpad notify payload. They are also folded into its `Order Notes` key, because that is the key Launchpad's email template renders.

## Approval hold: release API

```
POST /api/orders/<OrderID>/release
x-admin-password: <secret>          (or  Authorization: Bearer <secret>)
```

- `<secret>` is the `SHUTTLE_ADMIN_PASSWORD` env var if it is set, otherwise the shop password (`Design/Details/Password.txt`).
- `200 {"success":true,"status":"Released"}` when a `Pending` order is released.
- `401` bad or missing secret · `404` unknown order · `409` order is not `Pending` (already Released / Shipped).

```bash
curl -X POST -H "x-admin-password: $SECRET" https://<domain>/elc-demo/api/orders/ORD-1790000000000-123/release
```

> ⚠️ The storefront password is sent to every visitor by `/api/design` (that is how the client-side gate works). For anything beyond the demo, set `SHUTTLE_ADMIN_PASSWORD` in the shop's `.env` so the release secret is not the storefront password.

There is no admin UI in Shuttle. After release, Launchpad's Orders page shows the `Released` status, and shipping still works as normal there.

## Launchpad deploy steps

> **Branch caveat:** Launchpad's `POST /api/shops` clones `LR-Paris/Shuttle` at the default branch (`main`), and `deploy` runs `git pull` on whatever branch is checked out. Until this branch is merged, the new shop's checkout has to be switched to `feat/elc-demo-store` (step 2), or the new features will not be there.

1. **Create the shop:** Launchpad → New Shop → name `ELC Demo`. The slug becomes `elc-demo` (`POST /api/shops {"name":"ELC Demo"}`). Do **not** use `folderPath` to clone the live ELC shop.
2. **Pre-merge only, switch the code branch:** on the Launchpad host,
   `git -C <launchpad>/backend/shops/elc-demo fetch origin feat/elc-demo-store && git -C <launchpad>/backend/shops/elc-demo checkout feat/elc-demo-store`
3. **Upload the DATABASE:** zip this repo's `DATABASE/` folder (a single top-level `DATABASE/` folder in the zip is fine, Launchpad strips it) and upload it:
   `POST /api/shops/elc-demo/files/upload-zip?path=DATABASE` (multipart file field), or use the Files page in Launchpad.
   Before uploading, change `Design/Details/Password.txt`.
4. **Deploy:** Launchpad → shop → Deploy (`POST /api/shops/elc-demo/deploy`), which rebuilds the container.
5. **Open** `<domain>/elc-demo/`, enter the password, and run through: Reference Catalog → add items → PO Upload → attach PDF → checkout → release with the API above.

## Out of scope / deferred

- **Tier / customer-specific pricing.** Shuttle has no customer accounts (only one shared password). This needs accounts or price lists per customer, which is a large follow-up.
- **Stripe payments.** `type: stripe` is still a placeholder.
- **Launchpad-side approval UI** (a Release button, a "Pending Approval" filter). Only the Shuttle API exists.
- **Launchpad email template.** It hard-codes `$` and does not render the new fields as their own rows. They reach the email only through the folded `Order Notes`.
