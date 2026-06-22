import { readFileSync } from "node:fs";
import path from "node:path";

function getFunctionBlock(sql: string, functionName: string): string {
  const start = sql.indexOf(`create or replace function public.${functionName}`);

  if (start === -1) {
    throw new Error(`Function ${functionName} not found in migration`);
  }

  const nextFunction = sql.indexOf("create or replace function public.", start + 1);
  const nextRevoke = sql.indexOf("revoke execute on function public.", start + 1);
  const endCandidates = [nextFunction, nextRevoke].filter((index) => index !== -1);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : sql.length;

  return sql.slice(start, end);
}

describe("0004 order-date advisory lock migration", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "0004_order_date_advisory_locks.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("defines a helper that locks the order date invariant", () => {
    expect(sql).toContain("create or replace function public.lock_order_date(p_order_date date)");
    expect(sql).toMatch(
      /pg_advisory_xact_lock\(\s*hashtext\('auto_order_date'\),\s*hashtext\(p_order_date::text\)\s*\)/,
    );
    expect(sql).toContain("Protects the date-level close/submit invariant");
  });

  it("serializes submit_branch_order before checking for closed batches", () => {
    const submitBlock = getFunctionBlock(sql, "submit_branch_order");
    const lockIndex = submitBlock.indexOf("perform public.lock_order_date(p_order_date);");
    const closedCheckIndex = submitBlock.indexOf("from public.closing_batches");

    expect(lockIndex).toBeGreaterThan(-1);
    expect(closedCheckIndex).toBeGreaterThan(lockIndex);
    expect(submitBlock).toContain("raise exception using message = 'ORDER_DATE_CLOSED';");
  });

  it("serializes close and cancel operations on the same order date", () => {
    const closeBlock = getFunctionBlock(sql, "close_orders_for_date");
    const cancelBlock = getFunctionBlock(sql, "cancel_closing_for_date");

    expect(closeBlock).toContain("perform public.lock_order_date(p_order_date);");
    expect(cancelBlock).toContain("perform public.lock_order_date(p_order_date);");
    expect(sql).toContain(
      "revoke execute on function public.submit_branch_order(uuid, date, jsonb)",
    );
    expect(sql).toContain(
      "revoke execute on function public.close_orders_for_date(date, uuid) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "revoke execute on function public.cancel_closing_for_date(date, uuid) from public, anon, authenticated;",
    );
  });
});
