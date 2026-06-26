import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type ClosingSettingsRow = {
  mode: "manual" | "auto_14";
};

type CloseOrdersRpcRow = {
  close_orders_for_date: string | null;
};

function logAutoClose(event: string, details: Record<string, unknown> = {}) {
  console.info("[auto-close]", event, details);
}

function todayInSeoul(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!expectedSecret) {
    logAutoClose("missing_cron_secret");
    return jsonError("자동 마감 보안 설정이 없습니다.", 500);
  }

  if (bearerToken !== expectedSecret) {
    logAutoClose("unauthorized", {
      hasAuthorizationHeader: authHeader !== "",
    });
    return jsonError("자동 마감 권한을 확인하지 못했습니다.", 401);
  }

  const supabase = createServiceClient();
  const { data: settings, error: settingsError } = await supabase
    .from("closing_settings")
    .select("mode")
    .eq("id", true)
    .maybeSingle();

  if (settingsError) {
    logAutoClose("settings_error", {
      message: settingsError.message,
    });
    return jsonError("마감 설정을 불러오지 못했습니다.", 500);
  }

  const mode = (settings as ClosingSettingsRow | null)?.mode ?? "manual";

  if (mode !== "auto_14") {
    logAutoClose("skipped_manual_mode", { mode });
    return NextResponse.json({
      skipped: true,
      reason: "manual_mode",
      mode,
    });
  }

  const orderDate = todayInSeoul();
  logAutoClose("started", { orderDate, mode });

  const { data, error } = await supabase.rpc("close_orders_for_date", {
    p_order_date: orderDate,
    p_admin_id: null,
  });

  if (error) {
    logAutoClose("rpc_skipped_or_failed", {
      orderDate,
      message: error.message,
    });
    return NextResponse.json({
      skipped: true,
      orderDate,
      reason: error.message,
    });
  }

  const closingBatchId =
    typeof data === "string"
      ? data
      : ((data as CloseOrdersRpcRow | null)?.close_orders_for_date ?? null);

  logAutoClose("closed", {
    orderDate,
    closingBatchId,
  });

  return NextResponse.json({
    skipped: false,
    orderDate,
    closingBatchId,
  });
}
