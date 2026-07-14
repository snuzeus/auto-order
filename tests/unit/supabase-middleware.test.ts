import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Supabase middleware", () => {
  it("creates one response before applying every refreshed cookie", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "lib", "supabase", "middleware.ts"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(source).toMatch(
      /response = NextResponse\.next\(\{\s*request,\s*\}\);\s*cookiesToSet\.forEach\(\(\{ name, value, options \}\)/,
    );
    expect(source).not.toContain("cookiesToSet.forEach(({ name, value, options }) => {\n            request.cookies.set(name, value);\n            response = NextResponse.next");
  });
});
