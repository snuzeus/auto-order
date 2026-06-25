import { calculateOrderTotals } from "@/lib/domain/order-totals";

describe("calculateOrderTotals", () => {
  it("counts only active line items and sums their quantities", () => {
    const items = [
      {
        barcode: "88010001",
        productName: "생수",
        spec: "500ml",
        unitPrice: 1000,
        quantity: 3,
        isUnregistered: false,
      },
      {
        barcode: "88010002",
        productName: "종이컵",
        spec: "1팩",
        unitPrice: 2500,
        quantity: 2,
        isUnregistered: false,
      },
      {
        barcode: "88010003",
        productName: "메모용품",
        spec: "",
        quantity: 0,
        isUnregistered: false,
      },
    ];

    expect(calculateOrderTotals(items)).toEqual({
      lineItemCount: 2,
      totalQuantity: 5,
      totalAmount: 8000,
    });
  });
});
