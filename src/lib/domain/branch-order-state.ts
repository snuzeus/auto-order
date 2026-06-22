import type { OrderItemDraft } from "@/lib/types";

export function upsertOrderItem(
  items: OrderItemDraft[],
  nextItem: OrderItemDraft,
): OrderItemDraft[] {
  const remainingItems = items.filter((item) => item.barcode !== nextItem.barcode);

  if (nextItem.quantity <= 0) {
    return remainingItems;
  }

  return [...remainingItems, nextItem];
}
