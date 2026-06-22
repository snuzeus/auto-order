import { buildClosingSummary } from "@/lib/domain/closing-summary";

describe("buildClosingSummary", () => {
  it("summarizes submitted branches, active items, suppliers, and unresolved items", () => {
    const branchStatuses = [
      {
        branchId: "branch-1",
        branchName: "강남점",
        status: "submitted",
        itemCount: 2,
        totalQuantity: 5,
      },
      {
        branchId: "branch-2",
        branchName: "부산점",
        status: "not_submitted",
        itemCount: 0,
        totalQuantity: 0,
      },
      {
        branchId: "branch-3",
        branchName: "대구점",
        status: "closed",
        itemCount: 1,
        totalQuantity: 1,
      },
    ];

    const items = [
      {
        barcode: "1",
        productCode: "P1",
        productName: "생수",
        spec: "500ml",
        supplierName: "에이공급사",
        quantity: 3,
        isUnregistered: false,
      },
      {
        barcode: "2",
        productCode: "P2",
        productName: "컵라면",
        spec: "소",
        quantity: 2,
        isUnregistered: true,
      },
      {
        barcode: "3",
        productCode: "P3",
        productName: "무시항목",
        spec: "",
        supplierName: "비활성공급사",
        quantity: 0,
        isUnregistered: true,
      },
    ];

    expect(buildClosingSummary(branchStatuses, items)).toEqual({
      submittedBranchCount: 1,
      unsubmittedBranchNames: ["부산점"],
      totalItemCount: 2,
      totalQuantity: 5,
      supplierCount: 1,
      unregisteredItemCount: 1,
      unresolvedItemCount: 1,
    });
  });
});
