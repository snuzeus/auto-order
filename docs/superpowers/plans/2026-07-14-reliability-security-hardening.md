# Reliability and Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin sessions stable, permit safe retry of failed supplier emails, restrict branch orders to today, and add production security headers.

**Architecture:** Keep Supabase as the source of truth. Extend the existing email sender with a supplier filter and expose it only through an authenticated admin route. Enforce order-date policy in both the API and database RPC.

**Tech Stack:** Next.js 15 route handlers, React 19, Supabase/Postgres, Vitest.

## Global Constraints

- Do not add branch authentication, remove XLS support, or add public API rate limits in this change.
- Retry only supplier email logs with `failed` status; skipped rows must remain non-actionable.
- Use `Asia/Seoul` for date comparisons.
- Do not expose service-role, Resend, or cron secrets to the browser.

---

### Task 1: Preserve Supabase session cookies

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Test: `tests/unit/supabase-middleware.test.ts`

- [ ] Write a failing test asserting every refreshed cookie remains on one response.
- [ ] Update `setAll` to mutate request cookies, create one `NextResponse`, and attach every cookie.
- [ ] Run `npm.cmd test -- tests/unit/supabase-middleware.test.ts`.

### Task 2: Restrict branch order dates

**Files:**
- Modify: `src/app/api/orders/route.ts`
- Create: `supabase/migrations/0018_restrict_branch_order_date.sql`
- Modify: `tests/unit/orders-route.test.ts`

- [ ] Write failing API tests for past and future dates.
- [ ] Reject non-today Asia/Seoul dates before the service-role query.
- [ ] Replace `submit_branch_order` with the same date guard in Postgres.
- [ ] Run the order route tests.

### Task 3: Retry failed supplier mail

**Files:**
- Modify: `src/lib/email/supplier-order-email.ts`
- Create: `src/app/api/admin/email-retry/route.ts`
- Modify: `src/app/admin/AdminDashboard.tsx`
- Modify: `tests/unit/supplier-order-email.test.ts`

- [ ] Write failing tests for supplier-filtered sending and admin retry validation.
- [ ] Add an optional supplier filter to the sender and an authenticated retry route that accepts only failed suppliers.
- [ ] Add a pending-safe retry control beside failed email log rows.
- [ ] Run email and dashboard-related tests.

### Task 4: Add production security headers

**Files:**
- Modify: `next.config.ts`
- Test: `tests/unit/security-headers.test.ts`

- [ ] Write a failing configuration test for CSP, frame denial, MIME protection, referrer policy, permissions policy, and HSTS.
- [ ] Add environment-aware headers that allow Next.js, Supabase, and camera use.
- [ ] Run the security-header test.

### Task 5: Verify the combined change

**Files:**
- Modify: `README.md` only if new operational setup is required.

- [ ] Run `npm.cmd test` and confirm zero failures.
- [ ] Stop local development servers that share `.next`, run `npm.cmd run build`, then restart `localhost:3000`.
- [ ] Review `git diff --check` and commit the focused change.
