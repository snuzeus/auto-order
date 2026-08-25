import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rpcMock, fromMock, sendEmailsMock, cleanupMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  sendEmailsMock: vi.fn(),
  cleanupMock: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => Promise.resolve({ ok: true, adminId: "admin-1" }),
}));

vi.mock("@/lib/email/supplier-order-email", () => ({
  sendSupplierOrderEmails: sendEmailsMock,
}));

vi.mock("@/lib/orders/cleanup-old-orders", () => ({
  cleanupOrdersBeforeYesterday: cleanupMock,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: fromMock,
    rpc: rpcMock,
  }),
}));

import { POST } from "@/app/api/admin/close/route";

describe("POST /api/admin/close", () => {
  afterEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    sendEmailsMock.mockReset();
    cleanupMock.mockReset();
  });

  it("closes the cumulative manual batch and emails by its batch id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { mode: "manual" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });
    rpcMock.mockResolvedValue({ data: "batch-1", error: null });
    sendEmailsMock.mockResolvedValue({ sent: 2, skipped: [], failed: [] });
    cleanupMock.mockResolvedValue({
      cutoffDate: "2026-08-17",
      deletedOrders: 0,
      deletedClosingBatches: 0,
      deletedEmailLogs: 0,
    });

    const request = new NextRequest("http://localhost/api/admin/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderDate: "2026-08-18" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(fromMock).toHaveBeenCalledWith("closing_settings");
    expect(rpcMock).toHaveBeenCalledWith("close_orders_through_date", {
      p_order_date: "2026-08-18",
      p_admin_id: "admin-1",
    });
    expect(sendEmailsMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpc: rpcMock }),
      "batch-1",
      "2026-08-18",
    );
  });

  it("returns a conflict when there are no cumulative submitted orders to close", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { mode: "manual" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "마감할 누적 제출 주문이 없습니다." },
    });

    const request = new NextRequest("http://localhost/api/admin/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderDate: "2026-08-18" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "마감할 누적 제출 주문이 없습니다." });
  });
});
