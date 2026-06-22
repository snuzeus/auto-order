import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import type { Branch } from "@/lib/types";

type BranchRow = {
  id: string;
  code: string;
  name: string;
  delivery_address: string;
  recipient_name: string;
  phone: string;
  is_active: boolean;
};

function mapBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    deliveryAddress: row.delivery_address,
    recipientName: row.recipient_name,
    phone: row.phone,
    isActive: row.is_active,
  };
}

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, code, name, delivery_address, recipient_name, phone, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "지사 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    branches: (data ?? []).map((row) => mapBranch(row as BranchRow)),
  });
}
