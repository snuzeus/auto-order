import type { BranchOrderStatus, OrderItemDraft } from "@/lib/types";

export type ClosingSummary = {
  submittedBranchCount: number;
  unsubmittedBranchNames: string[];
  totalItemCount: number;
  totalQuantity: number;
  supplierCount: number;
  unregisteredItemCount: number;
  unresolvedItemCount: number;
};

export function buildClosingSummary(
  branchStatuses: BranchOrderStatus[],
  items: OrderItemDraft[],
): ClosingSummary {
  const activeItems = items.filter((item) => item.quantity > 0);
  const supplierNames = new Set(
    activeItems
      .map((item) => item.supplierName?.trim())
      .filter((supplierName): supplierName is string => Boolean(supplierName)),
  );

  return {
    submittedBranchCount: branchStatuses.filter((branch) => branch.status === "submitted").length,
    unsubmittedBranchNames: branchStatuses
      .filter((branch) => branch.status === "not_submitted")
      .map((branch) => branch.branchName),
    totalItemCount: activeItems.length,
    totalQuantity: activeItems.reduce((sum, item) => sum + item.quantity, 0),
    supplierCount: supplierNames.size,
    unregisteredItemCount: activeItems.filter((item) => item.isUnregistered).length,
    unresolvedItemCount: activeItems.filter((item) => !item.supplierName?.trim()).length,
  };
}
