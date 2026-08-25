import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { buildClosingSummary } from "@/lib/domain/closing-summary";
import { buildCumulativeClosingView } from "@/lib/domain/cumulative-closing";
import { closeDateSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import type { OrderItemDraft, OrderStatus } from "@/lib/types";

type BranchRow = {
  id: string;
  name: string;
};

type OrderItemRow = {
  product_id: string | null;
  barcode: string;
  product_code: string | null;
  product_name: string;
  spec: string | null;
  supplier_name: string | null;
  unit_price: number | string | null;
  minimum_order_quantity: number | null;
  quantity: number | null;
  is_unregistered: boolean | null;
  memo: string | null;
};

type OrderRow = {
  branch_id: string;
  order_date: string;
  status: OrderStatus;
  order_items?: OrderItemRow[] | null;
};

type SupplierEmailLogRow = {
  id: string;
  supplier_name: string;
  email: string | null;
  status: "sent" | "skipped" | "failed";
  reason: string | null;
  provider_message_id: string | null;
  created_at: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function mapOrderItem(row: OrderItemRow): OrderItemDraft {
  return {
    productId: row.product_id ?? undefined,
    barcode: row.barcode,
    productCode: row.product_code ?? undefined,
    productName: row.product_name,
    spec: row.spec ?? "",
    supplierName: row.supplier_name?.trim() ? row.supplier_name.trim() : undefined,
    unitPrice:
      row.unit_price === null || row.unit_price === undefined ? undefined : Number(row.unit_price),
    minimumOrderQuantity:
      row.minimum_order_quantity === null || row.minimum_order_quantity === undefined
        ? undefined
        : row.minimum_order_quantity,
    quantity: row.quantity ?? 0,
    isUnregistered: Boolean(row.is_unregistered),
    memo: row.memo ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  const orderDate = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  const parsed = closeDateSchema.safeParse({ orderDate });

  if (!parsed.success) {
    return jsonError("조회 날짜를 다시 확인해 주세요.", 400);
  }

  const supabase = createServiceClient();
  const [
    { data: branches, error: branchError },
    { data: settings, error: settingsError },
    { data: closingBatch, error: closingBatchError },
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase.from("closing_settings").select("mode").eq("id", true).maybeSingle(),
    supabase
      .from("closing_batches")
      .select("id, order_date")
      .eq("order_date", parsed.data.orderDate)
      .eq("status", "closed")
      .maybeSingle(),
  ]);

  if (branchError || settingsError || closingBatchError) {
    return jsonError("관리자 현황을 불러오지 못했습니다.", 500);
  }

  let resolvedClosingBatch = closingBatch as { id: string; order_date: string } | null;

  if (!resolvedClosingBatch) {
    const { data: closedOrder, error: closedOrderError } = await supabase
      .from("orders")
      .select("closing_batch_id")
      .eq("order_date", parsed.data.orderDate)
      .eq("status", "closed")
      .not("closing_batch_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (closedOrderError) {
      return jsonError("선택한 주문일의 마감 묶음을 확인하지 못했습니다.", 500);
    }

    if (closedOrder?.closing_batch_id) {
      const { data: batchByOrder, error: batchByOrderError } = await supabase
        .from("closing_batches")
        .select("id, order_date")
        .eq("id", closedOrder.closing_batch_id)
        .eq("status", "closed")
        .maybeSingle();

      if (batchByOrderError) {
        return jsonError("선택한 주문일의 마감 묶음을 확인하지 못했습니다.", 500);
      }

      resolvedClosingBatch = batchByOrder as { id: string; order_date: string } | null;
    }
  }

  const activeClosingBatchId = resolvedClosingBatch?.id ?? null;
  const closingDate = resolvedClosingBatch?.order_date ?? null;
  const isManualMode = (settings?.mode ?? "manual") === "manual";
  let ordersRequest = supabase
    .from("orders")
    .select(
      "branch_id, order_date, status, order_items(product_id, barcode, product_code, product_name, spec, supplier_name, unit_price, minimum_order_quantity, quantity, is_unregistered, memo)",
    );

  if (activeClosingBatchId) {
    ordersRequest = ordersRequest.eq("closing_batch_id", activeClosingBatchId);
  } else if (isManualMode) {
    ordersRequest = ordersRequest
      .lte("order_date", parsed.data.orderDate)
      .eq("status", "submitted");
  } else {
    ordersRequest = ordersRequest.eq("order_date", parsed.data.orderDate);
  }

  let emailLogsRequest = supabase
    .from("supplier_email_logs")
    .select("id, supplier_name, email, status, reason, provider_message_id, created_at");

  emailLogsRequest = activeClosingBatchId
    ? emailLogsRequest.eq("closing_batch_id", activeClosingBatchId)
    : emailLogsRequest.eq("order_date", parsed.data.orderDate);

  const [
    { data: orders, error: orderError },
    { data: emailLogs, error: emailLogsError },
  ] = await Promise.all([
    ordersRequest,
    emailLogsRequest.order("created_at", { ascending: false }).limit(50),
  ]);

  if (orderError) {
    return jsonError("관리자 주문 현황을 불러오지 못했습니다.", 500);
  }

  const safeOrders = (orders ?? []) as OrderRow[];
  const closingView = buildCumulativeClosingView(
    (branches ?? []) as BranchRow[],
    safeOrders.map((order) => ({
      branchId: order.branch_id,
      orderDate: order.order_date,
      status: order.status,
      items: (order.order_items ?? []).map(mapOrderItem),
    })),
    activeClosingBatchId ? "closed" : "submitted",
  );
  const items = closingView.branchStatuses.flatMap((branch) => branch.items);
  const summary = buildClosingSummary(closingView.branchStatuses, items);

  return NextResponse.json({
    orderDate: parsed.data.orderDate,
    closingBatchId: activeClosingBatchId,
    closingDate,
    includedFromDate: closingView.includedFromDate,
    includedToDate: closingView.includedToDate,
    orderDateCount: closingView.orderDateCount,
    orderCount: closingView.orderCount,
    branchStatuses: closingView.branchStatuses,
    summary,
    emailLogs: emailLogsError ? [] : ((emailLogs ?? []) as SupplierEmailLogRow[]),
  });
}
