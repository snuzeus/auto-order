"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";
import MasterDataPanel from "./MasterDataPanel";

type AdminStatus = {
  orderDate: string;
  branchStatuses: Array<{
    branchId: string;
    branchName: string;
    status: "not_submitted" | "submitted" | "closed";
    itemCount: number;
    totalQuantity: number;
    items: Array<{
      barcode: string;
      productCode?: string;
      productName: string;
      spec: string;
      supplierName?: string;
      quantity: number;
      isUnregistered: boolean;
      memo?: string;
    }>;
  }>;
  summary: {
    submittedBranchCount: number;
    unsubmittedBranchNames: string[];
    totalItemCount: number;
    totalQuantity: number;
    supplierCount: number;
  };
  emailLogs: Array<{
    id: string;
    supplier_name: string;
    email: string | null;
    status: "sent" | "skipped" | "failed";
    reason: string | null;
    provider_message_id: string | null;
    created_at: string;
  }>;
};

type StatusResponse = AdminStatus & {
  error?: string;
};

type ClosingMode = "manual" | "auto_14";

type ClosingSettingsResponse = {
  closingSettings?: {
    mode: ClosingMode;
    autoCloseTime: string;
    timezone: string;
  };
  error?: string;
};

type UploadValidationError = {
  rowNumber: number;
  reason: string;
};

type UploadResponse = {
  importedCount?: number;
  report?: {
    sheetName?: string;
    totalRows?: number;
    importedRows?: number;
    skippedRows?: number;
    replacedExisting?: boolean;
  };
  error?: string;
  errors?: UploadValidationError[];
};

const FOCUS_VISIBLE_CLASS =
  "focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

function todayYmd(): string {
  const now = new Date();
  return toYmd(now);
}

function yesterdayYmd(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);

  return toYmd(date);
}

