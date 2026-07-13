# 주문 무결성 보강 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상품마스터 교체·주문 제출·메일 발송·데이터 정리 과정에서 주문 데이터가 변조되거나 누락되지 않게 한다.

**Architecture:** 주문 항목은 상품의 당시 단가와 최소발주수량을 스냅샷으로 보관한다. DB RPC가 활성 상품을 직접 검증하고 주문 값을 채워 클라이언트 입력을 신뢰하지 않는다. 업로드·메일·정리는 각각 서버 경계에서 필수값, 호출 간격, 보관 기간을 강제한다.

**Tech Stack:** Next.js 15 Route Handlers, TypeScript, Supabase PostgreSQL RPC, Vitest, ExcelJS, Resend API.

## Global Constraints

- 상품마스터 교체는 전체 교체 방식과 원자성을 유지한다.
- 지사 선택 방식은 변경하지 않는다.
- 상품 엑셀 필수값은 상품코드, 상품명, 납품 거래처명, 공급가다.
- 단가 0은 유효하지만 빈 단가는 업로드 오류다.
- 주문은 활성 등록 상품만 저장한다.
- 발송 시도마다 최소 600ms 간격을 둔다.
- 어제 이전 주문과 같은 날짜의 메일 발송 이력을 삭제한다.

---

### Task 1: 주문 단가·최소발주수량 스냅샷

**Files:**
- Create: `supabase/migrations/0017_order_item_product_snapshots.sql`
- Modify: `src/app/api/orders/route.ts`
- Modify: `src/app/api/admin/status/route.ts`
- Modify: `src/lib/types.ts`
- Test: `tests/unit/orders-route.test.ts`

**Interfaces:**
- Consumes: `products.unit_price`, `products.minimum_order_quantity`.
- Produces: `order_items.unit_price`, `order_items.minimum_order_quantity` and `OrderItemDraft` snapshot values.

- [ ] **Step 1: Write the failing test**

```ts
it("returns unit price stored on the order item when the product join is absent", async () => {
  // GET fixture has order_items.unit_price: 1250 and products: null
  expect(body.order.items[0].unitPrice).toBe(1250);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/unit/orders-route.test.ts --pool=forks --maxWorkers=1`

Expected: FAIL because the GET mapper reads only `products.unit_price`.

- [ ] **Step 3: Write minimal implementation**

```sql
alter table public.order_items
add column if not exists unit_price numeric(12, 2) not null default 0,
add column if not exists minimum_order_quantity integer;
```

Update order queries to select the two `order_items` columns and prefer them when mapping drafts. In `0016_atomic_master_uploads.sql`, replace the delete-and-reinsert logic with barcode upsert plus deactivation of products absent from the uploaded JSON. Extend the final `submit_branch_order` RPC to insert the snapshots from the verified product row.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run tests/unit/orders-route.test.ts --pool=forks --maxWorkers=1`

Expected: PASS.

### Task 2: 등록 상품 서버 검증

**Files:**
- Create: `supabase/migrations/0018_registered_product_order_guards.sql`
- Modify: `src/app/api/orders/route.ts`
- Modify: `src/lib/domain/branch-order-draft.ts`
- Test: `tests/unit/orders-route.test.ts`

**Interfaces:**
- Consumes: submitted `productId`, barcode, product code and `products` master data.
- Produces: `REGISTERED_PRODUCT_REQUIRED`, `PRODUCT_MISMATCH`, `MINIMUM_ORDER_QUANTITY_NOT_MET` RPC errors.

- [ ] **Step 1: Write the failing tests**

```ts
it("returns 400 when a submitted item has no productId", async () => {
  // submit a quantity-positive item without productId
  expect(body.error).toBe("등록된 상품만 주문할 수 있습니다.");
});

