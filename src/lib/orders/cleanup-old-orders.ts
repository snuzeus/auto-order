import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderCleanupResult = {
  cutoffDate: string;
  deletedOrders: number;
  deletedClosingBatches: number;
  deletedEmailLogs: number;
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

  const { data: deletedEmailLogs, error: emailLogsError } = await supabase
    .from("supplier_email_logs")
    .delete()
    .lt("order_date", cutoffDate)
    .select("id");

  if (emailLogsError) {
    return { cutoffDate, deletedOrders: 0, deletedClosingBatches: 0, deletedEmailLogs: 0, error: emailLogsError.message };
  }

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
      deletedEmailLogs: deletedEmailLogs?.length ?? 0,
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
      deletedEmailLogs: deletedEmailLogs?.length ?? 0,
      error: ordersError.message,
    };
  }

  return {
    cutoffDate,
    deletedOrders: deletedOrders?.length ?? 0,
    deletedClosingBatches: deletedClosingBatches?.length ?? 0,
    deletedEmailLogs: deletedEmailLogs?.length ?? 0,
  };
}
