import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fromMock, queryBuilders } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  queryBuilders: [] as Array<{
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    ilike: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: fromMock,
  }),
}));

function createBuilder(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.ilike.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue(result);

  queryBuilders.push(builder);
  return builder;
}

import { GET } from "@/app/api/products/search/route";

describe("GET /api/products/search", () => {
  afterEach(() => {
    fromMock.mockReset();
    queryBuilders.length = 0;
  });

  it("searches products whose barcode starts with the numeric query", async () => {
    fromMock
      .mockReturnValueOnce(createBuilder({ data: [], error: null }))
      .mockReturnValueOnce(createBuilder({ data: [], error: null }))
      .mockReturnValueOnce(createBuilder({ data: [], error: null }));

    const response = await GET(new NextRequest("http://localhost/api/products/search?q=880"));

    expect(response.status).toBe(200);
    expect(queryBuilders[1].or).toHaveBeenCalledWith(
      "barcode.ilike.880%,product_code.ilike.880%",
    );
  });

  it("quotes PostgREST reserved characters so names with brackets or commas still search", async () => {
    fromMock
      .mockReturnValueOnce(createBuilder({ data: [], error: null }))
      .mockReturnValueOnce(createBuilder({ data: [], error: null }))
      .mockReturnValueOnce(createBuilder({ data: [], error: null }));

    const response = await GET(
      new NextRequest(
        `http://localhost/api/products/search?q=${encodeURIComponent("샴푸(대용량),리필")}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(queryBuilders[1].or).toHaveBeenCalledWith(
      'barcode.ilike."샴푸(대용량),리필%",product_code.ilike."샴푸(대용량),리필%"',
    );
  });

  it("searches dashed barcodes when the query is typed without dashes", async () => {
    fromMock
      .mockReturnValueOnce(createBuilder({ data: [], error: null }))
      .mockReturnValueOnce(
        createBuilder({
          data: [
            {
              id: "550e8400-e29b-41d4-a716-446655440001",
              barcode: "880-9925-135772",
              product_code: "880-9925-135772",
              name: "LABO scalp treatment",
              spec: "pack 12",
              supplier_name: "K Hair Partners",
              unit_price: 13260,
              is_active: true,
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(createBuilder({ data: [], error: null }));

    const response = await GET(
      new NextRequest("http://localhost/api/products/search?q=8809925135772"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(queryBuilders[1].or).toHaveBeenCalledWith(
      "barcode.ilike.8809925135772%,product_code.ilike.8809925135772%,barcode.ilike.880-9925-135772%,product_code.ilike.880-9925-135772%",
    );
    expect(body.products).toEqual([
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        barcode: "880-9925-135772",
        productCode: "880-9925-135772",
        name: "LABO scalp treatment",
        spec: "pack 12",
        supplierName: "K Hair Partners",
        unitPrice: 13260,
        isActive: true,
      },
    ]);
  });
});
