import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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

export type SupplierEmailResult = {
  sent: number;
  skipped: Array<{ supplierName: string; reason: string }>;
  failed: Array<{ supplierName: string; email: string; reason: string }>;
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

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  supplierName: string;
  orderDate: string;
  attachment: Uint8Array;
}) {
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

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Resend request failed with ${response.status}`);
  }
}

export async function sendSupplierOrderEmails(
  supabase: SupabaseClient,
  orderDate: string,
): Promise<SupplierEmailResult> {
  const result: SupplierEmailResult = {
    sent: 0,
    skipped: [],
    failed: [],
  };
  const { apiKey, from } = getEmailEnv();

  if (!apiKey || !from) {
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
    result.failed.push({
      supplierName: "all",
      email: "",
      reason: ordersError.message,
    });
    return result;
  }

  const rows = mapSupplierRows((orders ?? []) as ClosedOrderRow[]);
  const groupedRows = groupRowsBySupplier(rows);

  if (groupedRows.size === 0) {
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
    result.failed.push({
      supplierName: "all",
      email: "",
      reason: suppliersError.message,
    });
    return result;
  }

  const emailBySupplier = new Map(
    ((suppliers ?? []) as SupplierDirectoryRow[]).map((supplier) => [
      supplier.name.trim(),
      supplier.email?.trim() ?? "",
    ]),
  );

  for (const [supplierName, supplierRows] of groupedRows) {
    const email = emailBySupplier.get(supplierName) ?? "";

    if (!email) {
      result.skipped.push({
        supplierName,
        reason: "Supplier email is not registered.",
      });
      continue;
    }

    try {
      const workbook = await createSupplierWorkbook(supplierRows);
      await sendResendEmail({
        apiKey,
        from,
        to: email,
        supplierName,
        orderDate,
        attachment: workbook,
      });
      result.sent += 1;
    } catch (error) {
      result.failed.push({
        supplierName,
        email,
        reason: error instanceof Error ? error.message : "Email delivery failed.",
      });
    }
  }

  return result;
}
