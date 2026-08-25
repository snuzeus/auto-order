import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteClosedRecordsBefore } from "@/lib/orders/cleanup-policy";

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

  return deleteClosedRecordsBefore(supabase, cutoffDate);
}
