"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AdminStatus = {
  orderDate: string;
  branchStatuses: Array<{
    branchId: string;
    branchName: string;
    status: "not_submitted" | "submitted" | "closed";
    itemCount: number;
    totalQuantity: number;
  }>;
  summary: {
    submittedBranchCount: number;
    unsubmittedBranchNames: string[];
    totalItemCount: number;
    totalQuantity: number;
    supplierCount: number;
    unregisteredItemCount: number;
    unresolvedItemCount: number;
  };
};

type StatusResponse = AdminStatus & {
  error?: string;
};

const FOCUS_VISIBLE_CLASS =
  "focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

function todayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const date = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function formatBranchStatus(status: AdminStatus["branchStatuses"][number]["status"]): string {
  switch (status) {
    case "submitted":
      return "제출 완료";
    case "closed":
      return "마감 완료";
    default:
      return "미제출";
  }
}

function statusTone(status: AdminStatus["branchStatuses"][number]["status"]): string {
  switch (status) {
    case "submitted":
      return "bg-teal-100 text-teal-900";
    case "closed":
      return "bg-slate-200 text-slate-900";
    default:
      return "bg-amber-100 text-amber-900";
  }
}

export default function AdminDashboard() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionMode, setActionMode] = useState<"none" | "close" | "cancel">("none");
  const [actionPending, setActionPending] = useState(false);

  const orderDate = useMemo(() => todayYmd(), []);
  const isClosedDay = status?.branchStatuses.some((branch) => branch.status === "closed") ?? false;
  const hasSummaryData = (status?.summary.totalItemCount ?? 0) > 0;
  const canStartClose =
    Boolean(status) &&
    !loading &&
    !actionPending &&
    !isClosedDay &&
    hasSummaryData;
  const canConfirmClose =
    canStartClose &&
    (status?.summary.unresolvedItemCount ?? 0) === 0;
  const canStartCancel = Boolean(status) && !loading && !actionPending && isClosedDay;

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/status?date=${encodeURIComponent(orderDate)}`, {
        signal,
      });
      const data = (await response.json()) as StatusResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "관리자 현황을 불러오지 못했습니다.");
      }

      setStatus({
        orderDate: data.orderDate,
        branchStatuses: data.branchStatuses ?? [],
        summary: data.summary,
      });
    } catch (loadError) {
      if (signal?.aborted) {
        return;
      }

      setStatus(null);
      setError(
        loadError instanceof Error ? loadError.message : "관리자 현황을 불러오지 못했습니다.",
      );
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [orderDate]);

  useEffect(() => {
    const controller = new AbortController();

    loadStatus(controller.signal);

    return () => controller.abort();
  }, [loadStatus]);

  async function runAction(endpoint: "/api/admin/close" | "/api/admin/cancel-close") {
    setActionPending(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderDate }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
      }

      setNotice(
        endpoint === "/api/admin/close"
          ? "마감 처리가 완료되었습니다."
          : "마감 취소가 완료되었습니다.",
      );
      setActionMode("none");
      await loadStatus();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "요청을 처리하지 못했습니다.");
    } finally {
      setActionPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950">
      <section className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="rounded-lg bg-slate-900 px-5 py-6 text-white">
          <p className="m-0 text-sm font-semibold text-slate-200">본사 관리자</p>
          <h1 className="mt-2 text-3xl font-bold">일일 마감 현황</h1>
          <p className="mt-3 text-base text-slate-200">조회일 {orderDate}</p>
        </header>

        {notice ? (
          <p className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-base text-teal-900">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-800">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <p className="m-0 text-lg text-slate-700">관리자 현황을 불러오는 중입니다.</p>
          </div>
        ) : null}

        {!loading && !status ? (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <p className="m-0 text-lg text-slate-700">표시할 관리자 현황이 없습니다.</p>
          </div>
        ) : null}

        {!loading && status ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <p className="m-0 text-sm text-slate-600">제출 지점</p>
                <p className="mt-2 text-3xl font-bold">{status.summary.submittedBranchCount}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <p className="m-0 text-sm text-slate-600">미제출 지점</p>
                <p className="mt-2 text-3xl font-bold">
                  {status.summary.unsubmittedBranchNames.length}
                </p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <p className="m-0 text-sm text-slate-600">총 품목 수</p>
                <p className="mt-2 text-3xl font-bold">{status.summary.totalItemCount}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <p className="m-0 text-sm text-slate-600">총 수량</p>
                <p className="mt-2 text-3xl font-bold">{status.summary.totalQuantity}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <p className="m-0 text-sm text-slate-600">공급처 수</p>
                <p className="mt-2 text-3xl font-bold">{status.summary.supplierCount}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <p className="m-0 text-sm text-slate-600">미등록 품목</p>
                <p className="mt-2 text-3xl font-bold">{status.summary.unregisteredItemCount}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <p className="m-0 text-sm text-slate-600">공급처 미확정</p>
                <p className="mt-2 text-3xl font-bold">{status.summary.unresolvedItemCount}</p>
              </div>
            </div>

            <div className="rounded-lg bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  className={`min-h-14 flex-1 bg-red-700 px-5 py-4 text-lg font-bold text-white disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
                  disabled={!canStartClose}
                  type="button"
                  onClick={() => setActionMode("close")}
                >
                  {actionPending && actionMode === "close" ? "마감 처리 중..." : "마감 확인"}
                </button>
                <button
                  className={`min-h-14 flex-1 border border-slate-300 bg-white px-5 py-4 text-lg font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 ${FOCUS_VISIBLE_CLASS}`}
                  disabled={!canStartCancel}
                  type="button"
                  onClick={() => setActionMode("cancel")}
                >
                  {actionPending && actionMode === "cancel" ? "마감 취소 중..." : "마감 취소"}
                </button>
              </div>
              {!hasSummaryData ? (
                <p className="mt-3 text-sm text-slate-600">제출된 주문이 있어야 마감을 진행할 수 있습니다.</p>
              ) : null}
            </div>

            {actionMode === "close" ? (
              <div className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
                <h2 className="m-0 text-2xl font-bold text-red-800">오늘 주문 마감 전 확인</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    조회일: <strong>{status.orderDate}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    미제출 지점 수: <strong>{status.summary.unsubmittedBranchNames.length}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    총 품목 수: <strong>{status.summary.totalItemCount}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    총 수량: <strong>{status.summary.totalQuantity}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    공급처 수: <strong>{status.summary.supplierCount}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    공급처 미확정: <strong>{status.summary.unresolvedItemCount}</strong>
                  </p>
                </div>
                <div className="mt-4 rounded-lg bg-amber-50 px-4 py-4 text-base text-amber-900">
                  <p className="m-0 font-semibold">미제출 지점</p>
                  <p className="mt-2 m-0">
                    {status.summary.unsubmittedBranchNames.length > 0
                      ? status.summary.unsubmittedBranchNames.join(", ")
                      : "없음"}
                  </p>
                </div>
                {status.summary.unresolvedItemCount > 0 ? (
                  <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-800">
                    공급처가 비어 있는 상품이 있어 지금은 마감할 수 없습니다.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    className={`min-h-14 flex-1 border border-slate-300 bg-white px-5 py-4 text-lg font-bold disabled:bg-slate-100 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={actionPending}
                    type="button"
                    onClick={() => setActionMode("none")}
                  >
                    다시 보기
                  </button>
                  <button
                    className={`min-h-14 flex-1 bg-red-700 px-5 py-4 text-lg font-bold text-white disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={!canConfirmClose || actionPending}
                    type="button"
                    onClick={() => runAction("/api/admin/close")}
                  >
                    {actionPending ? "마감 처리 중..." : "이 내용으로 마감"}
                  </button>
                </div>
              </div>
            ) : null}

            {actionMode === "cancel" ? (
              <div className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm">
                <h2 className="m-0 text-2xl font-bold">마감 취소 확인</h2>
                <p className="mt-4 text-base text-slate-700">
                  {status.orderDate} 마감을 취소하면 닫힌 주문이 다시 제출 상태로 돌아갑니다.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    className={`min-h-14 flex-1 border border-slate-300 bg-white px-5 py-4 text-lg font-bold disabled:bg-slate-100 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={actionPending}
                    type="button"
                    onClick={() => setActionMode("none")}
                  >
                    유지하기
                  </button>
                  <button
                    className={`min-h-14 flex-1 bg-slate-900 px-5 py-4 text-lg font-bold text-white disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={actionPending}
                    type="button"
                    onClick={() => runAction("/api/admin/cancel-close")}
                  >
                    {actionPending ? "마감 취소 중..." : "마감 취소 진행"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-2xl font-bold">지점별 상태</h2>
                <button
                  className={`border border-slate-300 bg-white px-4 py-3 text-base font-semibold disabled:bg-slate-100 ${FOCUS_VISIBLE_CLASS}`}
                  disabled={loading || actionPending}
                  type="button"
                  onClick={() => {
                    void loadStatus();
                  }}
                >
                  새로고침
                </button>
              </div>
              {status.branchStatuses.length === 0 ? (
                <p className="mt-4 text-base text-slate-600">표시할 지점이 없습니다.</p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  {status.branchStatuses.map((branch) => (
                    <div
                      key={branch.branchId}
                      className="grid gap-3 border-b border-slate-200 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,2fr)_auto_auto_auto]"
                    >
                      <div>
                        <p className="m-0 text-lg font-semibold">{branch.branchName}</p>
                      </div>
                      <div>
                        <span
                          className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${statusTone(branch.status)}`}
                        >
                          {formatBranchStatus(branch.status)}
                        </span>
                      </div>
                      <p className="m-0 text-base text-slate-700">품목 {branch.itemCount}</p>
                      <p className="m-0 text-base text-slate-700">수량 {branch.totalQuantity}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
