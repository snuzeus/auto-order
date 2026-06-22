import { afterEach, describe, expect, it, vi } from "vitest";

const { fromMock, selectMock, eqMock, orderMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  orderMock: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: fromMock,
  }),
}));

fromMock.mockImplementation(() => ({
  select: selectMock,
}));
selectMock.mockImplementation(() => ({
  eq: eqMock,
}));
eqMock.mockImplementation(() => ({
  order: orderMock,
}));

import { GET } from "@/app/api/branches/route";

describe("GET /api/branches", () => {
  afterEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    orderMock.mockReset();
  });

  it("returns only the branch fields needed for branch selection", async () => {
    orderMock.mockResolvedValue({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          code: "BR-01",
          name: "강남점",
          delivery_address: "서울시 강남구",
          recipient_name: "홍길동",
          phone: "010-1111-2222",
          is_active: true,
        },
      ],
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(selectMock).toHaveBeenCalledWith("id, code, name");
    expect(body).toEqual({
      branches: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          code: "BR-01",
          name: "강남점",
        },
      ],
    });
    expect(body.branches[0]).not.toHaveProperty("deliveryAddress");
    expect(body.branches[0]).not.toHaveProperty("recipientName");
    expect(body.branches[0]).not.toHaveProperty("phone");
  });
});
