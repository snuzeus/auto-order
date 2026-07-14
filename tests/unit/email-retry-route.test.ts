import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("supplier email retry route", () => {
  it("requires an admin, a failed log, and a closed order before resending", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "app", "api", "admin", "email-retry", "route.ts"),
      "utf8",
    );

    expect(source).toContain("requireAdmin()");
    expect(source).toContain('.eq("status", "failed")');
    expect(source).toContain('.eq("status", "closed")');
    expect(source).toContain("sendSupplierOrderEmails(supabase, orderDate, { supplierName })");
  });
});
