import { createClient } from "@/lib/supabase/server";

export type RequireAdminResult =
  | {
      ok: true;
      userId: string;
      adminId: string;
    }
  | {
      ok: false;
      error: string;
      status: 401 | 403 | 500;
    };

type AdminUserRow = {
  id: string;
};

export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return {
      ok: false,
      error: "관리자 로그인 정보를 확인하지 못했습니다.",
      status: 500,
    };
  }

  const user = data.user;

  if (!user) {
    return {
      ok: false,
      error: "관리자 로그인이 필요합니다.",
      status: 401,
    };
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (adminError) {
    return {
      ok: false,
      error: "관리자 권한을 확인하지 못했습니다.",
      status: 500,
    };
  }

  if (!(adminUser as AdminUserRow | null)?.id) {
    return {
      ok: false,
      error: "관리자 권한이 없습니다.",
      status: 403,
    };
  }

  return {
    ok: true,
    userId: user.id,
    adminId: (adminUser as AdminUserRow).id,
  };
}
