import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => Promise.resolve({ ok: true, adminId: "admin-1" }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: fromMock }),
}));

import { GET } from "@/app/api/admin/status/route";

type QueryResult = { data: unknown; error: null };

function query(result: QueryResult) {
  const builder = {
    eq: () => builder,
    lte: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("GET /api/admin/status cumulative batch lookup", () => {
  it("resolves the closing batch when the selected date is an original order date", async () => {
    let closingBatchSelectCount = 0;

    fromMock.mockImplementation((table: string) => ({
      select(columns: string) {
        if (table === "branches") {
          return query({ data: [{ id: "branch-1", name: "Seoul" }], error: null });
        }
        if (table === "closing_settings") {
          return query({ data: { mode: "manual" }, error: null });
        }
        if (table === "closing_batches") {
          closingBatchSelectCount += 1;
          return closingBatchSelectCount === 1
            ? query({ data: null, error: null })
            : query({
                data: { id: "batch-18", order_date: "2026-08-18" },
                error: null,
              });
        }
        if (table === "orders" && columns === "closing_batch_id") {
          return query({ data: { closing_batch_id: "batch-18" }, error: null });
        }
        if (table === "orders") {
          return query({
            data: [
              {
                branch_id: "branch-1",
                order_date: "2026-08-17",
                status: "closed",
                order_items: [
                  {
                    product_id: "product-1",
                    barcode: "8801",
                    product_code: "P1",
                    product_name: "Water",
                    spec: "500ml",
                    supplier_name: "Supplier A",
                    unit_price: 1000,
                    minimum_order_quantity: 1,
                    quantity: 2,
                    is_unregistered: false,
                    memo: null,
                  },
                ],
              },
            ],
            error: null,
          });
        }
        return query({ data: [], error: null });
      },
    }));

    const response = await GET(
      new NextRequest("http://localhost/api/admin/status?date=2026-08-17"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.closingBatchId).toBe("batch-18");
    expect(body.closingDate).toBe("2026-08-18");
    expect(body.includedFromDate).toBe("2026-08-17");
    expect(body.orderCount).toBe(1);
  });
});
