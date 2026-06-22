import type { OrderItemDraft, OrderTotals } from "@/lib/types";

export function calculateOrderTotals(items: OrderItemDraft[]): OrderTotals {
  const activeItems = items.filter((item) => item.quantity > 0);

  return {
    lineItemCount: activeItems.length,
    totalQuantity: activeItems.reduce((sum, item) => sum + item.quantity, 0),
    unregisteredItemCount: activeItems.filter((item) => item.isUnregistered).length,
  };
}
