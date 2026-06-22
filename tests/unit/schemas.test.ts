import {
  closeDateSchema,
  orderItemDraftSchema,
  submitOrderSchema,
} from "@/lib/schemas";

describe("orderItemDraftSchema", () => {
  it("rejects whitespace-only barcode", () => {
    const result = orderItemDraftSchema.safeParse({
      barcode: "   ",
      productName: "Valid Name",
      quantity: 1,
      isUnregistered: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only productName", () => {
    const result = orderItemDraftSchema.safeParse({
      barcode: "88010001",
      productName: "   ",
      quantity: 1,
      isUnregistered: false,
    });

    expect(result.success).toBe(false);
  });

  it("trims required text and normalizes blank optional supplier names", () => {
    const result = orderItemDraftSchema.safeParse({
      barcode: " 88010001 ",
      productName: " Water ",
      supplierName: "   ",
      quantity: 1,
      isUnregistered: false,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      barcode: "88010001",
      productName: "Water",
      supplierName: undefined,
    });
  });
});

describe("submitOrderSchema", () => {
  it("rejects impossible calendar dates", () => {
    const result = submitOrderSchema.safeParse({
      branchId: "550e8400-e29b-41d4-a716-446655440000",
      orderDate: "2026-02-31",
      items: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid months", () => {
    const result = submitOrderSchema.safeParse({
      branchId: "550e8400-e29b-41d4-a716-446655440000",
      orderDate: "2026-13-01",
      items: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid branch UUID values", () => {
    const result = submitOrderSchema.safeParse({
      branchId: "not-a-uuid",
      orderDate: "2026-06-23",
      items: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("closeDateSchema", () => {
  it("rejects impossible calendar dates", () => {
    const result = closeDateSchema.safeParse({
      orderDate: "2026-02-31",
    });

    expect(result.success).toBe(false);
  });
});
