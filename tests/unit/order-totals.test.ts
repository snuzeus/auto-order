import { calculateOrderTotals } from "@/lib/domain/order-totals";

describe("calculateOrderTotals", () => {
  it("counts only active line items and sums their quantities", () => {
    const items = [
      {
        barcode: "88010001",
        productName: "생수",
        spec: "500ml",
        quantity: 3,
        isUnregistered: false,
      },
      {
        barcode: "88010002",
        productName: "종이컵",
        spec: "1팩",
        quantity: 2,
        isUnregistered: false,
      },
      {
        barcode: "88010003",
        productName: "메모용품",
        spec: "",
        quantity: 0,
        isUnregistered: true,
      },
    ];

    expect(calculateOrderTotals(items)).toEqual({
      lineItemCount: 2,
      totalQuantity: 5,
      unregisteredItemCount: 0,
    });
  });

  it("counts positive unregistered items only", () => {
    const items = [
      {
        barcode: "99990001",
        productName: "현장입력 상품",
        spec: "비고",
        quantity: 4,
        isUnregistered: true,
      },
      {
        barcode: "99990002",
        productName: "미사용 상품",
        spec: "",
        quantity: 0,
        isUnregistered: true,
      },
    ];

    expect(calculateOrderTotals(items).unregisteredItemCount).toBe(1);
  });
});
