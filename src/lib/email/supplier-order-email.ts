import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeSupplierName } from "@/lib/domain/supplier-name";
import { createSupplierWorkbook, type SupplierExcelRow } from "@/lib/excel/supplier-files";

type BranchInfoRow = {
  name: string | null;
  delivery_address: string | null;
  phone: string | null;
};

type OrderItemRow = {
  product_code: string | null;
  product_name: string;
  spec: string | null;
  supplier_name: string | null;
  quantity: number | null;
};

type ClosedOrderRow = {
  branches: BranchInfoRow | BranchInfoRow[] | null;
  order_items: OrderItemRow[] | null;
};

type SupplierDirectoryRow = {
  name: string;
  email: string | null;
  is_active: boolean;
};

const RESEND_SEND_INTERVAL_MS = 600;
const RESEND_RATE_LIMIT_RETRY_MS = 1500;

export type SupplierEmailResult = {
  sent: number;
  skipped: Array<{ supplierName: string; reason: string }>;
  failed: Array<{ supplierName: string; email: string; reason: string }>;
};

type SupplierEmailOptions = {
  supplierName?: string;
};

function groupRowsBySupplier(rows: SupplierExcelRow[]): Map<string, SupplierExcelRow[]> {
  return rows.reduce((grouped, row) => {
    const supplierRows = grouped.get(row.supplierName) ?? [];
    supplierRows.push(row);
    grouped.set(row.supplierName, supplierRows);
    return grouped;
  }, new Map<string, SupplierExcelRow[]>());
}

function mapSupplierRows(orders: ClosedOrderRow[]): SupplierExcelRow[] {
  return orders.flatMap((order) => {
    const branch = Array.isArray(order.branches) ? order.branches[0] : order.branches;
    const branchName = branch?.name?.trim() ?? "";
    const address = branch?.delivery_address?.trim() ?? "";
    const phone = branch?.phone?.trim() ?? "";

    return (order.order_items ?? [])
      .filter((item) => (item.quantity ?? 0) > 0)
      .map((item) => ({
        supplierName: item.supplier_name?.trim() ?? "",
        branchName,
        address,
        phone,
        productCode: item.product_code?.trim() ?? "",
        productName: item.product_name,
        spec: item.spec ?? "",
        quantity: item.quantity ?? 0,
      }))
      .filter((row) => row.supplierName.length > 0);
  });
}

