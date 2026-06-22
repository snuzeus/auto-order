# Auto Order MVP Design

## Summary

This service automates branch order collection and supplier purchase-order Excel generation for a headquarters team. The MVP uses one Next.js application deployed on Vercel, with Supabase for database, admin authentication, and optional file storage.

The first release focuses on the fastest useful workflow:

- Branch staff select their branch in a mobile PWA and submit orders.
- Headquarters admins manage master data, review daily orders, manually close the day, and download supplier-specific Excel files.
- Suppliers do not log in. Headquarters sends the generated Excel files through the existing KakaoTalk workflow.

Out of scope for MVP: native mobile apps, supplier accounts, KakaoTalk auto-send, invoice settlement, delivery tracking, and shipping-label reverse lookup.

## Goals

- Let 15 branches submit orders through one consistent mobile flow.
- Let headquarters maintain product and branch master data.
- Let headquarters close a day's orders manually after checking submission status.
- Generate one Excel file per supplier using the agreed order format.
- Reduce mistakes for older users through large controls and double-check screens before important actions.

## Non-Goals

- No App Store or Play Store native app in MVP.
- No automated KakaoTalk sending in MVP.
- No supplier portal in MVP.
- No accounting or settlement features in MVP.
- No delivery tracking or waybill management in MVP.

## Architecture

The system is a single Next.js application with role-separated screens.

- Frontend: Next.js, React, responsive UI, PWA support for branch devices.
- Deployment: Vercel.
- Database: Supabase Postgres.
- Admin auth: Supabase Auth email and password login.
- Branch access: branch selection from a registered branch list, stored locally on the device.
- Authorization: admin checks in the app layer, Supabase RLS where practical.
- Excel generation: Next.js server route reads Supabase data and creates `.xlsx` files, then optionally bundles them as `.zip`.
- Storage: Supabase Storage only if generated files need to be retained. MVP can generate files on demand.

Branch users do not create accounts in MVP. On first use, they choose one registered branch. The selected branch is saved in local browser/PWA storage and can be changed from the app. This is intentionally lightweight for internal use. If stricter access control is needed later, the branch flow can add a branch PIN, invite code, or Supabase Auth accounts.

## User Roles

### Branch User

- Opens the installed PWA or mobile browser.
- Selects the current branch from registered branches.
- Scans or types a barcode, searches products, enters quantities, and submits the daily order.
- Can edit the branch's daily order before headquarters closes the day.
- Cannot edit after closing.

### Headquarters Admin

- Logs in with Supabase Auth.
- Uploads and manages product master data.
- Uploads or manages branch master data.
- Reviews daily branch order status.
- Resolves unregistered products before closing.
- Manually closes the order date.
- Downloads supplier-specific Excel files or a ZIP bundle.
- Can cancel closing and regenerate files when needed.

## Branch PWA Screens

### Branch Selection

The first screen lists registered branches. The user selects their branch, and the app stores the selection locally. The selected branch name is shown prominently on every order screen.

Controls:

- Large branch list rows.
- Clear "Change branch" action.
- Confirmation when changing branch if there is an unsent order draft.

### Today's Order

Shows the current branch's order for the selected date. It includes submitted status, product count, total quantity, and a clear action to add products.

Controls:

- Large "Scan barcode" button.
- Barcode/manual input field.
- Product search field.
- Large quantity controls.
- Submit button leading to a confirmation screen.

### Product Entry

Branch staff can add products by barcode scan, barcode typing, or product search. When a product is found, the app shows product name, standard/spec, supplier, and quantity controls.

If a barcode is not registered, the user can immediately use direct manual entry.

Manual unregistered item fields:

- Barcode number.
- Product name.
- Spec or memo.
- Quantity.

The app keeps the user moving. Missing master data is handled by headquarters before closing.

### Submit Confirmation

Submitting an order requires a double-check screen. It shows:

- Branch name.
- Order date.
- Number of line items.
- Total quantity.
- Product names and quantities.
- Unregistered item warnings, if any.

The order is saved only after the user presses the final submit action.

## Admin Web Screens

### Admin Login

Headquarters admins log in with Supabase Auth email and password.

### Dashboard

Shows today's overall status:

- Submitted branch count.
- Unsubmitted branch count.
- Total line items.
- Total quantity.
- Number of suppliers represented.
- Unregistered item count.

### Daily Order Status

Shows all 15 branches and their order status for the date.

States:

- Not submitted.
- Submitted.
- Closed.

The screen supports supplier and product summaries so the admin can check order volume before closing.

### Product Master Management

The admin uploads an Excel file containing:

- Barcode number.
- Product code.
- Product name.
- Spec.
- Supplier name.
- Unit price.

The upload validates required columns and reports row-level errors. Existing products are updated by barcode. New rows create products.

### Branch Master Management

The admin manages:

- Branch code.
- Branch name.
- Delivery address.
- Recipient.
- Phone number.
- Active/inactive status.

This can start as a simple admin table and later add Excel upload if needed.

### Closing And Excel Download

The admin starts closing from the daily order screen. Closing never happens immediately. A double-check screen shows:

- Date being closed.
- Submitted branch count.
- Unsubmitted branch names.
- Total item count.
- Total quantity.
- Supplier count.
- Unregistered item count.
- Items that cannot be assigned to a supplier yet.

If any unregistered item lacks supplier mapping, the UI warns the admin and requires resolution before Excel generation. The admin may map the item to an existing product or create a new product master row.

After successful closing, orders are locked and supplier files can be generated.

## Data Model

### `branches`

Stores branch master data.

