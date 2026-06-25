import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { closingModeSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";

type ClosingSettingsRow = {
  mode: "manual" | "auto_14";
  auto_close_time: string;
  timezone: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isMissingSettingsTable(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "PGRST205" ||
    error?.message?.includes("closing_settings") === true
  );
}

function toResponse(row: ClosingSettingsRow | null) {
  return {
    closingSettings: {
      mode: row?.mode ?? "manual",
      autoCloseTime: row?.auto_close_time ?? "14:00:00",
      timezone: row?.timezone ?? "Asia/Seoul",
    },
  };
}

export async function GET() {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("closing_settings")
    .select("mode, auto_close_time, timezone")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to load closing settings", error);
    if (isMissingSettingsTable(error)) {
      return jsonError("마감 설정 테이블이 없습니다. Supabase에서 0006_closing_settings.sql을 먼저 실행해 주세요.", 500);
    }

    return jsonError("마감 설정을 불러오지 못했습니다.", 500);
  }

  return NextResponse.json(toResponse((data as ClosingSettingsRow | null) ?? null));
}

export async function PUT(request: Request) {
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

  const parsed = closingModeSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("마감 방식을 다시 선택해 주세요.", 400);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("closing_settings")
    .upsert({
      id: true,
      mode: parsed.data.mode,
      auto_close_time: "14:00:00",
      timezone: "Asia/Seoul",
      updated_by: admin.adminId,
      updated_at: new Date().toISOString(),
    })
    .select("mode, auto_close_time, timezone")
    .single();

  if (error) {
    console.error("Failed to save closing settings", error);
    if (isMissingSettingsTable(error)) {
      return jsonError("마감 설정 테이블이 없습니다. Supabase에서 0006_closing_settings.sql을 먼저 실행해 주세요.", 500);
    }

    return jsonError("마감 설정을 저장하지 못했습니다.", 500);
  }

  return NextResponse.json(toResponse(data as ClosingSettingsRow));
}
