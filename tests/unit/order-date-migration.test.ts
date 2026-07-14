import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("0018 restrict branch order date migration", () => {
  it("guards submit_branch_order with Seoul's current date", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "0018_restrict_branch_order_date.sql"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(sql).toContain("BRANCH_ORDER_DATE_INVALID");
    expect(sql).toContain("now() at time zone 'Asia/Seoul'");
  });
});
