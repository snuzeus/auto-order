import { buildClosingSummary } from "@/lib/domain/closing-summary";

describe("buildClosingSummary", () => {
  it("summarizes submitted branches, active items, suppliers, and unresolved items", () => {
    const branchStatuses = [
      {
        branchId: "branch-1",
        branchName: "Gangnam",
        status: "submitted",
        itemCount: 2,
        totalQuantity: 5,
      },
      {
        branchId: "branch-2",
        branchName: "Busan",
        status: "not_submitted",
        itemCount: 0,
        totalQuantity: 0,
      },
      {
        branchId: "branch-3",
        branchName: "Daegu",
        status: "closed",
        itemCount: 1,
        totalQuantity: 1,
      },
    ];

    const items = [
      {
        barcode: "1",
        productCode: "P1",
        productName: "Water",
        spec: "500ml",
        supplierName: "Supplier A",
        quantity: 3,
        isUnregistered: false,
      },
      {
        barcode: "2",
        productCode: "P2",
        productName: "Cup Noodle",
        spec: "Small",
        quantity: 2,
        isUnregistered: true,
      },
      {
        barcode: "3",
        productCode: "P3",
        productName: "Ignored Item",
        spec: "",
        supplierName: "Inactive Supplier",
        quantity: 0,
        isUnregistered: true,
      },
    ];

    expect(buildClosingSummary(branchStatuses, items)).toEqual({
      submittedBranchCount: 1,
      unsubmittedBranchNames: ["Busan"],
      totalItemCount: 2,
      totalQuantity: 5,
      supplierCount: 1,
      unregisteredItemCount: 1,
      unresolvedItemCount: 1,
    });
  });

  it("treats whitespace-only supplier names as unresolved", () => {
    const summary = buildClosingSummary(
      [],
      [
        {
          barcode: "4",
          productName: "Manual Item",
          spec: "",
          supplierName: "   ",
          quantity: 1,
          isUnregistered: true,
        },
      ],
    );

    expect(summary.supplierCount).toBe(0);
    expect(summary.unresolvedItemCount).toBe(1);
  });
});