it("maps a product mismatch RPC failure to 400", async () => {
  rpcMock.mockResolvedValue({ data: null, error: { message: "PRODUCT_MISMATCH" } });
  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd vitest run tests/unit/orders-route.test.ts --pool=forks --maxWorkers=1`

Expected: FAIL because product IDs are optional and the error is unmapped.

- [ ] **Step 3: Write minimal implementation**

```ts
const invalidItem = submittedItems.find((item) => !item.productId || item.isUnregistered);
if (invalidItem) return jsonError("등록된 상품만 주문할 수 있습니다.", 400);
```

In the replacement RPC, join each JSON row to `public.products` using ID, barcode, product code, and `is_active = true`; raise a stable error if the count differs. Use the joined product values for every inserted order-item field and minimum quantity check.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run tests/unit/orders-route.test.ts --pool=forks --maxWorkers=1`

Expected: PASS.

### Task 3: 상품 엑셀 필수값 검증

**Files:**
- Modify: `src/lib/domain/product-master.ts`
- Modify: `src/app/api/admin/products/upload/route.ts`
- Test: `tests/unit/product-master.test.ts`
- Test: `tests/unit/product-upload-route.test.ts`

**Interfaces:**
- Consumes: 상품 엑셀 열 별칭과 행 값.
- Produces: 헤더 오류 또는 행별 `납품 거래처명`, `공급가` 누락 오류.

- [ ] **Step 1: Write the failing tests**

```ts
it("requires a supplier header and a unit price header", () => {
  expect(getMissingRequiredProductMasterHeaders(["상품코드", "상품명"])).toEqual([
    "납품 거래처명",
    "공급가",
  ]);
});

it("returns a row error when supplier name or price is blank", async () => {
  expect(body.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ reason: expect.stringContaining("납품 거래처명") }),
  ]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd vitest run tests/unit/product-master.test.ts tests/unit/product-upload-route.test.ts --pool=forks --maxWorkers=1`

Expected: FAIL because only code and name are currently required.

- [ ] **Step 3: Write minimal implementation**

```ts
export const REQUIRED_PRODUCT_MASTER_FIELDS = [
  "상품코드", "상품명", "납품 거래처명", "공급가",
] as const;
```

Treat blank price as a required-value error before normalizing. Preserve zero as a valid numeric price. Remove the synthetic `납품처 미지정` fallback.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run tests/unit/product-master.test.ts tests/unit/product-upload-route.test.ts --pool=forks --maxWorkers=1`

Expected: PASS.

### Task 4: 메일 시도 간격과 이력 정리

**Files:**
- Modify: `src/lib/email/supplier-order-email.ts`
- Modify: `src/lib/orders/cleanup-old-orders.ts`
- Modify: `src/app/api/admin/close/route.ts`
- Modify: `src/app/api/admin/auto-close/route.ts`
- Test: `tests/unit/supplier-email.test.ts`
- Test: `tests/unit/cleanup-old-orders.test.ts`

**Interfaces:**
- Consumes: 공급처별 발송 결과와 Seoul 기준 정리 기준일.
- Produces: 실패 포함 발송 간격, `deletedEmailLogs`가 포함된 정리 결과.

- [ ] **Step 1: Write the failing tests**

```ts
it("waits before the second attempt even when the first email fails", async () => {
  // mock a first supplier failure and capture sleep calls
  expect(sleepMock).toHaveBeenCalledWith(600);
});

it("deletes old email logs before closing batches and orders", async () => {
  expect(deleteCalls.map((call) => call.table)).toEqual([
    "supplier_email_logs", "closing_batches", "orders",
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd vitest run tests/unit/supplier-email.test.ts tests/unit/cleanup-old-orders.test.ts --pool=forks --maxWorkers=1`

Expected: FAIL because the current counter advances only after a successful email and cleanup never queries email logs.

- [ ] **Step 3: Write minimal implementation**

```ts
let attemptedSendCount = 0;
for (const supplier of groupedRows) {
  if (attemptedSendCount > 0) await sleep(RESEND_SEND_INTERVAL_MS);
  attemptedSendCount += 1;
  // send or log skip/failure
}
```

Delete `supplier_email_logs` with the same `< cutoffDate` filter before deleting closing batches. Add `deletedEmailLogs` to `OrderCleanupResult`; existing close responses return it automatically.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run tests/unit/supplier-email.test.ts tests/unit/cleanup-old-orders.test.ts --pool=forks --maxWorkers=1`

Expected: PASS.

### Task 5: 통합 검증과 운영 문서

**Files:**
- Modify: `README.md`
- Test: `tests/unit/atomic-master-upload-migration.test.ts`
- Test: `tests/unit/orders-route.test.ts`

**Interfaces:**
- Consumes: migrations `0016` through `0018` and API contract changes.
- Produces: Supabase 실행 순서와 최종 회귀 검증 근거.

- [ ] **Step 1: Write the failing migration-contract test**

```ts
it("keeps order product snapshots when replacing the master", () => {
  expect(sql).not.toContain("set product_id = null");
  expect(sql).toContain("unit_price");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/unit/atomic-master-upload-migration.test.ts --pool=forks --maxWorkers=1`

Expected: FAIL while migration 0016 clears all product IDs.

- [ ] **Step 3: Write minimal implementation and document deployment**

Update the replacement function so it keeps product IDs by barcode and leaves existing order-item snapshots intact. Document that `0017` and `0018` must be run in Supabase SQL Editor before deploying the application code.

- [ ] **Step 4: Run focused and full verification**

Run: `npx.cmd vitest run --pool=forks --maxWorkers=1`

Expected: PASS with no unhandled worker errors.

Run: `npm.cmd run build`

Expected: production build succeeds after temporarily stopping the local dev server or using an isolated build directory.
