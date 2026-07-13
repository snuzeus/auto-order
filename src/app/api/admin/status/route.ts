import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { buildClosingSummary } from "@/lib/domain/closing-summary";
import { closeDateSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import type { BranchOrderStatus, OrderItemDraft, OrderStatus } from "@/lib/types";

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

function buildBranchStatuses(branches: BranchRow[], orders: OrderRow[]): BranchOrderStatus[] {
  const ordersByBranchId = new Map<string, OrderRow>();

  for (const order of orders) {
    ordersByBranchId.set(order.branch_id, order);
  }

  return branches.map((branch) => {
    const order = ordersByBranchId.get(branch.id);
    const items = (order?.order_items ?? []).map(mapOrderItem).filter((item) => item.quantity > 0);

    return {
      branchId: branch.id,
      branchName: branch.name,
      status: order?.status ?? "not_submitted",
      itemCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      items,
    };
  });
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
    { data: orders, error: orderError },
    { data: emailLogs, error: emailLogsError },
  ] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("orders")
        .select(
          "branch_id, status, order_items(product_id, barcode, product_code, product_name, spec, supplier_name, unit_price, minimum_order_quantity, quantity, is_unregistered, memo)",
        )
        .eq("order_date", parsed.data.orderDate),
      supabase
        .from("supplier_email_logs")
        .select("id, supplier_name, email, status, reason, provider_message_id, created_at")
        .eq("order_date", parsed.data.orderDate)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (branchError || orderError) {
    return jsonError("관리자 현황을 불러오지 못했습니다.", 500);
  }

  const safeBranches = (branches ?? []) as BranchRow[];
  const safeOrders = (orders ?? []) as OrderRow[];
  const branchStatuses = buildBranchStatuses(safeBranches, safeOrders);
  const items = safeOrders.flatMap((order) => (order.order_items ?? []).map(mapOrderItem));
  const summary = buildClosingSummary(branchStatuses, items);

  return NextResponse.json({
    orderDate: parsed.data.orderDate,
    branchStatuses,
    summary,
    emailLogs: emailLogsError ? [] : ((emailLogs ?? []) as SupplierEmailLogRow[]),
  });
}
