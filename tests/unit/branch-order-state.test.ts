import { upsertOrderItem } from "@/lib/domain/branch-order-state";
import type { OrderItemDraft } from "@/lib/types";

describe("upsertOrderItem", () => {
  const existingItems: OrderItemDraft[] = [
    {
      productId: "550e8400-e29b-41d4-a716-446655440000",
      barcode: "88010001",
      productCode: "P-001",
      productName: "생수",
      spec: "500ml",
      supplierName: "샘물유통",
      quantity: 2,
      isUnregistered: false,
    },
  ];

  it("adds a new item when the barcode is not present", () => {
    const nextItem: OrderItemDraft = {
      barcode: "88010002",
      productName: "종이컵",
      spec: "1박스",
      quantity: 3,
      isUnregistered: false,
    };

    expect(upsertOrderItem(existingItems, nextItem)).toEqual([
      ...existingItems,
      nextItem,
    ]);
  });

  it("replaces an existing item with the same barcode", () => {
    const nextItem: OrderItemDraft = {
      barcode: "88010001",
      productName: "생수",
      spec: "500ml",
      quantity: 5,
      isUnregistered: false,
      memo: "수량 수정",
    };

    expect(upsertOrderItem(existingItems, nextItem)).toEqual([nextItem]);
  });

  it("removes an item when the next quantity is zero or less", () => {
    const nextItem: OrderItemDraft = {
      barcode: "88010001",
      productName: "생수",
      spec: "500ml",
      quantity: 0,
      isUnregistered: false,
    };

    expect(upsertOrderItem(existingItems, nextItem)).toEqual([]);
  });
});
