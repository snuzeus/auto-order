# Auto Order MVP Summary

This is the short working summary for implementation. Use the full design document as the source of truth when details are needed:

`docs/superpowers/specs/2026-06-22-auto-order-design.md`

## Core Stack

- App: Next.js, React, PWA.
- Deploy: Vercel.
- DB/Auth: Supabase.
- Admin login: Supabase Auth email/password.
- Branch access: no account login in MVP. Branch users select one registered branch from a list.
- Excel generation: Next.js server route creates supplier `.xlsx` files and optional ZIP downloads.

## MVP Users

- Branch user: selects branch, enters orders on mobile PWA, submits before closing.
- Headquarters admin: manages master data, reviews orders, closes day manually, downloads supplier Excel files.
- Supplier: no system access in MVP. Receives Excel files through the existing KakaoTalk workflow.

## Branch PWA Flow

1. Select branch from registered branch list.
2. Selected branch is stored locally on the device.
3. Add products by barcode scan, barcode typing, or product search.
4. If product is not registered, allow direct manual entry immediately.
5. Enter quantity with large controls.
6. Show order confirmation before final submit.
7. Allow edits until headquarters closes the day.

## Unregistered Product Flow

When barcode/product is not found, branch user can enter:

- Barcode number.
- Product name.
- Spec or memo.
- Quantity.

Admin must resolve unregistered items before final supplier Excel generation if supplier mapping is missing.

## Admin Flow

1. Log in with Supabase Auth.
2. Upload/manage product master.
3. Manage branch master.
4. Review today's branch submission status.
5. Resolve unregistered products.
6. Click manual close.
7. Review closing confirmation.
8. Confirm close.
9. Download supplier-specific Excel files or ZIP.

## Double-Check Rules

Use confirmation screens before:

- Branch order submit.
- Branch change when unsent order data exists.
- Admin daily closing.
- Closing cancellation.
- Excel regeneration.

The UI should use large buttons, clear labels, high contrast status text, and short success/error messages because older users will use the system.

## Main Tables

- `branches`: branch master.
- `products`: product master.
- `orders`: one branch order per date.
- `order_items`: registered and unregistered order lines.
- `closing_batches`: closing history.
- `generated_files`: generated Excel/ZIP records if retained.
- `admin_users`: Supabase Auth user to admin role mapping.

## Order Status

- `draft`: editing.
- `submitted`: branch submitted.
- `closed`: headquarters closed the order date.

After closing, branch users cannot edit orders unless headquarters cancels closing.

## Excel Output

Generate one file per supplier:

`supplierName_YYYY-MM-DD.xlsx`

Columns:

- Branch name.
- Address.
- Phone.
- Product code.
- Product name.
- Spec.
- Quantity.

## MVP Exclusions

- Native App Store or Play Store app.
- KakaoTalk auto-send.
- Supplier portal.
- Invoice settlement.
- Delivery tracking.
- Waybill management.

## Future Upgrade Points

- Branch PIN or invite code.
- Branch Supabase Auth accounts.
- Supplier portal.
- KakaoTalk or email automation.
- Supabase Storage archive for generated files.
