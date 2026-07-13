import { readFileSync } from "node:fs";
import path from "node:path";

describe("0016 atomic master upload migration", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "0016_atomic_master_uploads.sql",
  );
  const sql = readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

  it("adds transactional replacement RPCs for uploaded master data", () => {
    expect(sql).toContain("create or replace function public.replace_product_master");
    expect(sql).toContain("create or replace function public.replace_branches_from_upload");
    expect(sql).toContain("create or replace function public.replace_supplier_directory_from_upload");
  });

  it("replaces products without destroying existing order item links", () => {
    expect(sql).not.toContain("update public.order_items");
    expect(sql).not.toContain("set product_id = null");
    expect(sql).not.toContain("delete from public.products");
    expect(sql).toContain("update public.products");
    expect(sql).toContain("insert into public.products");
    expect(sql).toContain("on conflict (barcode) do update");
    expect(sql).toContain("set is_active = false");
    expect(sql).toContain("and not exists (");
    expect(sql).toContain("jsonb_to_recordset(p_products)");
  });

  it("replaces branch and supplier directories inside database functions", () => {
    expect(sql).toContain("update public.branches");
    expect(sql).toContain("jsonb_to_recordset(p_branches)");
    expect(sql).toContain("delete from public.supplier_directory");
    expect(sql).toContain("jsonb_to_recordset(p_suppliers)");
  });

  it("revokes broad execute access before granting service role execution", () => {
    expect(sql).toContain(
      "revoke execute on function public.replace_product_master(jsonb) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.replace_product_master(jsonb)\nto service_role;",
    );
    expect(sql).toContain(
      "revoke execute on function public.replace_branches_from_upload(jsonb) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.replace_branches_from_upload(jsonb)\nto service_role;",
    );
    expect(sql).toContain(
      "revoke execute on function public.replace_supplier_directory_from_upload(jsonb) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.replace_supplier_directory_from_upload(jsonb)\nto service_role;",
    );
  });
});
