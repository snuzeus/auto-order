import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { sendSupplierOrderEmails } from "@/lib/email/supplier-order-email";
import { seoulYmd } from "@/lib/domain/order-date";
import { cleanupOrdersBeforeYesterday } from "@/lib/orders/cleanup-old-orders";
import { closeDateSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";

type CloseOrdersRpcRow = {
  close_orders_through_date: string | null;
};

// 납품처별 메일을 순차 발송하므로 기본 실행 시간(짧은 플랜은 10초)을 넘길 수 있다.
export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeCloseError(message: string | undefined): { error: string; status: number } {
  switch (message) {
    case "이미 마감된 날짜입니다.":
      return { error: message, status: 409 };
    case "공급처가 비어 있는 상품이 있어 마감할 수 없습니다.":
      return { error: message, status: 409 };
    case "마감할 제출 주문이 없습니다.":
      return { error: message, status: 409 };
    case "마감할 누적 제출 주문이 없습니다.":
      return { error: message, status: 409 };
    default:
      return { error: "마감 처리 중 오류가 발생했습니다.", status: 500 };
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("요청 내용을 다시 확인해 주세요.", 400);
  }

  const parsed = closeDateSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("마감 날짜를 다시 확인해 주세요.", 400);
  }

  // 미래 날짜로 마감하면 그 날짜가 됐을 때 지사가 주문을 제출할 수 없게 된다.
  if (parsed.data.orderDate > seoulYmd()) {
    return jsonError("오늘 이후 날짜는 마감할 수 없습니다.", 400);
  }

  const supabase = createServiceClient();
  const { data: settings, error: settingsError } = await supabase
    .from("closing_settings")
    .select("mode")
    .eq("id", true)
    .maybeSingle();

  if (settingsError) {
    return jsonError("마감 설정을 확인하지 못했습니다.", 500);
  }

  if (settings?.mode !== "manual") {
    return jsonError("수동 마감 모드에서만 누적 마감을 실행할 수 있습니다.", 409);
  }

  const { data, error } = await supabase.rpc("close_orders_through_date", {
    p_order_date: parsed.data.orderDate,
    p_admin_id: admin.adminId,
  });

  if (error) {
    const normalized = normalizeCloseError(error.message);
    return jsonError(normalized.error, normalized.status);
  }

  const closingBatchId =
    typeof data === "string"
      ? data
      : ((data as CloseOrdersRpcRow | null)?.close_orders_through_date ?? null);

  if (!closingBatchId) {
    return jsonError("마감 처리 결과를 확인하지 못했습니다.", 500);
  }

  const emailResult = await sendSupplierOrderEmails(
    supabase,
    closingBatchId,
    parsed.data.orderDate,
  );
  const cleanupResult = await cleanupOrdersBeforeYesterday(supabase);

  return NextResponse.json({ closingBatchId, emailResult, cleanupResult });
}
