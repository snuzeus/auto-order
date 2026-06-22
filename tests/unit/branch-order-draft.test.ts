import type { OrderItemDraft } from "@/lib/types";
import {
  buildSubmitBranchOrderItems,
  restoreBranchDraft,
  shouldPersistBranchDraft,
} from "@/lib/domain/branch-order-draft";

describe("restoreBranchDraft", () => {
  const serverItems: OrderItemDraft[] = [
    {
      barcode: "88010001",
      productName: "생수",
      spec: "500ml",
      quantity: 2,
      isUnregistered: false,
    },
  ];

  it("falls back to server items and clears storage for invalid JSON", () => {
    expect(restoreBranchDraft("{not-json", serverItems)).toEqual({
      items: serverItems,
      shouldClearStorage: true,
    });
  });

  it("falls back to server items and clears storage for invalid item shape", () => {
    const rawDraft = JSON.stringify([
      {
        barcode: "88010001",
        productName: "생수",
        spec: "500ml",
        quantity: -1,
        isUnregistered: false,
      },
    ]);

    expect(restoreBranchDraft(rawDraft, serverItems)).toEqual({
      items: serverItems,
      shouldClearStorage: true,
    });
  });

  it("restores a valid draft without clearing storage", () => {
    const draftItems: OrderItemDraft[] = [
      {
        barcode: "99990001",
        productName: "수기 상품",
        spec: "",
        quantity: 3,
        isUnregistered: true,
      },
    ];

    expect(restoreBranchDraft(JSON.stringify(draftItems), serverItems)).toEqual({
      items: draftItems,
      shouldClearStorage: false,
    });
  });
});

describe("shouldPersistBranchDraft", () => {
  const syncedItems: OrderItemDraft[] = [
    {
      barcode: "88010001",
      productName: "생수",
      spec: "500ml",
      quantity: 2,
      isUnregistered: false,
    },
  ];

  it("persists only when the order is editable and items differ from synced items", () => {
    expect(
      shouldPersistBranchDraft({
        items: [
          {
            barcode: "88010001",
            productName: "생수",
            spec: "500ml",
            quantity: 4,
            isUnregistered: false,
          },
        ],
        syncedItems,
        orderStatus: "submitted",
      }),
    ).toBe(true);
  });

  it("does not persist when items match synced items", () => {
    expect(
      shouldPersistBranchDraft({
        items: syncedItems,
        syncedItems,
        orderStatus: "submitted",
      }),
    ).toBe(false);
  });

  it("does not persist when the order is closed", () => {
    expect(
      shouldPersistBranchDraft({
        items: [
          {
            barcode: "88010001",
            productName: "생수",
            spec: "500ml",
            quantity: 5,
            isUnregistered: false,
          },
        ],
        syncedItems,
        orderStatus: "closed",
      }),
    ).toBe(false);
  });
});

describe("buildSubmitBranchOrderItems", () => {
  it("filters zero-quantity rows and maps camelCase items to RPC payload rows", () => {
    const result = buildSubmitBranchOrderItems([
      {
        productId: "550e8400-e29b-41d4-a716-446655440000",
        barcode: "88010001",
        productCode: "P-001",
        productName: "생수",
        spec: "500ml",
        supplierName: "샘물유통",
        quantity: 3,
        isUnregistered: false,
        memo: "냉장",
      },
      {
        barcode: "99990001",
        productName: "수기 상품",
        spec: "",
        quantity: 0,
        isUnregistered: true,
      },
    ]);

    expect(result).toEqual([
      {
        product_id: "550e8400-e29b-41d4-a716-446655440000",
        barcode: "88010001",
        product_code: "P-001",
        product_name: "생수",
        spec: "500ml",
        supplier_name: "샘물유통",
        quantity: 3,
        is_unregistered: false,
        memo: "냉장",
      },
    ]);
  });
});
