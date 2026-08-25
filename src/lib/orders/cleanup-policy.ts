import type { SupabaseClient } from "@supabase/supabase-js";

import type { OrderCleanupResult } from "@/lib/orders/cleanup-old-orders";

export async function deleteClosedRecordsBefore(
  supabase: SupabaseClient,
  cutoffDate: string,
): Promise<OrderCleanupResult> {
  const closedBefore = `${cutoffDate}T00:00:00+09:00`;
  const { data: deletedEmailLogs, error: emailLogsError } = await supabase
    .from("supplier_email_logs")
    .delete()
    .lt("created_at", closedBefore)
    .select("id");

  if (emailLogsError) {
    return {
      cutoffDate,
      deletedOrders: 0,
      deletedClosingBatches: 0,
      deletedEmailLogs: 0,
      error: emailLogsError.message,
    };
  }

  const { data: deletedOrders, error: ordersError } = await supabase
    .from("orders")
    .delete()
    .eq("status", "closed")
    .lt("closed_at", closedBefore)
    .select("id");

  if (ordersError) {
    return {
      cutoffDate,
      deletedOrders: 0,
      deletedClosingBatches: 0,
      deletedEmailLogs: deletedEmailLogs?.length ?? 0,
      error: ordersError.message,
    };
  }

  const { data: deletedClosingBatches, error: closingBatchesError } = await supabase
    .from("closing_batches")
    .delete()
    .lt("closed_at", closedBefore)
    .select("id");

  if (closingBatchesError) {
    return {
      cutoffDate,
      deletedOrders: deletedOrders?.length ?? 0,
      deletedClosingBatches: 0,
      deletedEmailLogs: deletedEmailLogs?.length ?? 0,
      error: closingBatchesError.message,
    };
  }

  return {
    cutoffDate,
    deletedOrders: deletedOrders?.length ?? 0,
    deletedClosingBatches: deletedClosingBatches?.length ?? 0,
    deletedEmailLogs: deletedEmailLogs?.length ?? 0,
  };
}