function getEmailEnv() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.ORDER_EMAIL_FROM ?? "",
  };
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  supplierName: string;
  orderDate: string;
  attachment: Uint8Array;
}): Promise<string> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: `[Order] ${params.orderDate} ${params.supplierName}`,
      text: `Please find the attached order file for ${params.orderDate}.`,
      attachments: [
        {
          filename: `${params.supplierName}_${params.orderDate}.xlsx`,
          content: Buffer.from(params.attachment).toString("base64"),
        },
      ],
    }),
  });

  if (response.status === 429) {
    await sleep(RESEND_RATE_LIMIT_RETRY_MS);
    const retryResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: `[Order] ${params.orderDate} ${params.supplierName}`,
        text: `Please find the attached order file for ${params.orderDate}.`,
        attachments: [
          {
            filename: `${params.supplierName}_${params.orderDate}.xlsx`,
            content: Buffer.from(params.attachment).toString("base64"),
          },
        ],
      }),
    });

    if (retryResponse.ok) {
      const retryBody = (await retryResponse.json().catch(() => null)) as { id?: string } | null;
      return retryBody?.id ?? "";
    }

    const retryMessage = await retryResponse.text();
    throw new Error(retryMessage || `Resend request failed with ${retryResponse.status}`);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Resend request failed with ${response.status}`);
  }

  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  return body?.id ?? "";
}

async function logSupplierEmail(
  supabase: SupabaseClient,
  row: {
    order_date: string;
    supplier_name: string;
    email: string | null;
    status: "sent" | "skipped" | "failed";
    reason?: string | null;
    provider_message_id?: string | null;
  },
) {
  const { error } = await supabase.from("supplier_email_logs").insert(row);

  if (error) {
    console.error("[supplier-email-log]", error.message, row);
  }
}

export async function sendSupplierOrderEmails(
  supabase: SupabaseClient,
  orderDate: string,
  options: SupplierEmailOptions = {},
): Promise<SupplierEmailResult> {
  const result: SupplierEmailResult = {
    sent: 0,
    skipped: [],
    failed: [],
  };
  const { apiKey, from } = getEmailEnv();

  if (!apiKey || !from) {
    await logSupplierEmail(supabase, {
      order_date: orderDate,
      supplier_name: "all",
      email: null,
      status: "skipped",
      reason: "RESEND_API_KEY or ORDER_EMAIL_FROM is not set.",
    });
    result.skipped.push({
      supplierName: "all",
      reason: "RESEND_API_KEY or ORDER_EMAIL_FROM is not set.",
    });
    return result;
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select(
      "branches(name, delivery_address, phone), order_items(product_code, product_name, spec, supplier_name, quantity)",
    )
    .eq("order_date", orderDate)
    .eq("status", "closed");

  if (ordersError) {
    await logSupplierEmail(supabase, {
      order_date: orderDate,
      supplier_name: "all",
      email: null,
      status: "failed",
      reason: ordersError.message,
    });
    result.failed.push({
      supplierName: "all",
      email: "",
      reason: ordersError.message,
    });
    return result;
  }

  const rows = mapSupplierRows((orders ?? []) as ClosedOrderRow[]);
  const groupedRows = groupRowsBySupplier(rows);
  const targetSupplierName = options.supplierName
    ? normalizeSupplierName(options.supplierName)
    : "";

  if (targetSupplierName) {
    for (const supplierName of groupedRows.keys()) {
      if (normalizeSupplierName(supplierName) !== targetSupplierName) {
        groupedRows.delete(supplierName);
      }
    }
  }

  if (groupedRows.size === 0) {
    await logSupplierEmail(supabase, {
      order_date: orderDate,
      supplier_name: "all",
      email: null,
      status: "skipped",
      reason: "No supplier order rows to email.",
    });
    result.skipped.push({
      supplierName: "all",
      reason: "No supplier order rows to email.",
    });
    return result;
  }

  const { data: suppliers, error: suppliersError } = await supabase
    .from("supplier_directory")
    .select("name, email, is_active")
    .eq("is_active", true);

  if (suppliersError) {
    await logSupplierEmail(supabase, {
      order_date: orderDate,
      supplier_name: "all",
      email: null,
      status: "failed",
      reason: suppliersError.message,
    });
    result.failed.push({
      supplierName: "all",
      email: "",
      reason: suppliersError.message,
    });
    return result;
  }

  const emailBySupplier = new Map<string, string>();

  for (const supplier of (suppliers ?? []) as SupplierDirectoryRow[]) {
    const key = normalizeSupplierName(supplier.name);
    const email = supplier.email?.trim() ?? "";
    const existingEmail = emailBySupplier.get(key) ?? "";

    if (email || !existingEmail) {
      emailBySupplier.set(key, email);
    }
  }

  let attemptedSendCount = 0;

  for (const [supplierName, supplierRows] of groupedRows) {
    const email = emailBySupplier.get(normalizeSupplierName(supplierName)) ?? "";

    if (!email) {
      await logSupplierEmail(supabase, {
        order_date: orderDate,
        supplier_name: supplierName,
        email: null,
        status: "skipped",
        reason: "Supplier email is not registered.",
      });
      result.skipped.push({
        supplierName,
        reason: "Supplier email is not registered.",
      });
      continue;
    }

    try {
      if (attemptedSendCount > 0) {
        await sleep(RESEND_SEND_INTERVAL_MS);
      }

      attemptedSendCount += 1;

      const workbook = await createSupplierWorkbook(supplierRows);
      const providerMessageId = await sendResendEmail({
        apiKey,
        from,
        to: email,
        supplierName,
        orderDate,
        attachment: workbook,
      });
      await logSupplierEmail(supabase, {
        order_date: orderDate,
        supplier_name: supplierName,
        email,
        status: "sent",
        provider_message_id: providerMessageId,
      });
      result.sent += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Email delivery failed.";
      await logSupplierEmail(supabase, {
        order_date: orderDate,
        supplier_name: supplierName,
        email,
        status: "failed",
        reason,
      });
      result.failed.push({
        supplierName,
        email,
        reason,
      });
    }
  }

  return result;
}
