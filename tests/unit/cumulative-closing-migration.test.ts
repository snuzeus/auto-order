import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("0019 cumulative manual closing migration", () => {
  it("links every submitted order through the cutoff date to one closing batch", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "0019_cumulative_manual_closing.sql"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(sql).toContain("add column if not exists closing_batch_id uuid");
    expect(sql).toContain("create or replace function public.close_orders_through_date(");
    expect(sql).toMatch(/orders\.order_date\s*<=\s*p_order_date/);
    expect(sql).toMatch(/orders\.status\s*=\s*'submitted'/);
    expect(sql).toContain("closing_batch_id = v_closing_batch_id");
  });

  it("reopens only the orders that belong to the cancelled batch", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "0019_cumulative_manual_closing.sql"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(sql).toMatch(/where public\.orders\.closing_batch_id\s*=\s*v_closing_batch_id/);
    expect(sql).toContain("closing_batch_id = null");
    expect(sql).toContain("set status = 'cancelled'");
  });

  it("backfills email logs only into the batch lifecycle that produced them", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "0019_cumulative_manual_closing.sql"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(sql).toContain("public.closing_batches.closed_at <= public.supplier_email_logs.created_at");
    expect(sql).toContain("public.supplier_email_logs.created_at <= public.closing_batches.cancelled_at");
    expect(sql).toContain("matched_email_logs.closing_batch_id is not null");
  });
});
