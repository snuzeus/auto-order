import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { closeDateSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";

type CancelClosingRpcRow = {
  cancel_closing_for_date: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeCancelError(message: string | undefined): { error: string; status: number } {
  switch (message) {
    case "취소할 마감 이력이 없습니다.":
      return { error: message, status: 409 };
    default:
      return { error: "마감 취소 중 오류가 발생했습니다.", status: 500 };
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

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("cancel_closing_for_date", {
    p_order_date: parsed.data.orderDate,
    p_admin_id: admin.adminId,
  });

  if (error) {
    const normalized = normalizeCancelError(error.message);
    return jsonError(normalized.error, normalized.status);
  }

  const closingBatchId =
    typeof data === "string"
      ? data
      : ((data as CancelClosingRpcRow | null)?.cancel_closing_for_date ?? null);

  if (!closingBatchId) {
    return jsonError("마감 취소 결과를 확인하지 못했습니다.", 500);
  }

  return NextResponse.json({ closingBatchId });
}