function toYmd(dateValue: Date): string {
  const now = dateValue;
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const date = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function formatDateLabel(dateValue: string): string {
  const today = todayYmd();
  const yesterday = yesterdayYmd();

  if (dateValue === today) {
    return "오늘";
  }

  if (dateValue === yesterday) {
    return "어제";
  }

  return dateValue;
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
  const router = useRouter();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionMode, setActionMode] = useState<"none" | "close" | "cancel">("none");
  const [actionPending, setActionPending] = useState(false);
  const [closingMode, setClosingMode] = useState<ClosingMode>("manual");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsPending, setSettingsPending] = useState(false);
  const [isDatePanelOpen, setIsDatePanelOpen] = useState(false);
  const [isClosingPanelOpen, setIsClosingPanelOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadRowErrors, setUploadRowErrors] = useState<UploadValidationError[]>([]);
  const [expandedBranchId, setExpandedBranchId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const todayDate = useMemo(() => todayYmd(), []);
  const yesterdayDate = useMemo(() => yesterdayYmd(), []);
  const [orderDate, setOrderDate] = useState(todayDate);
  const isClosedDay = status?.branchStatuses.some((branch) => branch.status === "closed") ?? false;
  const hasSummaryData = (status?.summary.totalItemCount ?? 0) > 0;
  const isManualClosingMode = closingMode === "manual";
  const canStartClose =
    Boolean(status) &&
    !loading &&
    !settingsLoading &&
    !actionPending &&
    !isClosedDay &&
    hasSummaryData &&
    isManualClosingMode;
  const canStartCancel = Boolean(status) && !loading && !actionPending && isClosedDay;
  const canDownloadZip = Boolean(status) && !loading && isClosedDay;
  const downloadHref = `/api/admin/excel?date=${encodeURIComponent(orderDate)}`;

  const loadClosingSettings = useCallback(async (signal?: AbortSignal) => {
    setSettingsLoading(true);

    try {
      const response = await fetch("/api/admin/closing-settings", {
        signal,
      });
      const data = (await response.json()) as ClosingSettingsResponse;

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "마감 설정을 불러오지 못했습니다.");
      }

      setClosingMode(data.closingSettings?.mode ?? "manual");
    } catch (settingsError) {
      if (signal?.aborted) {
        return;
      }

      setError(settingsError instanceof Error ? settingsError.message : "마감 설정을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) {
        setSettingsLoading(false);
      }
    }
  }, [router]);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/status?date=${encodeURIComponent(orderDate)}`, {
        signal,
      });
      const data = (await response.json()) as StatusResponse;

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "관리자 현황을 불러오지 못했습니다.");
      }

      setStatus({
        orderDate: data.orderDate,
        branchStatuses: data.branchStatuses ?? [],
        summary: data.summary,
        emailLogs: data.emailLogs ?? [],
      });
    } catch (loadError) {
      if (signal?.aborted) {
        return;
      }

      setStatus(null);
      setError(loadError instanceof Error ? loadError.message : "관리자 현황을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [orderDate, router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  useEffect(() => {
    const controller = new AbortController();

    loadStatus(controller.signal);
    loadClosingSettings(controller.signal);

    return () => controller.abort();
  }, [loadClosingSettings, loadStatus]);

  function changeOrderDate(nextDate: string) {
    if (nextDate === orderDate || loading || actionPending) {
      return;
    }

    setOrderDate(nextDate);
    setStatus(null);
    setActionMode("none");
    setExpandedBranchId("");
    setNotice("");
    setError("");
  }

  async function updateClosingMode(nextMode: ClosingMode) {
    if (settingsPending || nextMode === closingMode) {
      return;
    }

    setSettingsPending(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/closing-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: nextMode }),
      });
      const data = (await response.json()) as ClosingSettingsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "마감 설정을 저장하지 못했습니다.");
      }

      setClosingMode(data.closingSettings?.mode ?? nextMode);
      setActionMode("none");
      setNotice(
        nextMode === "auto_14"
          ? "마감 방식이 오후 2시 자동 마감으로 저장되었습니다."
          : "마감 방식이 수동 마감으로 저장되었습니다.",
      );
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "마감 설정을 저장하지 못했습니다.");
    } finally {
      setSettingsPending(false);
    }
  }

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
      const data = (await response.json()) as {
        error?: string;
        emailResult?: {
          sent: number;
          skipped: Array<{ supplierName: string; reason: string }>;
          failed: Array<{ supplierName: string; email: string; reason: string }>;
        };
      };

      if (!response.ok) {
        throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
      }

      const emailSummary =
        endpoint === "/api/admin/close" && data.emailResult
          ? [
              ` 메일 발송: ${data.emailResult.sent}건, 제외: ${data.emailResult.skipped.length}건, 실패: ${data.emailResult.failed.length}건.`,
              data.emailResult.skipped.length > 0
                ? ` 제외: ${data.emailResult.skipped
                    .map((item) => `${item.supplierName}(${item.reason})`)
                    .join(", ")}.`
                : "",
              data.emailResult.failed.length > 0
                ? ` 실패: ${data.emailResult.failed
                    .map((item) => `${item.supplierName}(${item.reason})`)
                    .join(", ")}.`
                : "",
            ].join("")
          : "";

      setNotice(
        endpoint === "/api/admin/close"
          ? `마감 처리가 완료되었습니다.${emailSummary}`
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    setUploadFile(nextFile);
    setUploadError("");
    setUploadNotice("");
    setUploadRowErrors([]);
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!uploadFile) {
      setUploadError("업로드할 엑셀 파일을 선택해 주세요.");
      setUploadNotice("");
      setUploadRowErrors([]);
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadFile);

    setUploadPending(true);
    setUploadError("");
    setUploadNotice("");
    setUploadRowErrors([]);

    try {
      const response = await fetch("/api/admin/products/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadResponse;

      if (!response.ok) {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setUploadRowErrors(data.errors);
          throw new Error("행별 오류를 확인해 주세요.");
        }

        throw new Error(data.error ?? "상품 마스터 업로드에 실패했습니다.");
      }

      setUploadNotice(
        `${data.importedCount ?? 0}건의 상품 마스터를 반영했습니다.` +
          (data.report
            ? ` 시트: ${data.report.sheetName ?? "-"}, 읽은 행: ${data.report.totalRows ?? 0}, 건너뜀: ${data.report.skippedRows ?? 0}.`
            : ""),
      );
      setUploadFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadRequestError) {
      setUploadError(
        uploadRequestError instanceof Error
          ? uploadRequestError.message
          : "상품 마스터 업로드에 실패했습니다.",
      );
    } finally {
      setUploadPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-3 text-slate-950 sm:px-4 sm:py-5">
      <section className="mx-auto flex max-w-6xl flex-col gap-3 sm:gap-4">
        <header className="rounded-lg bg-slate-900 px-4 py-5 text-white sm:px-5 sm:py-6">
          <p className="m-0 text-sm font-semibold text-slate-200">본사 관리자</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">일일 마감 현황</h1>
          <p className="mt-2 text-sm text-slate-200 sm:mt-3 sm:text-base">
            조회일 {orderDate} ({formatDateLabel(orderDate)})
          </p>
          <button
            className={`mt-4 min-h-11 border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white ${FOCUS_VISIBLE_CLASS}`}
            type="button"
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <button
            aria-expanded={isDatePanelOpen}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left ${FOCUS_VISIBLE_CLASS}`}
            type="button"
            onClick={() => setIsDatePanelOpen((current) => !current)}
          >
            <div>
              <h2 className="m-0 text-xl font-bold sm:text-2xl">조회일 선택</h2>
              <p className="mt-1 text-sm text-slate-600">
                현재 {formatDateLabel(orderDate)} {orderDate}
              </p>
            </div>
            <span className="text-sm font-bold text-slate-600">
              {isDatePanelOpen ? "접기" : "열기"}
            </span>
          </button>

          {isDatePanelOpen ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <p className="m-0 text-sm text-slate-600">
                오늘과 어제 주문 현황을 확인하고, 마감된 날짜는 공급처 ZIP을 다시 다운로드할 수 있습니다.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                aria-pressed={orderDate === todayDate}
                className={`min-h-12 rounded-lg border px-4 py-3 text-base font-bold ${FOCUS_VISIBLE_CLASS} ${
                  orderDate === todayDate
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-slate-50 text-slate-900 hover:bg-white"
                }`}
                disabled={loading || actionPending}
                type="button"
                onClick={() => changeOrderDate(todayDate)}
              >
                오늘
              </button>
              <button
                aria-pressed={orderDate === yesterdayDate}
                className={`min-h-12 rounded-lg border px-4 py-3 text-base font-bold ${FOCUS_VISIBLE_CLASS} ${
                  orderDate === yesterdayDate
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-slate-50 text-slate-900 hover:bg-white"
                }`}
                disabled={loading || actionPending}
                type="button"
                onClick={() => changeOrderDate(yesterdayDate)}
              >
                어제
              </button>
              </div>
            </div>
          ) : null}
        </section>

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

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <button
            aria-expanded={isClosingPanelOpen}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left ${FOCUS_VISIBLE_CLASS}`}
            type="button"
            onClick={() => setIsClosingPanelOpen((current) => !current)}
          >
            <div>
              <h2 className="m-0 text-xl font-bold sm:text-2xl">마감 방식</h2>
              <p className="mt-1 text-sm text-slate-600">
                현재 {closingMode === "auto_14" ? "오후 2시 자동 마감" : "수동 마감"}
              </p>
            </div>
            <span className="text-sm font-bold text-slate-600">
              {isClosingPanelOpen ? "접기" : "열기"}
            </span>
          </button>

          {isClosingPanelOpen ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <p className="m-0 text-sm text-slate-600">
                자동 마감은 매일 오후 2시 기준으로 실행되고, 수동 마감은 관리자가 직접 마감합니다.
              </p>
              {settingsLoading ? (
                <p className="mt-2 text-sm text-slate-600">설정을 불러오는 중입니다.</p>
              ) : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
            <button
              aria-pressed={closingMode === "auto_14"}
              className={`min-h-20 rounded-lg border px-4 py-4 text-left ${FOCUS_VISIBLE_CLASS} ${
                closingMode === "auto_14"
                  ? "border-2 border-teal-600 bg-teal-50 text-teal-950"
                  : "border border-slate-300 bg-slate-50 text-slate-900 hover:bg-white"
              }`}
              disabled={settingsLoading || settingsPending}
              type="button"
              onClick={() => updateClosingMode("auto_14")}
            >
              <span className="block text-lg font-bold">오후 2시 자동 마감</span>
              <span className="mt-2 block text-sm">
                매일 14:00에 제출된 주문을 자동으로 마감합니다.
              </span>
            </button>
            <button
              aria-pressed={closingMode === "manual"}
              className={`min-h-20 rounded-lg border px-4 py-4 text-left ${FOCUS_VISIBLE_CLASS} ${
                closingMode === "manual"
                  ? "border-2 border-slate-900 bg-slate-50 text-slate-950"
                  : "border border-slate-300 bg-slate-50 text-slate-900 hover:bg-white"
              }`}
              disabled={settingsLoading || settingsPending}
              type="button"
              onClick={() => updateClosingMode("manual")}
            >
              <span className="block text-lg font-bold">수동 마감</span>
              <span className="mt-2 block text-sm">
                관리자가 확인 후 직접 마감 버튼을 눌러 마감합니다.
              </span>
            </button>
              </div>
              {settingsPending ? (
                <p className="mt-3 text-sm text-slate-600">마감 방식을 저장하는 중입니다.</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <MasterDataPanel />

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="m-0 text-2xl font-bold">상품 마스터 업로드</h2>
              <p className="mt-2 text-sm text-slate-600">
                엑셀 파일로 상품 바코드, 상품명, 거래처, 단가를 한 번에 반영합니다.
              </p>
            </div>
            {uploadFile ? (
              <p className="m-0 text-sm text-slate-600">선택한 파일: {uploadFile.name}</p>
            ) : null}
          </div>

          <form className="mt-4 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handleUploadSubmit}>
            <div className="flex-1">
              <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="product-master-file">
                업로드 파일
              </label>
              <input
                ref={fileInputRef}
                accept=".xlsx,.xlsm,.xls"
                className={`block w-full rounded-lg border-2 border-slate-400 bg-slate-50 px-3 py-3 text-sm text-slate-900 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 ${FOCUS_VISIBLE_CLASS}`}
                disabled={uploadPending}
                id="product-master-file"
                name="file"
                type="file"
                onChange={handleFileChange}
              />
            </div>
            <button
              className={`min-h-12 rounded-lg bg-slate-900 px-5 py-3 text-base font-bold text-white shadow-sm disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
              disabled={uploadPending || !uploadFile}
              type="submit"
            >
              {uploadPending ? "업로드 중..." : "상품 마스터 반영"}
            </button>
          </form>

          {uploadNotice ? (
            <p className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
              {uploadNotice}
            </p>
          ) : null}
          {uploadError ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {uploadError}
            </p>
          ) : null}
          {uploadRowErrors.length > 0 ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
              <h3 className="m-0 text-base font-semibold">업로드 오류</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {uploadRowErrors.map((rowError) => (
                  <li key={`${rowError.rowNumber}-${rowError.reason}`}>
                    {rowError.rowNumber}행: {rowError.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {loading ? (
          <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
            <p className="m-0 text-lg text-slate-700">관리자 현황을 불러오는 중입니다.</p>
          </div>
        ) : null}

        {!loading && !status ? (
          <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
            <p className="m-0 text-lg text-slate-700">표시할 관리자 현황이 없습니다.</p>
          </div>
        ) : null}

        {!loading && status ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="m-0 text-sm text-slate-600">제출 지점</p>
                <p className="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">
                  {status.summary.submittedBranchCount}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="m-0 text-sm text-slate-600">미제출 지점</p>
                <p className="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">
                  {status.summary.unsubmittedBranchNames.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="m-0 text-sm text-slate-600">총 품목 수</p>
                <p className="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">
                  {status.summary.totalItemCount}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="m-0 text-sm text-slate-600">총 수량</p>
                <p className="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">
                  {status.summary.totalQuantity}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:gap-3 md:grid-cols-1">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="m-0 text-sm text-slate-600">공급처 수</p>
                <p className="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">
                  {status.summary.supplierCount}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                <button
                  className={`min-h-12 bg-red-700 px-4 py-3 text-base font-bold text-white disabled:bg-slate-300 sm:min-h-14 sm:px-5 sm:py-4 sm:text-lg ${FOCUS_VISIBLE_CLASS}`}
                  disabled={!canStartClose}
                  type="button"
                  onClick={() => setActionMode("close")}
                >
                  {actionPending && actionMode === "close" ? "마감 처리 중..." : "마감 확인"}
                </button>
                <button
                  className={`min-h-12 border-2 border-slate-400 bg-white px-4 py-3 text-base font-bold text-slate-900 shadow-sm disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:min-h-14 sm:px-5 sm:py-4 sm:text-lg ${FOCUS_VISIBLE_CLASS}`}
                  disabled={!canStartCancel}
                  type="button"
                  onClick={() => setActionMode("cancel")}
                >
                  {actionPending && actionMode === "cancel" ? "마감 취소 중..." : "마감 취소"}
                </button>
                {canDownloadZip ? (
                  <a
                    className={`flex min-h-12 items-center justify-center border-2 border-slate-400 bg-white px-4 py-3 text-center text-base font-bold text-slate-900 shadow-sm sm:min-h-14 sm:px-5 sm:py-4 sm:text-lg ${FOCUS_VISIBLE_CLASS}`}
                    href={downloadHref}
                  >
                    공급처 ZIP 다운로드
                  </a>
                ) : (
                  <button
                    aria-disabled="true"
                    className={`min-h-12 border border-slate-200 bg-slate-100 px-4 py-3 text-base font-bold text-slate-400 sm:min-h-14 sm:px-5 sm:py-4 sm:text-lg ${FOCUS_VISIBLE_CLASS}`}
                    disabled
                    type="button"
                  >
                    공급처 ZIP 다운로드
                  </button>
                )}
              </div>
              {!hasSummaryData ? (
                <p className="mt-3 text-sm text-slate-600">
                  제출된 주문이 없어 마감을 진행할 수 없습니다.
                </p>
              ) : null}
              {!isManualClosingMode ? (
                <p className="mt-3 text-sm text-slate-600">
                  현재 오후 2시 자동 마감 모드입니다. 수동 마감은 마감 방식을 수동 마감으로 바꾼 뒤 사용할 수 있습니다.
                </p>
              ) : null}
              {!isClosedDay ? (
                <p className="mt-3 text-sm text-slate-600">
                  공급처 ZIP은 마감이 완료된 뒤에 다운로드할 수 있습니다.
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-xl font-bold sm:text-2xl">메일 발송 이력</h2>
                <p className="m-0 text-sm text-slate-600">최근 {status.emailLogs.length}건</p>
              </div>
              {status.emailLogs.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">아직 발송 이력이 없습니다.</p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  {status.emailLogs.map((log) => (
                    <div
                      key={log.id}
                      className="grid gap-2 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto]"
                    >
                      <div>
                        <p className="m-0 font-semibold">{log.supplier_name}</p>
                        <p className="m-0 mt-1 text-slate-600">{log.email ?? "-"}</p>
                      </div>
                      <div>
                        <p className="m-0 text-slate-600">
                          {new Date(log.created_at).toLocaleString("ko-KR")}
                        </p>
                        {log.reason ? <p className="m-0 mt-1 text-red-700">{log.reason}</p> : null}
                      </div>
                      <span
                        className={`inline-flex min-h-8 items-center justify-center rounded-full px-3 text-xs font-bold ${
                          log.status === "sent"
                            ? "bg-teal-100 text-teal-900"
                            : log.status === "skipped"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.status === "sent" ? "발송" : log.status === "skipped" ? "제외" : "실패"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {actionMode === "close" ? (
              <div className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
                <h2 className="m-0 text-2xl font-bold text-red-800">오늘 주문 마감 전 확인</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    조회일 <strong>{status.orderDate}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    미제출 지점 수 <strong>{status.summary.unsubmittedBranchNames.length}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    총 품목 수 <strong>{status.summary.totalItemCount}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    총 수량 <strong>{status.summary.totalQuantity}</strong>
                  </p>
                  <p className="m-0 rounded-lg bg-slate-50 px-4 py-3 text-base">
                    공급처 수 <strong>{status.summary.supplierCount}</strong>
                  </p>
                </div>
                <div className="mt-4 rounded-lg bg-amber-50 px-4 py-4 text-base text-amber-900">
                  <p className="m-0 font-semibold">미제출 지점</p>
                  <p className="m-0 mt-2">
                    {status.summary.unsubmittedBranchNames.length > 0
                      ? status.summary.unsubmittedBranchNames.join(", ")
                      : "없음"}
                  </p>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    className={`min-h-14 flex-1 border-2 border-slate-400 bg-white px-5 py-4 text-lg font-bold shadow-sm disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={actionPending}
                    type="button"
                    onClick={() => setActionMode("none")}
                  >
                    다시 보기
                  </button>
                  <button
                    className={`min-h-14 flex-1 bg-red-700 px-5 py-4 text-lg font-bold text-white disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={!canStartClose || actionPending}
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
                  {status.orderDate} 마감을 취소하면 지점 주문이 다시 제출 상태로 돌아갑니다.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    className={`min-h-14 flex-1 border-2 border-slate-400 bg-white px-5 py-4 text-lg font-bold shadow-sm disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${FOCUS_VISIBLE_CLASS}`}
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

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-xl font-bold sm:text-2xl">지점별 상태</h2>
                <button
                  className={`rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-sm font-semibold shadow-sm disabled:border-slate-200 disabled:bg-slate-100 sm:px-4 sm:py-3 sm:text-base ${FOCUS_VISIBLE_CLASS}`}
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
                  {status.branchStatuses.map((branch) => {
                    const isExpanded = expandedBranchId === branch.branchId;

                    return (
                      <div key={branch.branchId} className="border-b border-slate-200 last:border-b-0">
                        <button
                          aria-expanded={isExpanded}
                          className={`grid w-full gap-2 px-3 py-3 text-left hover:bg-slate-50 sm:gap-3 sm:px-4 sm:py-4 md:grid-cols-[minmax(0,2fr)_auto_auto_auto] ${FOCUS_VISIBLE_CLASS}`}
                          type="button"
                          onClick={() =>
                            setExpandedBranchId((current) =>
                              current === branch.branchId ? "" : branch.branchId,
                            )
                          }
                        >
                          <div>
                            <p className="m-0 text-base font-semibold sm:text-lg">{branch.branchName}</p>
                            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                              {isExpanded ? "상세 닫기" : "주문 상세 보기"}
                            </p>
                          </div>
                          <div>
                            <span
                              className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold sm:min-h-10 sm:px-4 sm:text-sm ${statusTone(branch.status)}`}
                            >
                              {formatBranchStatus(branch.status)}
                            </span>
                          </div>
                          <p className="m-0 text-sm text-slate-700 sm:text-base">품목 {branch.itemCount}</p>
                          <p className="m-0 text-sm text-slate-700 sm:text-base">수량 {branch.totalQuantity}</p>
                        </button>

                        {isExpanded ? (
                          <div className="bg-slate-50 px-3 py-3 sm:px-4 sm:py-4">
                            {branch.items.length === 0 ? (
                              <p className="m-0 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                                제출된 주문 품목이 없습니다.
                              </p>
                            ) : (
                              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                {branch.items.map((item) => (
                                  <div
                                    key={`${branch.branchId}-${item.barcode}-${item.productName}`}
                                    className="grid gap-2 border-b border-slate-200 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,2fr)_1fr_auto]"
                                  >
                                    <div>
                                     <p className="m-0 text-base font-semibold">{item.productName}</p>
                                     <p className="mt-1 text-sm text-slate-600">
                                        등록 상품
                                     </p>
                                      {item.memo ? (
                                        <p className="mt-1 text-sm text-slate-600">메모: {item.memo}</p>
                                      ) : null}
                                    </div>
                                    <div className="text-sm text-slate-600">
                                      <p className="m-0">바코드 {item.barcode}</p>
                                      <p className="m-0 mt-1">공급처 {item.supplierName ?? "-"}</p>
                                    </div>
                                    <p className="m-0 text-right text-xl font-bold">{item.quantity}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
