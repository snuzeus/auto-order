import { z } from "zod";

import { orderItemDraftSchema } from "@/lib/schemas";
import type { OrderItemDraft, OrderStatus } from "@/lib/types";

const orderItemDraftListSchema = z.array(orderItemDraftSchema);

export type SubmitBranchOrderItemRow = {
  product_id: string | null;
  barcode: string;
  product_code: string | null;
  product_name: string;
  spec: string;
  supplier_name: string | null;
  quantity: number;
  is_unregistered: boolean;
  memo: string | null;
};

type RestoreBranchDraftResult = {
  items: OrderItemDraft[];
  shouldClearStorage: boolean;
};

type ShouldPersistBranchDraftInput = {
  items: OrderItemDraft[];
  syncedItems: OrderItemDraft[];
  orderStatus: "not_submitted" | OrderStatus;
};

function areOrderItemsEqual(left: OrderItemDraft[], right: OrderItemDraft[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const other = right[index];

    return (
      item.productId === other.productId &&
      item.barcode === other.barcode &&
      item.productCode === other.productCode &&
      item.productName === other.productName &&
      item.spec === other.spec &&
      item.supplierName === other.supplierName &&
      item.quantity === other.quantity &&
      item.isUnregistered === other.isUnregistered &&
      item.memo === other.memo
    );
  });
}

export function restoreBranchDraft(
  rawDraft: string | null,
  fallbackItems: OrderItemDraft[],
): RestoreBranchDraftResult {
  if (!rawDraft) {
    return {
      items: fallbackItems,
      shouldClearStorage: false,
    };
  }

  try {
    const parsed = JSON.parse(rawDraft) as unknown;
    const result = orderItemDraftListSchema.safeParse(parsed);

    if (!result.success) {
      return {
        items: fallbackItems,
        shouldClearStorage: true,
      };
    }

    return {
      items: result.data,
      shouldClearStorage: false,
    };
  } catch {
    return {
      items: fallbackItems,
      shouldClearStorage: true,
    };
  }
}

export function shouldPersistBranchDraft({
  items,
  syncedItems,
  orderStatus,
}: ShouldPersistBranchDraftInput): boolean {
  if (orderStatus === "closed") {
    return false;
  }

  return !areOrderItemsEqual(items, syncedItems);
}

export function buildSubmitBranchOrderItems(
  items: OrderItemDraft[],
): SubmitBranchOrderItemRow[] {
  return items
    .filter((item) => item.quantity > 0)
    .map((item) => ({
      product_id: item.productId ?? null,
      barcode: item.barcode,
      product_code: item.productCode ?? null,
      product_name: item.productName,
      spec: item.spec,
      supplier_name: item.supplierName ?? null,
      quantity: item.quantity,
      is_unregistered: item.isUnregistered,
      memo: item.memo ?? null,
    }));
}

export function hasDraftDifferences(
  items: OrderItemDraft[],
  syncedItems: OrderItemDraft[],
): boolean {
  return !areOrderItemsEqual(items, syncedItems);
}
