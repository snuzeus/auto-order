import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  rpcMock,
  fromMock,
  selectMock,
  eqMock,
  inMock,
  maybeSingleMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  inMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: fromMock,
    rpc: rpcMock,
  }),
}));

fromMock.mockImplementation(() => ({
  select: selectMock,
}));
selectMock.mockImplementation(() => ({
  eq: eqMock,
  in: inMock,
}));
eqMock.mockImplementation(() => ({
  eq: eqMock,
  maybeSingle: maybeSingleMock,
}));

import { GET, POST } from "@/app/api/orders/route";

function createOrderRequest(body: unknown): Request {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createGetOrderRequest(branchId: string, orderDate: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/orders?branchId=${encodeURIComponent(branchId)}&orderDate=${encodeURIComponent(orderDate)}`,
  );
}

describe("POST /api/orders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    rpcMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    inMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("returns stored snapshot pricing when the joined product row is absent", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "order-1",
        status: "draft",
        branch_id: "550e8400-e29b-41d4-a716-446655440000",
        order_date: "2026-06-23",
        order_items: [
          {
            product_id: "product-1",
            barcode: "88010001",
            product_code: "P-001",
            product_name: "?앹닔",
            spec: "500ml",
            supplier_name: "?섎Ъ?좏넻",
            unit_price: "1250.00",
            minimum_order_quantity: 6,
            products: null,
            quantity: 2,
            is_unregistered: false,
            memo: "snapshot",
          },
        ],
      },
      error: null,
    });

    const response = await GET(
      createGetOrderRequest("550e8400-e29b-41d4-a716-446655440000", "2026-06-23") as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(selectMock).toHaveBeenCalledWith(
      "id, status, branch_id, order_date, order_items(product_id, barcode, product_code, product_name, spec, supplier_name, unit_price, minimum_order_quantity, quantity, is_unregistered, memo, products(unit_price, minimum_order_quantity))",
    );
    expect(body.order.items).toEqual([
      expect.objectContaining({
        barcode: "88010001",
        unitPrice: 1250,
        minimumOrderQuantity: 6,
      }),
    ]);
  });

  it("returns 400 for a malformed order lookup without querying the database", async () => {
    const response = await GET(createGetOrderRequest("not-a-uuid", "2026-06-23") as never);

    expect(response.status).toBe(400);
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("returns 400 without calling the RPC when all items are filtered out", async () => {
    const response = await POST(
      createOrderRequest({
        branchId: "550e8400-e29b-41d4-a716-446655440000",
        orderDate: "2026-07-14",
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

  it("returns 400 when a submitted item has no registered product id", async () => {
    const response = await POST(
      createOrderRequest({
        branchId: "550e8400-e29b-41d4-a716-446655440000",
        orderDate: "2026-07-14",
        items: [
          {
            barcode: "88010001",
            productCode: "P-001",
            productName: "생수",
            spec: "500ml",
            quantity: 2,
            isUnregistered: false,
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "등록된 상품만 주문할 수 있습니다.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an unregistered item before calling the order RPC", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "ORDER_DATE_CLOSED",
      },
    });

    const response = await POST(
      createOrderRequest({
        branchId: "550e8400-e29b-41d4-a716-446655440000",
        orderDate: "2026-07-14",
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

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "등록된 상품만 주문할 수 있습니다.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps product-mismatch RPC failures to 400 with the registered-product message", async () => {
    inMock.mockResolvedValue({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          name: "생수",
          minimum_order_quantity: 1,
        },
      ],
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "PRODUCT_MISMATCH",
      },
    });

    const response = await POST(
      createOrderRequest({
        branchId: "550e8400-e29b-41d4-a716-446655440000",
        orderDate: "2026-07-14",
        items: [
          {
            productId: "550e8400-e29b-41d4-a716-446655440001",
            barcode: "88010001",
            productCode: "P-001",
            productName: "생수",
            spec: "500ml",
            quantity: 2,
            isUnregistered: false,
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "등록된 상품만 주문할 수 있습니다.",
    });
  });
});
