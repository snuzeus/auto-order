import { afterEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: rpcMock,
  }),
}));

import { POST } from "@/app/api/orders/route";

function createOrderRequest(body: unknown): Request {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/orders", () => {
  afterEach(() => {
    rpcMock.mockReset();
  });

  it("returns 400 without calling the RPC when all items are filtered out", async () => {
    const response = await POST(
      createOrderRequest({
        branchId: "550e8400-e29b-41d4-a716-446655440000",
        orderDate: "2026-06-23",
        items: [
          {
            barcode: "88010001",
            productName: "생수",
            spec: "500ml",
            quantity: 0,
            isUnregistered: false,
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "수량이 0보다 큰 주문 항목을 하나 이상 입력해 주세요.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps closed-date RPC failures to 409 with the Korean user message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "ORDER_DATE_CLOSED",
      },
    });

    const response = await POST(
      createOrderRequest({
        branchId: "550e8400-e29b-41d4-a716-446655440000",
        orderDate: "2026-06-23",
        items: [
          {
            barcode: "88010001",
            productName: "생수",
            spec: "500ml",
            quantity: 2,
            isUnregistered: false,
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "마감된 주문 날짜는 제출하거나 수정할 수 없습니다.",
    });
    expect(rpcMock).toHaveBeenCalledWith("submit_branch_order", {
      p_branch_id: "550e8400-e29b-41d4-a716-446655440000",
      p_order_date: "2026-06-23",
      p_items: [
        {
          product_id: null,
          barcode: "88010001",
          product_code: null,
          product_name: "생수",
          spec: "500ml",
          supplier_name: null,
          quantity: 2,
          is_unregistered: false,
          memo: null,
        },
      ],
    });
  });
});
