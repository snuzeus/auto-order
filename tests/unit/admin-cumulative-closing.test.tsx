import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

vi.mock("@/app/admin/MasterDataPanel", () => ({
  default: () => null,
}));

import AdminDashboard from "@/app/admin/AdminDashboard";

describe("AdminDashboard cumulative manual closing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the accumulated order period and order counts before closing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("closing-settings")
          ? {
              closingSettings: {
                mode: "manual",
                autoCloseTime: "14:00:00",
                timezone: "Asia/Seoul",
              },
            }
          : {
              orderDate: "2026-08-18",
              closingBatchId: null,
              includedFromDate: "2026-08-17",
              includedToDate: "2026-08-18",
              orderDateCount: 2,
              orderCount: 3,
              branchStatuses: [],
              summary: {
                submittedBranchCount: 2,
                unsubmittedBranchNames: [],
                totalItemCount: 4,
                totalQuantity: 7,
                supplierCount: 2,
              },
              emailLogs: [],
            };

        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    render(createElement(AdminDashboard));

    expect(await screen.findByText("2026-08-17 ~ 2026-08-18")).toBeTruthy();
    expect(screen.getByText("누적 주문일 2일 · 주문서 3건")).toBeTruthy();
  });
});
