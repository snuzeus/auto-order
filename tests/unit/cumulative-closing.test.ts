import { describe, expect, it } from "vitest";

import { buildCumulativeClosingView } from "@/lib/domain/cumulative-closing";

describe("buildCumulativeClosingView", () => {
  it("merges every submitted order through the closing date into one closing view", () => {
    const result = buildCumulativeClosingView(
      [
        { id: "branch-1", name: "Seoul" },
        { id: "branch-2", name: "Busan" },
      ],
      [
        {
          branchId: "branch-1",
          orderDate: "2026-08-17",
          status: "submitted",
          items: [
            {
              barcode: "8801",
              productName: "Water",
              spec: "500ml",
              supplierName: "Supplier A",
              quantity: 2,
              isUnregistered: false,
            },
          ],
        },
        {
          branchId: "branch-1",
          orderDate: "2026-08-18",
          status: "submitted",
          items: [
            {
              barcode: "8802",
              productName: "Coffee",
              spec: "20oz",
              supplierName: "Supplier B",
              quantity: 3,
              isUnregistered: false,
            },
          ],
        },
      ],
    );

    expect(result.includedFromDate).toBe("2026-08-17");
    expect(result.includedToDate).toBe("2026-08-18");
    expect(result.orderDateCount).toBe(2);
    expect(result.orderCount).toBe(2);
    expect(result.branchStatuses).toEqual([
      {
        branchId: "branch-1",
        branchName: "Seoul",
        status: "submitted",
        itemCount: 2,
        totalQuantity: 5,
        items: [
          expect.objectContaining({ orderDate: "2026-08-17", barcode: "8801", quantity: 2 }),
          expect.objectContaining({ orderDate: "2026-08-18", barcode: "8802", quantity: 3 }),
        ],
      },
      {
        branchId: "branch-2",
        branchName: "Busan",
        status: "not_submitted",
        itemCount: 0,
        totalQuantity: 0,
        items: [],
      },
    ]);
  });

  it("does not mix an older closed order into a new cumulative closing", () => {
    const result = buildCumulativeClosingView(
      [{ id: "branch-1", name: "Seoul" }],
      [
        {
          branchId: "branch-1",
          orderDate: "2026-08-16",
          status: "closed",
          items: [
            {
              barcode: "old",
              productName: "Old order",
              spec: "",
              supplierName: "Supplier A",
              quantity: 9,
              isUnregistered: false,
            },
          ],
        },
        {
          branchId: "branch-1",
          orderDate: "2026-08-17",
          status: "submitted",
          items: [
            {
              barcode: "new",
              productName: "New order",
              spec: "",
              supplierName: "Supplier A",
              quantity: 1,
              isUnregistered: false,
            },
          ],
        },
      ],
    );

    expect(result.orderCount).toBe(1);
    expect(result.branchStatuses[0].items).toEqual([
      expect.objectContaining({ barcode: "new", orderDate: "2026-08-17" }),
    ]);
  });

  it("shows every order from an existing closed batch as closed", () => {
    const result = buildCumulativeClosingView(
      [{ id: "branch-1", name: "Seoul" }],
      [
        {
          branchId: "branch-1",
          orderDate: "2026-08-17",
          status: "closed",
          items: [
            {
              barcode: "8801",
              productName: "Water",
              spec: "500ml",
              supplierName: "Supplier A",
              quantity: 2,
              isUnregistered: false,
            },
          ],
        },
      ],
      "closed",
    );

    expect(result.orderCount).toBe(1);
    expect(result.branchStatuses[0].status).toBe("closed");
    expect(result.branchStatuses[0].items[0]).toEqual(
      expect.objectContaining({ orderDate: "2026-08-17", barcode: "8801" }),
    );
  });
});
