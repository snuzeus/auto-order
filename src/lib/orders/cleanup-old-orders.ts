import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderCleanupResult = {
  cutoffDate: string;
  deletedOrders: number;
  deletedClosingBatches: number;
  error?: string;
};

function dateInSeoul(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function cutoffBeforeYesterdayInSeoul(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  return dateInSeoul(yesterday);
}

export async function cleanupOrdersBeforeYesterday(
  supabase: SupabaseClient,
): Promise<OrderCleanupResult> {
  const cutoffDate = cutoffBeforeYesterdayInSeoul();

  const { data: deletedClosingBatches, error: closingBatchesError } = await supabase
    .from("closing_batches")
    .delete()
    .lt("order_date", cutoffDate)
    .select("id");

  if (closingBatchesError) {
    return {
      cutoffDate,
      deletedOrders: 0,
      deletedClosingBatches: 0,
      error: closingBatchesError.message,
    };
  }

  const { data: deletedOrders, error: ordersError } = await supabase
    .from("orders")
    .delete()
    .lt("order_date", cutoffDate)
    .select("id");

  if (ordersError) {
    return {
      cutoffDate,
      deletedOrders: 0,
      deletedClosingBatches: deletedClosingBatches?.length ?? 0,
      error: ordersError.message,
    };
  }

  return {
    cutoffDate,
    deletedOrders: deletedOrders?.length ?? 0,
    deletedClosingBatches: deletedClosingBatches?.length ?? 0,
  };
}
