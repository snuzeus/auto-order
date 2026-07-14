import { describe, expect, it } from "vitest";

import { isTodayInSeoul } from "@/lib/domain/order-date";

describe("isTodayInSeoul", () => {
  it("accepts the Seoul calendar date and rejects adjacent dates", () => {
    const now = new Date("2026-07-14T01:00:00+09:00");

    expect(isTodayInSeoul("2026-07-14", now)).toBe(true);
    expect(isTodayInSeoul("2026-07-13", now)).toBe(false);
    expect(isTodayInSeoul("2026-07-15", now)).toBe(false);
  });
});
