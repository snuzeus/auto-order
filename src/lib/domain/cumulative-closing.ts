import type { BranchOrderStatus, OrderItemDraft, OrderStatus } from "@/lib/types";

export type ClosingBranch = {
  id: string;
  name: string;
};

export type ClosingOrder = {
  branchId: string;
  orderDate: string;
  status: OrderStatus;
  items: OrderItemDraft[];
};

export type CumulativeClosingView = {
  branchStatuses: BranchOrderStatus[];
  includedFromDate: string | null;
  includedToDate: string | null;
  orderDateCount: number;
  orderCount: number;
};

export function buildCumulativeClosingView(
  branches: ClosingBranch[],
  orders: ClosingOrder[],
  includedStatus: Extract<OrderStatus, "submitted" | "closed"> = "submitted",
): CumulativeClosingView {
  const includedOrders = orders.filter((order) => order.status === includedStatus);
  const ordersByBranchId = new Map<string, ClosingOrder[]>();

  for (const order of includedOrders) {
    const branchOrders = ordersByBranchId.get(order.branchId) ?? [];
    branchOrders.push(order);
    ordersByBranchId.set(order.branchId, branchOrders);
  }

  const branchStatuses = branches.map((branch): BranchOrderStatus => {
    const branchOrders = ordersByBranchId.get(branch.id) ?? [];
    const items = branchOrders.flatMap((order) =>
      order.items
        .filter((item) => item.quantity > 0)
        .map((item) => ({ ...item, orderDate: order.orderDate })),
    );

    return {
      branchId: branch.id,
      branchName: branch.name,
      status: branchOrders.length > 0 ? includedStatus : "not_submitted",
      itemCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      items,
    };
  });
  const orderDates = [...new Set(includedOrders.map((order) => order.orderDate))].sort();

  return {
    branchStatuses,
    includedFromDate: orderDates[0] ?? null,
    includedToDate: orderDates.at(-1) ?? null,
    orderDateCount: orderDates.length,
    orderCount: includedOrders.length,
  };
}