- `id`
- `code`
- `name`
- `delivery_address`
- `recipient_name`
- `phone`
- `is_active`
- `created_at`
- `updated_at`

### `products`

Stores product master data.

- `id`
- `barcode`
- `product_code`
- `name`
- `spec`
- `supplier_name`
- `unit_price`
- `is_active`
- `created_at`
- `updated_at`

### `orders`

Stores one branch order per date.

- `id`
- `branch_id`
- `order_date`
- `status`: `draft`, `submitted`, `closed`
- `submitted_at`
- `closed_at`
- `created_at`
- `updated_at`

Unique constraint:

- `branch_id`, `order_date`

### `order_items`

Stores both registered and unregistered order lines.

- `id`
- `order_id`
- `product_id`, nullable for unregistered items.
- `barcode`
- `product_code`, nullable for unregistered items.
- `product_name`
- `spec`
- `supplier_name`, nullable until admin resolves unregistered items.
- `quantity`
- `is_unregistered`
- `memo`
- `created_at`
- `updated_at`

Registered items copy product snapshot fields into the order line so old orders do not change when the product master changes later.

### `closing_batches`

Stores closing history for a date.

- `id`
- `order_date`
- `status`: `closed`, `cancelled`
- `closed_by`
- `closed_at`
- `cancelled_by`
- `cancelled_at`
- `note`

### `generated_files`

Stores generated file records if files are retained.

- `id`
- `closing_batch_id`
- `supplier_name`
- `file_name`
- `storage_path`
- `generated_at`

### `admin_users`

Connects Supabase Auth users to admin role metadata.

- `id`
- `auth_user_id`
- `name`
- `role`: `admin`
- `created_at`
- `updated_at`

## Workflow

### Master Setup

1. Admin uploads product master Excel.
2. Server validates headers and required cells.
3. Valid rows upsert into `products` by barcode.
4. Invalid rows are shown with row numbers and reasons.
5. Admin registers or updates branch master data.

### Branch Order

1. Branch user opens the PWA.
2. User selects a branch if none is stored locally.
3. User scans or enters barcode.
4. If registered, product details appear and quantity is entered.
5. If unregistered, the user enters barcode, product name, spec or memo, and quantity manually.
6. User reviews the submit confirmation screen.
7. User confirms submission.
8. `orders` and `order_items` are saved as `submitted`.

### Admin Closing

1. Admin opens daily order status.
2. Admin reviews submitted and unsubmitted branches.
3. Admin resolves unregistered items that need supplier mapping.
4. Admin clicks close.
5. Closing confirmation screen shows summary and warnings.
6. Admin confirms.
7. Orders for that date are locked as `closed`.
8. A `closing_batches` record is created.

### Excel Generation

1. Server reads closed orders for the date.
2. Server groups order lines by `supplier_name`.
3. Server creates one workbook per supplier.
4. Each file is named `supplierName_YYYY-MM-DD.xlsx`.
5. Admin downloads individual files or a ZIP bundle.

Excel columns:

- Branch name.
- Address.
- Phone.
- Product code.
- Product name.
- Spec.
- Quantity.

## Error Handling

- Unregistered barcode: show direct manual entry action.
- Duplicate product entry: show existing quantity and allow add or replace.
- Quantity zero: remove the line from the active order.
- Closed order edit attempt: show that headquarters has closed the order.
- Product upload error: show row number and error reason.
- Missing required upload column: reject the upload before changing data.
- Excel generation failure: keep the closing status and show a regenerate action.
- Network failure during branch submission: keep the local input state visible and let the user retry.
- Branch change with unsent data: show a confirmation before switching.

## Usability Rules

The target users include older branch staff, so the UI should optimize clarity over density.

- Use large buttons and broad touch targets.
- Avoid icon-only controls for important actions.
- Use high-contrast status labels.
- Show the selected branch name prominently.
- Confirm before submitting, closing, cancelling closing, regenerating files, or changing branch with unsent work.
- Keep success and failure messages short and direct.
- Preserve typed order data after recoverable errors.

## Security And Access

MVP branch access is based on local branch selection. This is suitable only for controlled internal use. The design intentionally leaves room for stronger branch authentication later.

Admin access uses Supabase Auth. Admin-only routes and server actions must verify the user session and role before reading all-branch data, writing master data, closing orders, or generating Excel files.

Supabase RLS should protect admin tables where practical. Because branch users do not authenticate in MVP, branch order write APIs must validate the selected branch ID and closed status in server code.

## Testing Strategy

### Unit Tests

- Product master upload parser validates required columns.
- Product master upsert maps barcode fields correctly.
- Order item grouping by supplier works for multiple branches.
- Unregistered items are blocked from final Excel generation when supplier is missing.
- Excel file names match `supplierName_YYYY-MM-DD.xlsx`.

### Integration Tests

- Branch submits a registered product order.
- Branch submits an order with an unregistered product.
- Admin resolves an unregistered product before closing.
- Admin closes a date and locks all orders.
- Admin cancels closing and orders become editable again.
- Admin generates supplier Excel files after closing.

### Manual QA

- Install PWA on Android Chrome and iPhone Safari.
- Confirm branch selection persists after reopening.
- Confirm barcode scan works on target devices.
- Confirm large quantity controls are comfortable on mobile.
- Confirm double-check screens appear before order submission and closing.
- Confirm ZIP download works from the deployed Vercel app.

## Future Enhancements

- Branch PIN or invite code.
- Supabase Auth accounts for branches.
- Supplier portal.
- KakaoTalk or email delivery automation.
- Delivery tracking.
- Settlement and invoice workflows.
- Long-term generated file archive in Supabase Storage.
