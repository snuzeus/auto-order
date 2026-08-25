import { describe, expect, it, vi } from "vitest";

import { deleteClosedRecordsBefore } from "@/lib/orders/cleanup-policy";

describe("cleanupOrdersBeforeYesterday", () => {
  it("deletes only closed old orders and preserves submitted backlog", async () => {
    const orderEq = vi.fn();
    const orderLt = vi.fn();
    const calls: Array<{ table: string; filters: Array<[string, string, string]> }> = [];

    const supabase = {
      from(table: string) {
        const filters: Array<[string, string, string]> = [];
        calls.push({ table, filters });
        const builder = {
          delete: () => builder,
          eq(column: string, value: string) {
            filters.push(["eq", column, value]);
            if (table === "orders") orderEq(column, value);
            return builder;
          },
          lt(column: string, value: string) {
            filters.push(["lt", column, value]);
            if (table === "orders") orderLt(column, value);
            return builder;
          },
          select: () => Promise.resolve({ data: [], error: null }),
        };
        return builder;
      },
    };

    await deleteClosedRecordsBefore(supabase as never, "2026-08-17");

    expect(orderEq).toHaveBeenCalledWith("status", "closed");
    expect(orderLt).toHaveBeenCalledWith("closed_at", expect.stringContaining("T00:00:00+09:00"));
    expect(calls.find((call) => call.table === "supplier_email_logs")?.filters).toContainEqual([
      "lt",
      "created_at",
      expect.stringContaining("T00:00:00+09:00"),
    ]);
    expect(calls.find((call) => call.table === "closing_batches")?.filters).toContainEqual([
      "lt",
      "closed_at",
      expect.stringContaining("T00:00:00+09:00"),
    ]);
    expect(calls.find((call) => call.table === "orders")?.filters).not.toContainEqual([
      "eq",
      "status",
      "submitted",
    ]);
  });
});
