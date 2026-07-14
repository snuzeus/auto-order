import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("security headers", () => {
  it("sets browser protection headers", async () => {
    const headers = await nextConfig.headers?.();
    const values = new Map(headers?.[0]?.headers.map((header) => [header.key, header.value]));

    expect(values.get("X-Content-Type-Options")).toBe("nosniff");
    expect(values.get("X-Frame-Options")).toBe("DENY");
    expect(values.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(values.get("Permissions-Policy")).toContain("camera=(self)");
    expect(values.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(values.get("Content-Security-Policy")).toContain("'unsafe-eval'");
  });
});
