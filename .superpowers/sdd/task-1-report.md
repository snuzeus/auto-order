# Task 1 Report: order price/minimum quantity snapshots

## Scope handled

- Added a regression test for `GET /api/orders` proving stored snapshot fields are returned even when the joined `products` row is missing.
- Updated branch/admin order reads to select and map `order_items.unit_price` and `order_items.minimum_order_quantity`.
- Added `0017_order_item_product_snapshots.sql` to:
  - add snapshot columns to `order_items`
  - backfill them from current `products` by barcode where possible
  - update `submit_branch_order` so new order items persist snapshot values on insert
- Updated the still-unapplied `0016_atomic_master_uploads.sql` product replacement function to:
  - stop clearing `order_items.product_id`
  - upsert uploaded products with `on conflict (barcode) do update`
  - mark products missing from the upload inactive instead of deleting them
- Kept changes scoped to the task-owned files only.

## Files changed

- `tests/unit/orders-route.test.ts`
- `src/app/api/orders/route.ts`
- `src/app/api/admin/status/route.ts`
- `src/lib/types.ts`
- `supabase/migrations/0016_atomic_master_uploads.sql`
- `supabase/migrations/0017_order_item_product_snapshots.sql`

## TDD log

### RED

Added a new focused test in `tests/unit/orders-route.test.ts`:

- `returns stored snapshot pricing when the joined product row is absent`

First attempt exposed a test harness issue, not the product bug:

Command:

```powershell
npm.cmd test -- tests/unit/orders-route.test.ts -t "returns stored snapshot pricing when the joined product row is absent"
```

Output:

```text
FAIL  tests/unit/orders-route.test.ts > POST /api/orders > returns stored snapshot pricing when the joined product row is absent
TypeError: Cannot read properties of undefined (reading 'searchParams')
❯ Module.GET src/app/api/orders/route.ts:175:36
```

Cause:

- The route requires a `NextRequest`, but the first test version passed a plain `Request`.

I corrected the harness to use `NextRequest`, then re-ran the same focused test and got the intended RED result:

Command:

```powershell
npm.cmd test -- tests/unit/orders-route.test.ts -t "returns stored snapshot pricing when the joined product row is absent"
```

Output:

```text
FAIL  tests/unit/orders-route.test.ts > POST /api/orders > returns stored snapshot pricing when the joined product row is absent
AssertionError: expected [ { productId: 'product-1', …(8) } ] to deeply equal [ ObjectContaining{…} ]

- Expected
+ Received

  [
    {
      "barcode": "88010001",
-     "minimumOrderQuantity": 6,
-     "unitPrice": 1250,
+     "isUnregistered": false,
+     "memo": "snapshot",
+     "productCode": "P-001",
+     "productId": "product-1",
+     "productName": "?앹닔",
+     "quantity": 2,
+     "spec": "500ml",
+     "supplierName": "?섎Ъ?좏넻",
    },
  ]
```

This confirmed the current implementation dropped snapshot values when `products` was `null`.

### GREEN

After implementing the route, type, and migration changes, I ran the focused route spec:

Command:

```powershell
npm.cmd test -- tests/unit/orders-route.test.ts
```

Output:

```text
> auto-order@0.1.0 test
> vitest run tests/unit/orders-route.test.ts

RUN  v4.1.10 C:/Users/pcy/Desktop/auto-order/.worktrees/auto-order-mvp

Test Files  1 passed (1)
     Tests  3 passed (3)
```

I then made one small self-review refinement in `src/app/api/orders/route.ts` so a stored `null` snapshot minimum quantity remains authoritative instead of falling back to the live joined product value, and re-ran the same focused spec:

Command:

```powershell
npm.cmd test -- tests/unit/orders-route.test.ts
```

Output:

```text
> auto-order@0.1.0 test
> vitest run tests/unit/orders-route.test.ts

RUN  v4.1.10 C:/Users/pcy/Desktop/auto-order/.worktrees/auto-order-mvp

Test Files  1 passed (1)
     Tests  3 passed (3)
```

## Verification notes

- No Vitest worker issue blocked this task.
- `npm` via PowerShell script policy was blocked, so all test runs used `npm.cmd`.
- Ran `git diff --check` against the task-owned files; there were no whitespace errors.
- Performed a focused static review of the owned SQL changes because there is no task-owned migration test file in the brief:
  - `0016` now preserves existing `order_items.product_id` links and upserts by `barcode`.
  - `0016` now deactivates uploaded-absent products instead of deleting them.
  - `0017` backfills snapshot fields from current products by `barcode`.
  - `0017` redefines `submit_branch_order` so newly inserted `order_items` capture snapshot values at write time.

## Self-review

### What looks good

- The new regression test now pins both the returned payload and the route query selection for snapshot columns.
- Branch order reads prefer stored snapshot fields and still tolerate the legacy join as fallback only when the stored field is actually absent.
- Admin status reads now retain snapshot values in `OrderItemDraft`.
- The master replacement SQL no longer destroys product links by nulling `order_items.product_id`.

### Residual risk / concerns

- `0016_atomic_master_uploads.sql` is still an untracked migration file in this worktree, so there is no task-owned automated test covering its new behavior here.
- Existing non-task test coverage for `0016` appears likely to be stale relative to the new requirements, but that file was outside the task-owned edit list and was left untouched.
- I did not run a broader test suite because the brief explicitly asked for focused tests and the worktree already contains unrelated in-progress changes.
