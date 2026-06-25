"use client";

import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/browser";

const FOCUS_VISIBLE_CLASS =
  "focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        throw new Error("이메일 또는 비밀번호를 다시 확인해 주세요.");
      }

      window.location.replace("/admin");
      return;
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "로그인에 실패했습니다.");
    } finally {
      if (document.visibilityState === "visible") {
        setPending(false);
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950">
      <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
        <p className="m-0 text-sm font-semibold text-slate-600">본사 관리자</p>
        <h1 className="mt-2 text-3xl font-bold">관리자 로그인</h1>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="admin-email">
              이메일
            </label>
            <input
              autoComplete="email"
              className={`w-full border border-slate-300 px-4 py-4 text-lg ${FOCUS_VISIBLE_CLASS}`}
              disabled={pending}
              id="admin-email"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="admin-password">
              비밀번호
            </label>
            <input
              autoComplete="current-password"
              className={`w-full border border-slate-300 px-4 py-4 text-lg ${FOCUS_VISIBLE_CLASS}`}
              disabled={pending}
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p className="m-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <button
            className={`min-h-14 w-full bg-slate-900 px-5 py-4 text-lg font-bold text-white disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
            disabled={pending || !email.trim() || !password}
            type="submit"
          >
            {pending ? "로그인 중입니다..." : "로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}
