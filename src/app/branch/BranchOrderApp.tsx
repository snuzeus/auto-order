"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  hasDraftDifferences,
  restoreBranchDraft,
  shouldPersistBranchDraft,
} from "@/lib/domain/branch-order-draft";
import { upsertOrderItem } from "@/lib/domain/branch-order-state";
import { calculateOrderTotals } from "@/lib/domain/order-totals";
import type { Branch, OrderItemDraft, OrderStatus, Product } from "@/lib/types";

import BarcodeScannerButton from "./BarcodeScannerButton";

type BranchResponse = {
  branches?: Branch[];
  error?: string;
};

type ProductSearchResponse = {
  products?: Product[];
  error?: string;
};

type OrderResponse = {
  order?: {
    id: string;
    status: OrderStatus;
    branchId: string;
    orderDate: string;
    items: OrderItemDraft[];
  } | null;
  error?: string;
};

const BRANCH_STORAGE_KEY = "auto-order-branch-id";
const FOCUS_VISIBLE_CLASS =
  "focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

function todayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const date = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function draftStorageKey(branchId: string, orderDate: string): string {
  return `auto-order-branch-draft:${branchId}:${orderDate}`;
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function calculateLineAmount(item: OrderItemDraft): number | undefined {
  if (item.unitPrice === undefined || !Number.isFinite(item.unitPrice)) {
    return undefined;
  }

  return item.unitPrice * item.quantity;
}

function hasActiveItems(items: OrderItemDraft[]): boolean {
  return items.some((item) => item.quantity > 0);
}

export default function BranchOrderApp() {
  const orderDate = todayYmd();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [items, setItems] = useState<OrderItemDraft[]>([]);
  const [syncedItems, setSyncedItems] = useState<OrderItemDraft[]>([]);
  const [orderStatus, setOrderStatus] = useState<"not_submitted" | OrderStatus>("not_submitted");
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchTouched, setSearchTouched] = useState(false);
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const submitRequestIdRef = useRef(0);
  const contextRef = useRef({ branchId: "", orderDate });

  useEffect(() => {
    contextRef.current = {
      branchId: selectedBranchId,
      orderDate,
    };
  }, [orderDate, selectedBranchId]);

  useEffect(() => {
    const storedBranchId = window.localStorage.getItem(BRANCH_STORAGE_KEY) ?? "";

    if (storedBranchId) {
      setSelectedBranchId(storedBranchId);
    }

    const controller = new AbortController();

    async function loadBranches() {
      setBranchesLoading(true);
      setBranchesError("");

      try {
        const response = await fetch("/api/branches", {
          signal: controller.signal,
        });
        const data = (await response.json()) as BranchResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "지사 목록을 불러오지 못했습니다.");
        }

        setBranches(data.branches ?? []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setBranchesError(
          error instanceof Error ? error.message : "지사 목록을 불러오지 못했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setBranchesLoading(false);
        }
      }
    }

    loadBranches();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedBranchId) {
      setItems([]);
      setSyncedItems([]);
      setOrderStatus("not_submitted");
      setOrderError("");
      return;
    }

    const controller = new AbortController();

    async function loadOrder() {
      setOrderLoading(true);
      setOrderError("");
      setSubmitNotice("");

      try {
        const response = await fetch(
          `/api/orders?branchId=${encodeURIComponent(selectedBranchId)}&orderDate=${encodeURIComponent(orderDate)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as OrderResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "주문 정보를 불러오지 못했습니다.");
        }

        const serverItems = data.order?.items ?? [];
        const nextOrderStatus = data.order?.status ?? "not_submitted";
        const storageKey = draftStorageKey(selectedBranchId, orderDate);
        const restoredDraft = restoreBranchDraft(
          window.localStorage.getItem(storageKey),
          serverItems,
        );
        const useRestoredDraft = shouldPersistBranchDraft({
          items: restoredDraft.items,
          syncedItems: serverItems,
          orderStatus: nextOrderStatus,
        });

        setSyncedItems(serverItems);
        setOrderStatus(nextOrderStatus);

        if (restoredDraft.shouldClearStorage || !useRestoredDraft) {
          window.localStorage.removeItem(storageKey);
        }

        setItems(useRestoredDraft ? restoredDraft.items : serverItems);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setOrderError(
          error instanceof Error ? error.message : "주문 정보를 불러오지 못했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setOrderLoading(false);
        }
      }
    }

    loadOrder();

    return () => controller.abort();
  }, [orderDate, selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }

    const storageKey = draftStorageKey(selectedBranchId, orderDate);
    const shouldPersist = shouldPersistBranchDraft({
      items,
      syncedItems,
      orderStatus,
    });

    if (shouldPersist) {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
      return;
    }

    window.localStorage.removeItem(storageKey);
  }, [items, orderDate, orderStatus, selectedBranchId, syncedItems]);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();

    async function searchProducts() {
      setSearchLoading(true);
      setSearchError("");

      try {
        const response = await fetch(
          `/api/products/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as ProductSearchResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "상품 검색에 실패했습니다.");
        }

        setSearchResults(data.products ?? []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setSearchError(
          error instanceof Error ? error.message : "상품 검색에 실패했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }

    searchProducts();

    return () => controller.abort();
  }, [query]);

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const totals = useMemo(() => calculateOrderTotals(items), [items]);
  const hasPendingDraft = hasActiveItems(items);
  const isDirty = hasDraftDifferences(items, syncedItems);
  const isClosed = orderStatus === "closed";
  const canSubmit =
    Boolean(selectedBranchId) &&
    hasPendingDraft &&
    isDirty &&
    !submitPending &&
    !isClosed &&
    !orderLoading;
  function resetEntryFields() {
    setQuery("");
    setSearchResults([]);
    setSearchTouched(false);
    setProductQuantities({});
  }

  function handleBranchChange(nextBranchId: string) {
    if (submitPending || nextBranchId === selectedBranchId) {
      return;
    }

    if (hasPendingDraft && isDirty) {
      const confirmed = window.confirm(
        "아직 제출하지 않은 주문 항목이 있습니다. 지사를 변경할까요?",
      );

      if (!confirmed) {
        return;
      }
    }

    setItems([]);
    setSyncedItems([]);
    setOrderStatus("not_submitted");
    setOrderError("");
    setSubmitError("");
    setSubmitNotice("");
    setConfirmingSubmit(false);
    resetEntryFields();
    setSelectedBranchId(nextBranchId);
    window.localStorage.setItem(BRANCH_STORAGE_KEY, nextBranchId);
  }

  function addRegisteredProduct(product: Product) {
    const quantity = Math.max(1, Math.floor(productQuantities[product.id] ?? 1));
    const nextItem: OrderItemDraft = {
      productId: product.id,
      barcode: product.barcode,
      productCode: product.productCode,
      productName: product.name,
      spec: product.spec,
      supplierName: product.supplierName,
      unitPrice: product.unitPrice,
      quantity,
      isUnregistered: false,
    };

    setItems((currentItems) => upsertOrderItem(currentItems, nextItem));
    setSubmitError("");
    setSubmitNotice("");
  }

  function handleBarcodeDetected(barcode: string) {
    setQuery(barcode);
    setSearchTouched(true);
    setSubmitError("");
  }

  function updateItemQuantity(barcode: string, quantity: number) {
    const item = items.find((entry) => entry.barcode === barcode);

    if (!item) {
      return;
    }

    setItems((currentItems) =>
      upsertOrderItem(currentItems, {
        ...item,
        quantity: Math.max(0, Math.floor(quantity)),
      }),
    );
    setSubmitError("");
    setSubmitNotice("");
  }

  async function submitOrder() {
    if (!selectedBranchId) {
      setSubmitError("먼저 지사를 선택해 주세요.");
      return;
    }

    const submitBranchId = selectedBranchId;
    const submitOrderDate = orderDate;
    const requestId = submitRequestIdRef.current + 1;
    submitRequestIdRef.current = requestId;

    setSubmitPending(true);
    setSubmitError("");
    setSubmitNotice("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId: submitBranchId,
          orderDate: submitOrderDate,
          items,
        }),
      });

      const data = (await response.json()) as OrderResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "주문 제출에 실패했습니다.");
      }

      const isStaleResponse =
        submitRequestIdRef.current !== requestId ||
        contextRef.current.branchId !== submitBranchId ||
        contextRef.current.orderDate !== submitOrderDate;

      if (isStaleResponse) {
        return;
      }

      const submittedItems = data.order?.items ?? items.filter((item) => item.quantity > 0);
      setItems(submittedItems);
      setSyncedItems(submittedItems);
      setOrderStatus(data.order?.status ?? "submitted");
      setConfirmingSubmit(false);
      setSubmitNotice("주문이 제출되었습니다.");
      window.localStorage.removeItem(draftStorageKey(submitBranchId, submitOrderDate));
    } catch (error) {
      const isLatestRequest = submitRequestIdRef.current === requestId;

      if (!isLatestRequest) {
        return;
      }

      setSubmitError(
        error instanceof Error ? error.message : "주문 제출에 실패했습니다.",
      );
    } finally {
      if (submitRequestIdRef.current === requestId) {
        setSubmitPending(false);
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="rounded-lg bg-teal-700 px-5 py-6 text-white">
          <p className="m-0 text-sm font-semibold">지사 주문 PWA</p>
          <h1 className="mt-2 text-3xl font-bold">오늘 주문 입력</h1>
          <p className="mt-3 text-base text-teal-50">주문일 {orderDate}</p>
          <p className="mt-2 text-xl font-semibold">
            {selectedBranch ? selectedBranch.name : "지사를 선택해 주세요"}
          </p>
          <p className="mt-2 text-sm text-teal-50">
            상태:{" "}
            {orderStatus === "closed"
              ? "마감됨"
              : orderStatus === "submitted"
                ? "제출됨"
                : "미제출"}
          </p>
        </header>

        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-5 shadow-sm">
          <label className="mb-2 block text-base font-semibold" htmlFor="branch-select">
            지사 선택
          </label>
          <select
            id="branch-select"
            className={`w-full rounded-lg border-2 border-teal-400 bg-white px-4 py-4 text-lg shadow-sm disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 ${FOCUS_VISIBLE_CLASS}`}
            disabled={branchesLoading || submitPending}
            value={selectedBranchId}
            onChange={(event) => handleBranchChange(event.target.value)}
          >
            <option value="">지사를 선택해 주세요</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {branchesLoading ? (
            <p className="mt-3 text-sm text-slate-600">지사 목록을 불러오는 중입니다.</p>
          ) : null}
          {!branchesLoading && branches.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">활성 지사가 없습니다.</p>
          ) : null}
          {branchesError ? <p className="mt-3 text-sm text-red-700">{branchesError}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="m-0 text-sm text-slate-600">상품 줄 수</p>
            <p className="mt-2 text-3xl font-bold">{totals.lineItemCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="m-0 text-sm text-slate-600">총 수량</p>
            <p className="mt-2 text-3xl font-bold">{totals.totalQuantity}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="m-0 text-sm text-slate-600">합계 금액</p>
            <p className="mt-2 text-3xl font-bold">{formatCurrency(totals.totalAmount)}</p>
          </div>
        </div>

        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-5 shadow-sm">
          <label className="mb-2 block text-base font-semibold" htmlFor="product-search">
            바코드 또는 상품명 검색
          </label>
          <input
            id="product-search"
            className={`w-full rounded-lg border-2 border-teal-400 bg-white px-4 py-4 text-lg shadow-sm placeholder:text-slate-400 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 ${FOCUS_VISIBLE_CLASS}`}
            disabled={!selectedBranchId || isClosed}
            placeholder="예: 8801234567890 또는 생수"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchTouched(true);
              setSubmitError("");
            }}
          />
          <div className="mt-3 sm:hidden">
            <BarcodeScannerButton
              disabled={!selectedBranchId || isClosed}
              onDetected={handleBarcodeDetected}
            />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            등록된 상품만 주문할 수 있습니다. 상품이 보이지 않으면 본사에 상품 등록을 요청해 주세요.
          </p>
          {isClosed ? (
            <p className="mt-3 text-sm text-red-700">이미 마감된 주문은 수정할 수 없습니다.</p>
          ) : null}
          {orderLoading ? (
            <p className="mt-3 text-sm text-slate-600">기존 주문을 불러오는 중입니다.</p>
          ) : null}
          {orderError ? <p className="mt-3 text-sm text-red-700">{orderError}</p> : null}
          {searchLoading ? (
            <p className="mt-3 text-sm text-slate-600">상품을 찾는 중입니다.</p>
          ) : null}
          {searchError ? <p className="mt-3 text-sm text-red-700">{searchError}</p> : null}

          {searchResults.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {searchResults.map((product) => (
                <div key={product.id} className="rounded-lg border border-teal-200 bg-white p-4 shadow-sm">
                  <p className="m-0 text-lg font-semibold">{product.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    바코드 {product.barcode} · 규격 {product.spec || "-"} · 납품처 {product.supplierName}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    상품코드 {product.productCode} · 공급가 {formatCurrency(product.unitPrice)}
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="text-sm font-medium" htmlFor={`qty-${product.id}`}>
                      수량
                    </label>
                    <input
                      id={`qty-${product.id}`}
                      className={`w-full rounded-lg border-2 border-teal-400 bg-white px-4 py-3 text-lg shadow-sm sm:w-28 ${FOCUS_VISIBLE_CLASS}`}
                      inputMode="numeric"
                      min={1}
                      step={1}
                      type="number"
                      value={productQuantities[product.id] ?? 1}
                      onChange={(event) =>
                        setProductQuantities((current) => ({
                          ...current,
                          [product.id]: Number(event.target.value) || 1,
                        }))
                      }
                    />
                    <button
                      className={`w-full rounded-lg bg-teal-700 px-5 py-4 text-lg font-semibold text-white shadow-sm disabled:bg-slate-300 sm:w-auto ${FOCUS_VISIBLE_CLASS}`}
                      disabled={!selectedBranchId || isClosed}
                      type="button"
                      onClick={() => addRegisteredProduct(product)}
                    >
                      상품 추가
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {searchTouched &&
          query.trim() !== "" &&
          !searchLoading &&
          !searchError &&
          searchResults.length === 0 ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              등록된 상품을 찾지 못했습니다. 본사 관리자에게 상품 등록을 요청해 주세요.
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="m-0 text-xl font-bold">주문 목록</h2>
          {!hasActiveItems(items) ? (
            <p className="mt-3 text-slate-600">아직 담은 상품이 없습니다.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {items
                .filter((item) => item.quantity > 0)
                .map((item) => (
                  <div key={item.barcode} className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto_1fr] sm:items-center">
                        <div>
                          <p className="m-0 text-xs font-semibold text-slate-500">상품코드</p>
                          <p className="m-0 mt-1 break-words text-base font-semibold">
                            {item.productCode || item.barcode}
                          </p>
                        </div>
                        <div>
                          <p className="m-0 text-xs font-semibold text-slate-500">상품명</p>
                          <p className="m-0 mt-1 text-base font-semibold">{item.productName}</p>
                          <p className="m-0 mt-1 text-xs text-slate-500">{item.spec || "규격 없음"}</p>
                        </div>
                        <div>
                          <p className="m-0 text-xs font-semibold text-slate-500">공급가</p>
                          <p className="m-0 mt-1 text-base font-semibold">
                            {formatCurrency(item.unitPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="m-0 text-xs font-semibold text-slate-500">수량</p>
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              aria-label={`${item.productName} 수량 줄이기`}
                              className={`min-h-12 min-w-12 rounded-lg border-2 border-slate-400 bg-white px-4 py-3 text-xl font-bold shadow-sm disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${FOCUS_VISIBLE_CLASS}`}
                              disabled={isClosed}
                              type="button"
                              onClick={() => updateItemQuantity(item.barcode, item.quantity - 1)}
                            >
                              -
                            </button>
                            <span className="min-w-10 text-center text-2xl font-bold">
                              {item.quantity}
                            </span>
                            <button
                              aria-label={`${item.productName} 수량 늘리기`}
                              className={`min-h-12 min-w-12 rounded-lg border-2 border-slate-900 bg-slate-900 px-4 py-3 text-xl font-bold text-white shadow-sm disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${FOCUS_VISIBLE_CLASS}`}
                              disabled={isClosed}
                              type="button"
                              onClick={() => updateItemQuantity(item.barcode, item.quantity + 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="m-0 text-xs font-semibold text-slate-500">금액</p>
                          <p className="m-0 mt-1 text-base font-bold">
                            {formatCurrency(calculateLineAmount(item))}
                          </p>
                        </div>
                      </div>
                  </div>
                ))}
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-4 text-right">
                <p className="m-0 text-sm font-semibold text-teal-900">합계 금액</p>
                <p className="m-0 mt-1 text-2xl font-bold text-teal-950">
                  {formatCurrency(totals.totalAmount)}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {submitError ? <p className="m-0 text-red-700">{submitError}</p> : null}
          {submitNotice ? <p className="m-0 text-teal-700">{submitNotice}</p> : null}

          {confirmingSubmit ? (
            <div className="flex flex-col gap-3">
              <h2 className="m-0 text-xl font-bold">제출 전 최종 확인</h2>
              <p className="m-0 text-slate-700">
                지사: {selectedBranch?.name ?? "-"} / 상품 {totals.lineItemCount}종 / 총 수량{" "}
                {totals.totalQuantity} / 합계 금액 {formatCurrency(totals.totalAmount)}
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {items
                  .filter((item) => item.quantity > 0)
                  .map((item) => (
                    <div
                      key={`${item.barcode}-confirm`}
                      className="grid gap-2 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_2fr_1fr_0.8fr_1fr]"
                    >
                      <div>
                        <p className="m-0 text-xs font-semibold text-slate-500">상품코드</p>
                        <p className="m-0 mt-1 break-words text-sm font-semibold">
                          {item.productCode || item.barcode}
                        </p>
                      </div>
                      <div>
                        <p className="m-0 text-xs font-semibold text-slate-500">상품명</p>
                        <p className="m-0 mt-1 text-sm font-semibold">{item.productName}</p>
                      </div>
                      <div>
                        <p className="m-0 text-xs font-semibold text-slate-500">공급가</p>
                        <p className="m-0 mt-1 text-sm font-semibold">
                          {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <div>
                        <p className="m-0 text-xs font-semibold text-slate-500">수량</p>
                        <p className="m-0 mt-1 text-sm font-semibold">{item.quantity}</p>
                      </div>
                      <div>
                        <p className="m-0 text-xs font-semibold text-slate-500">금액</p>
                        <p className="m-0 mt-1 text-sm font-bold">
                          {formatCurrency(calculateLineAmount(item))}
                        </p>
                      </div>
                    </div>
                  ))}
                <div className="flex items-center justify-between gap-3 bg-teal-50 px-4 py-4">
                  <p className="m-0 text-base font-bold text-teal-950">합계 금액</p>
                  <p className="m-0 text-2xl font-bold text-teal-950">
                    {formatCurrency(totals.totalAmount)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  className={`w-full rounded-lg border-2 border-slate-400 bg-white px-5 py-4 text-lg font-semibold shadow-sm disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto ${FOCUS_VISIBLE_CLASS}`}
                  disabled={submitPending}
                  type="button"
                  onClick={() => setConfirmingSubmit(false)}
                >
                  다시 보기
                </button>
                <button
                  className={`w-full rounded-lg bg-teal-700 px-5 py-4 text-lg font-semibold text-white shadow-sm disabled:bg-slate-300 sm:w-auto ${FOCUS_VISIBLE_CLASS}`}
                  disabled={!canSubmit}
                  type="button"
                  onClick={submitOrder}
                >
                  {submitPending
                    ? "제출 중입니다..."
                    : orderStatus === "submitted"
                      ? "주문 다시 제출"
                      : "최종 제출"}
                </button>
              </div>
            </div>
          ) : (
            <button
              className={`w-full rounded-lg bg-teal-700 px-5 py-4 text-lg font-semibold text-white shadow-sm disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
              disabled={!canSubmit}
              type="button"
              onClick={() => setConfirmingSubmit(true)}
            >
              {isClosed
                ? "마감된 주문입니다"
                : submitPending
                  ? "제출 중입니다..."
                  : orderStatus === "submitted"
                    ? "수정한 주문 다시 제출하기"
                    : "주문 확인 후 제출하기"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
