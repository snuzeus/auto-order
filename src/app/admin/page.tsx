import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";

import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const admin = await requireAdmin();

  if (!admin.ok && admin.status === 401) {
    redirect("/admin/login");
  }

  if (!admin.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950">
        <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
          <p className="m-0 text-sm font-semibold text-slate-600">본사 관리자</p>
          <h1 className="mt-2 text-2xl font-bold">관리자 접근 불가</h1>
          <p className="mt-4 text-base text-slate-700">{admin.error}</p>
          <Link
            className="mt-6 flex min-h-12 items-center justify-center bg-slate-900 px-5 py-3 text-base font-bold text-white"
            href="/admin/login"
          >
            로그인 화면으로 이동
          </Link>
        </section>
      </main>
    );
  }

  return <AdminDashboard />;
}
