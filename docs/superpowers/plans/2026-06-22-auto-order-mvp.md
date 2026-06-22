# Auto Order MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP for branch order collection and supplier Excel generation using a branch PWA and admin web app.

**Architecture:** Create one Next.js App Router application deployed on Vercel. Use Supabase Postgres/Auth for persistence and admin login, while branch users select a registered branch locally without accounts. Keep business logic in focused TypeScript modules so order validation, closing, and Excel generation can be tested without rendering UI.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Supabase, Vitest, Testing Library, ExcelJS, JSZip, Zod.

---

## File Structure

- Create `package.json`: project scripts and dependencies.
- Create `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`: app tooling.
- Create `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`: app shell and route entry.
- Create `src/app/branch/*`: branch PWA screens.
- Create `src/app/admin/*`: admin screens.
- Create `src/app/api/*`: server route handlers for branches, products, orders, closing, Excel downloads.
- Create `src/lib/supabase/*`: browser and server Supabase clients.
- Create `src/lib/domain/*`: pure business logic for orders, closing summaries, unregistered products, and Excel grouping.
- Create `src/lib/excel/*`: Excel and ZIP generation.
- Create `src/lib/types.ts`: shared TypeScript types.
- Create `src/lib/schemas.ts`: Zod schemas for API payloads.
- Create `supabase/migrations/0001_initial_schema.sql`: database tables, enums, constraints, and RLS baseline.
- Create `tests/unit/*`: pure unit tests.
- Create `tests/integration/*`: route/business integration tests where practical.
- Create `public/manifest.webmanifest`: PWA install metadata.

## Task 1: Scaffold Next.js App

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `public/manifest.webmanifest`

- [ ] **Step 1: Create project files**

Create `package.json`:

```json
{
  "name": "auto-order",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.45.4",
    "exceljs": "^4.4.0",
    "jszip": "^3.10.1",
    "lucide-react": "^0.468.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/jszip": "^3.4.1",
    "@types/node": "^22.5.5",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.11.1",
    "eslint-config-next": "^15.0.0",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
  },
};

export default config;
```

Create `eslint.config.mjs`:

```js
import next from "eslint-config-next";

export default next;
```

Create `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Order",
  description: "Branch order collection and supplier Excel generation",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <h1 className="text-3xl font-bold">Auto Order</h1>
        <p className="text-lg text-slate-700">지사 주문 취합 및 납품처 발주 파일 생성 시스템</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link className="rounded-lg bg-teal-700 px-5 py-4 text-center text-lg font-semibold text-white" href="/branch">
            지사 주문
          </Link>
          <Link className="rounded-lg border border-slate-300 bg-white px-5 py-4 text-center text-lg font-semibold" href="/admin">
            본사 관리자
          </Link>
        </div>
      </div>
    </main>
  );
}
```

Create `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f8fafc;
  color: #0f172a;
  font-family: Arial, Helvetica, sans-serif;
}

button,
input,
select,
textarea {
  font: inherit;
}
```

Create `public/manifest.webmanifest`:

```json
{
  "name": "Auto Order",
  "short_name": "AutoOrder",
  "start_url": "/branch",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#0f766e",
  "icons": []
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and dependencies install with exit code 0.

- [ ] **Step 3: Run build check**

Run:

```bash
npm run build
```

Expected: build succeeds and Next.js creates `.next`.

- [ ] **Step 4: Commit scaffold**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs src/app public/manifest.webmanifest
git commit -m "chore: scaffold Next.js app"
```

## Task 2: Add Shared Types, Schemas, And Domain Tests

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/types.ts`
- Create: `src/lib/schemas.ts`
- Create: `src/lib/domain/order-totals.ts`
- Create: `src/lib/domain/closing-summary.ts`
- Test: `tests/unit/order-totals.test.ts`
- Test: `tests/unit/closing-summary.test.ts`

- [ ] **Step 1: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 2: Write failing order total test**

Create `tests/unit/order-totals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateOrderTotals } from "@/lib/domain/order-totals";
import type { OrderItemDraft } from "@/lib/types";

describe("calculateOrderTotals", () => {
  it("counts positive quantity items and sums total quantity", () => {
    const items: OrderItemDraft[] = [
      { barcode: "8801", productName: "물티슈", spec: "100매", quantity: 3, isUnregistered: false },
      { barcode: "8802", productName: "장갑", spec: "L", quantity: 2, isUnregistered: false },
      { barcode: "8803", productName: "제외", spec: "", quantity: 0, isUnregistered: true },
    ];

    expect(calculateOrderTotals(items)).toEqual({
      lineItemCount: 2,
      totalQuantity: 5,
      unregisteredItemCount: 0,
    });
  });

  it("counts unregistered positive quantity items", () => {
    const items: OrderItemDraft[] = [
      { barcode: "9999", productName: "현장입력상품", spec: "메모", quantity: 4, isUnregistered: true },
    ];

    expect(calculateOrderTotals(items).unregisteredItemCount).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/order-totals.test.ts
```

Expected: FAIL because `@/lib/domain/order-totals` does not exist.

- [ ] **Step 4: Implement shared types and order totals**

Create `src/lib/types.ts`:

```ts
export type OrderStatus = "draft" | "submitted" | "closed";

export type Branch = {
  id: string;
  code: string;
  name: string;
  deliveryAddress: string;
  recipientName: string;
  phone: string;
  isActive: boolean;
};

export type Product = {
  id: string;
  barcode: string;
  productCode: string;
  name: string;
  spec: string;
  supplierName: string;
  unitPrice: number;
  isActive: boolean;
};

export type OrderItemDraft = {
  productId?: string;
  barcode: string;
  productCode?: string;
  productName: string;
  spec: string;
  supplierName?: string;
  quantity: number;
  isUnregistered: boolean;
  memo?: string;
};

export type OrderTotals = {
  lineItemCount: number;
  totalQuantity: number;
  unregisteredItemCount: number;
};

export type BranchOrderStatus = {
  branchId: string;
  branchName: string;
  status: "not_submitted" | OrderStatus;
  itemCount: number;
  totalQuantity: number;
};
```

Create `src/lib/domain/order-totals.ts`:

```ts
import type { OrderItemDraft, OrderTotals } from "@/lib/types";

export function calculateOrderTotals(items: OrderItemDraft[]): OrderTotals {
  const activeItems = items.filter((item) => item.quantity > 0);

  return {
    lineItemCount: activeItems.length,
    totalQuantity: activeItems.reduce((sum, item) => sum + item.quantity, 0),
    unregisteredItemCount: activeItems.filter((item) => item.isUnregistered).length,
  };
}
```

- [ ] **Step 5: Run order total test**

Run:

```bash
npm test -- tests/unit/order-totals.test.ts
```

Expected: PASS with 2 tests.

- [ ] **Step 6: Write failing closing summary test**

Create `tests/unit/closing-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildClosingSummary } from "@/lib/domain/closing-summary";
import type { BranchOrderStatus, OrderItemDraft } from "@/lib/types";

describe("buildClosingSummary", () => {
  it("summarizes submitted branches, unsubmitted branches, suppliers, and unresolved items", () => {
    const branchStatuses: BranchOrderStatus[] = [
      { branchId: "b1", branchName: "강남지사", status: "submitted", itemCount: 2, totalQuantity: 5 },
      { branchId: "b2", branchName: "부산지사", status: "not_submitted", itemCount: 0, totalQuantity: 0 },
    ];
    const items: OrderItemDraft[] = [
      { barcode: "1", productCode: "P1", productName: "물티슈", spec: "100매", supplierName: "A납품처", quantity: 3, isUnregistered: false },
      { barcode: "2", productName: "미등록", spec: "메모", quantity: 2, isUnregistered: true },
    ];

    expect(buildClosingSummary(branchStatuses, items)).toEqual({
      submittedBranchCount: 1,
      unsubmittedBranchNames: ["부산지사"],
      totalItemCount: 2,
      totalQuantity: 5,
      supplierCount: 1,
      unregisteredItemCount: 1,
      unresolvedItemCount: 1,
    });
  });
});
```

- [ ] **Step 7: Run closing summary test to verify it fails**

Run:

```bash
npm test -- tests/unit/closing-summary.test.ts
```

Expected: FAIL because `@/lib/domain/closing-summary` does not exist.

- [ ] **Step 8: Implement closing summary and schemas**

Create `src/lib/domain/closing-summary.ts`:

```ts
import type { BranchOrderStatus, OrderItemDraft } from "@/lib/types";

export type ClosingSummary = {
  submittedBranchCount: number;
  unsubmittedBranchNames: string[];
  totalItemCount: number;
  totalQuantity: number;
  supplierCount: number;
  unregisteredItemCount: number;
  unresolvedItemCount: number;
};

export function buildClosingSummary(
  branchStatuses: BranchOrderStatus[],
  items: OrderItemDraft[],
): ClosingSummary {
  const activeItems = items.filter((item) => item.quantity > 0);
  const suppliers = new Set(activeItems.map((item) => item.supplierName).filter(Boolean));

  return {
    submittedBranchCount: branchStatuses.filter((branch) => branch.status === "submitted").length,
    unsubmittedBranchNames: branchStatuses
      .filter((branch) => branch.status === "not_submitted")
      .map((branch) => branch.branchName),
    totalItemCount: activeItems.length,
    totalQuantity: activeItems.reduce((sum, item) => sum + item.quantity, 0),
    supplierCount: suppliers.size,
    unregisteredItemCount: activeItems.filter((item) => item.isUnregistered).length,
    unresolvedItemCount: activeItems.filter((item) => !item.supplierName).length,
  };
}
```

Create `src/lib/schemas.ts`:

```ts
import { z } from "zod";

export const orderItemDraftSchema = z.object({
  productId: z.string().uuid().optional(),
  barcode: z.string().min(1),
  productCode: z.string().optional(),
  productName: z.string().min(1),
  spec: z.string().default(""),
  supplierName: z.string().optional(),
  quantity: z.number().int().min(0),
  isUnregistered: z.boolean(),
  memo: z.string().optional(),
});

export const submitOrderSchema = z.object({
  branchId: z.string().uuid(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(orderItemDraftSchema),
});

export const closeDateSchema = z.object({
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
```

- [ ] **Step 9: Run tests**

Run:

```bash
npm test
```

Expected: all unit tests pass.

- [ ] **Step 10: Commit domain base**

```bash
git add vitest.config.ts src/lib tests/unit
git commit -m "feat: add order domain base"
```

## Task 3: Add Supabase Schema And Clients

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `.env.example`

- [ ] **Step 1: Create database migration**

Create `supabase/migrations/0001_initial_schema.sql`:

```sql
create extension if not exists "pgcrypto";

create type order_status as enum ('draft', 'submitted', 'closed');
create type closing_status as enum ('closed', 'cancelled');
create type admin_role as enum ('admin');

create table branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  delivery_address text not null,
  recipient_name text not null,
  phone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  product_code text not null,
  name text not null,
  spec text not null default '',
  supplier_name text not null,
  unit_price numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  order_date date not null,
  status order_status not null default 'draft',
  submitted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, order_date)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  barcode text not null,
  product_code text,
  product_name text not null,
  spec text not null default '',
  supplier_name text,
  quantity integer not null check (quantity >= 0),
  is_unregistered boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table closing_batches (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,
  status closing_status not null default 'closed',
  closed_by uuid,
  closed_at timestamptz not null default now(),
  cancelled_by uuid,
  cancelled_at timestamptz,
  note text
);

create table generated_files (
  id uuid primary key default gen_random_uuid(),
  closing_batch_id uuid not null references closing_batches(id) on delete cascade,
  supplier_name text not null,
  file_name text not null,
  storage_path text,
  generated_at timestamptz not null default now()
);

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  name text not null,
  role admin_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table branches enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table closing_batches enable row level security;
alter table generated_files enable row level security;
alter table admin_users enable row level security;

create policy "public read active branches" on branches for select using (is_active = true);
create policy "public read active products" on products for select using (is_active = true);
```

- [ ] **Step 2: Create Supabase environment example**

Create `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 3: Create Supabase clients**

Create `src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
```

- [ ] **Step 4: Run type and build checks**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit schema and clients**

```bash
git add .env.example supabase src/lib/supabase
git commit -m "feat: add Supabase schema and clients"
```

## Task 4: Implement Branch PWA Order Flow

**Files:**
- Create: `src/app/branch/page.tsx`
- Create: `src/app/branch/BranchOrderApp.tsx`
- Create: `src/app/api/branches/route.ts`
- Create: `src/app/api/products/search/route.ts`
- Create: `src/app/api/orders/route.ts`
- Test: `tests/unit/branch-order-state.test.ts`
- Create: `src/lib/domain/branch-order-state.ts`

- [ ] **Step 1: Write failing branch order state test**

Create `tests/unit/branch-order-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { upsertOrderItem } from "@/lib/domain/branch-order-state";
import type { OrderItemDraft } from "@/lib/types";

describe("upsertOrderItem", () => {
  it("adds a new product when barcode is not in the draft", () => {
    const item: OrderItemDraft = {
      barcode: "8801",
      productId: "p1",
      productCode: "P1",
      productName: "물티슈",
      spec: "100매",
      supplierName: "A납품처",
      quantity: 2,
      isUnregistered: false,
    };

    expect(upsertOrderItem([], item)).toEqual([item]);
  });

  it("replaces quantity for an existing barcode", () => {
    const existing: OrderItemDraft = {
      barcode: "8801",
      productName: "물티슈",
      spec: "100매",
      quantity: 1,
      isUnregistered: false,
    };
    const next = { ...existing, quantity: 5 };

    expect(upsertOrderItem([existing], next)).toEqual([next]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/branch-order-state.test.ts
```

Expected: FAIL because `branch-order-state` does not exist.

- [ ] **Step 3: Implement branch order state helper**

Create `src/lib/domain/branch-order-state.ts`:

```ts
import type { OrderItemDraft } from "@/lib/types";

export function upsertOrderItem(items: OrderItemDraft[], nextItem: OrderItemDraft): OrderItemDraft[] {
  const withoutExisting = items.filter((item) => item.barcode !== nextItem.barcode);
  if (nextItem.quantity <= 0) {
    return withoutExisting;
  }
  return [...withoutExisting, nextItem];
}
```

- [ ] **Step 4: Run helper test**

Run:

```bash
npm test -- tests/unit/branch-order-state.test.ts
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Create branch APIs**

Create `src/app/api/branches/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, code, name, delivery_address, recipient_name, phone, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ branches: data });
}
```

Create `src/app/api/products/search/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ products: [] });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, barcode, product_code, name, spec, supplier_name, unit_price, is_active")
    .eq("is_active", true)
    .or(`barcode.eq.${query},name.ilike.%${query}%`)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data });
}
```

Create `src/app/api/orders/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { submitOrderSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const parsed = submitOrderSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { branchId, orderDate, items } = parsed.data;
  const supabase = createServiceClient();

  const { data: existingClosed } = await supabase
    .from("orders")
    .select("id")
    .eq("branch_id", branchId)
    .eq("order_date", orderDate)
    .eq("status", "closed")
    .maybeSingle();

  if (existingClosed) {
    return NextResponse.json({ error: "본사 마감 완료로 수정할 수 없습니다." }, { status: 409 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .upsert(
      {
        branch_id: branchId,
        order_date: orderDate,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "branch_id,order_date" },
    )
    .select("id")
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  await supabase.from("order_items").delete().eq("order_id", order.id);

  const rows = items
    .filter((item) => item.quantity > 0)
    .map((item) => ({
      order_id: order.id,
      product_id: item.productId ?? null,
      barcode: item.barcode,
      product_code: item.productCode ?? null,
      product_name: item.productName,
      spec: item.spec,
      supplier_name: item.supplierName ?? null,
      quantity: item.quantity,
      is_unregistered: item.isUnregistered,
      memo: item.memo ?? null,
    }));

  if (rows.length > 0) {
    const { error: itemError } = await supabase.from("order_items").insert(rows);
    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ orderId: order.id });
}
```

- [ ] **Step 6: Create branch UI**

Create `src/app/branch/page.tsx`:

```tsx
import BranchOrderApp from "./BranchOrderApp";

export default function BranchPage() {
  return <BranchOrderApp />;
}
```

Create `src/app/branch/BranchOrderApp.tsx` with a client component that:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateOrderTotals } from "@/lib/domain/order-totals";
import { upsertOrderItem } from "@/lib/domain/branch-order-state";
import type { Branch, OrderItemDraft, Product } from "@/lib/types";

const today = new Date().toISOString().slice(0, 10);

export default function BranchOrderApp() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<OrderItemDraft[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualSpec, setManualSpec] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("auto-order-branch-id") ?? "";
    setSelectedBranchId(stored);
    fetch("/api/branches")
      .then((response) => response.json())
      .then((data) => setBranches(data.branches ?? []));
  }, []);

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const totals = useMemo(() => calculateOrderTotals(items), [items]);

  async function searchProducts() {
    const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    setProducts(data.products ?? []);
    setManualMode((data.products ?? []).length === 0);
  }

  function selectBranch(branchId: string) {
    if (items.length > 0 && !window.confirm("작성 중인 주문이 있습니다. 지사를 변경할까요?")) {
      return;
    }
    window.localStorage.setItem("auto-order-branch-id", branchId);
    setSelectedBranchId(branchId);
    setItems([]);
  }

  function addProduct(product: Product) {
    setItems((current) =>
      upsertOrderItem(current, {
        productId: product.id,
        barcode: product.barcode,
        productCode: product.productCode,
        productName: product.name,
        spec: product.spec,
        supplierName: product.supplierName,
        quantity,
        isUnregistered: false,
      }),
    );
    setQuery("");
    setProducts([]);
    setQuantity(1);
  }

  function addManualItem() {
    setItems((current) =>
      upsertOrderItem(current, {
        barcode: query,
        productName: manualName,
        spec: manualSpec,
        quantity,
        isUnregistered: true,
        memo: manualSpec,
      }),
    );
    setManualMode(false);
    setManualName("");
    setManualSpec("");
    setQuery("");
    setQuantity(1);
  }

  async function submitOrder() {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId: selectedBranchId, orderDate: today, items }),
    });

    if (!response.ok) {
      const data = await response.json();
      setMessage(data.error ?? "주문 제출에 실패했습니다.");
      return;
    }

    setConfirming(false);
    setMessage("주문이 제출되었습니다.");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950">
      <section className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-bold">지사 주문</h1>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          지사 선택
          <select className="rounded-lg border border-slate-300 p-4 text-lg" value={selectedBranchId} onChange={(event) => selectBranch(event.target.value)}>
            <option value="">지사를 선택하세요</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>

        {selectedBranch ? <p className="rounded-lg bg-teal-50 p-4 text-xl font-bold">{selectedBranch.name}</p> : null}

        <div className="flex gap-2">
          <input className="min-w-0 flex-1 rounded-lg border border-slate-300 p-4 text-lg" placeholder="바코드 또는 상품명" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="rounded-lg bg-teal-700 px-5 text-lg font-bold text-white" type="button" onClick={searchProducts}>검색</button>
        </div>

        <label className="flex flex-col gap-2 text-lg font-semibold">
          수량
          <input className="rounded-lg border border-slate-300 p-4 text-lg" min={1} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
        </label>

        {products.map((product) => (
          <button key={product.id} className="rounded-lg border border-slate-300 bg-white p-4 text-left" type="button" onClick={() => addProduct(product)}>
            <span className="block text-lg font-bold">{product.name}</span>
            <span className="block text-slate-600">{product.spec} / {product.supplierName}</span>
          </button>
        ))}

        {manualMode ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-lg font-bold">등록되지 않은 상품입니다. 직접 입력하세요.</p>
            <input className="rounded-lg border border-slate-300 p-4" placeholder="상품명" value={manualName} onChange={(event) => setManualName(event.target.value)} />
            <input className="rounded-lg border border-slate-300 p-4" placeholder="규격 또는 메모" value={manualSpec} onChange={(event) => setManualSpec(event.target.value)} />
            <button className="rounded-lg bg-amber-600 p-4 text-lg font-bold text-white" type="button" onClick={addManualItem}>미등록 상품 추가</button>
          </div>
        ) : null}

        <div className="rounded-lg bg-white p-4">
          <h2 className="text-xl font-bold">주문 목록</h2>
          {items.map((item) => (
            <div key={item.barcode} className="border-b border-slate-200 py-3">
              <p className="font-bold">{item.productName} {item.isUnregistered ? "(미등록)" : ""}</p>
              <p className="text-slate-600">{item.spec} / {item.quantity}개</p>
            </div>
          ))}
          <p className="pt-3 font-bold">상품 {totals.lineItemCount}개 / 총 수량 {totals.totalQuantity}</p>
        </div>

        {confirming ? (
          <div className="rounded-lg border border-teal-300 bg-white p-4">
            <h2 className="text-xl font-bold">제출 전 확인</h2>
            <p>{selectedBranch?.name} / {today}</p>
            <p>상품 {totals.lineItemCount}개, 총 수량 {totals.totalQuantity}</p>
            <button className="mt-4 w-full rounded-lg bg-teal-700 p-4 text-lg font-bold text-white" type="button" onClick={submitOrder}>이대로 제출</button>
          </div>
        ) : (
          <button className="rounded-lg bg-teal-700 p-4 text-lg font-bold text-white disabled:bg-slate-300" disabled={!selectedBranchId || items.length === 0} type="button" onClick={() => setConfirming(true)}>
            주문 제출 확인
          </button>
        )}

        {message ? <p className="rounded-lg bg-slate-900 p-4 text-white">{message}</p> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: tests and build pass.

- [ ] **Step 8: Commit branch flow**

```bash
git add src/app/branch src/app/api/branches src/app/api/products src/app/api/orders src/lib/domain/branch-order-state.ts tests/unit/branch-order-state.test.ts
git commit -m "feat: add branch PWA order flow"
```

## Task 5: Implement Admin Master And Closing Flow

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/AdminDashboard.tsx`
- Create: `src/app/api/admin/status/route.ts`
- Create: `src/app/api/admin/close/route.ts`
- Create: `src/app/api/admin/cancel-close/route.ts`
- Create: `src/lib/auth/admin.ts`

- [ ] **Step 1: Create admin guard**

Create `src/lib/auth/admin.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();

  if (error || !userData.user) {
    return { ok: false as const, error: "관리자 로그인이 필요합니다." };
  }

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, role")
    .eq("auth_user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!admin) {
    return { ok: false as const, error: "관리자 권한이 없습니다." };
  }

  return { ok: true as const, userId: userData.user.id, adminId: admin.id };
}
```

- [ ] **Step 2: Create admin status API**

Create `src/app/api/admin/status/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildClosingSummary } from "@/lib/domain/closing-summary";
import { createServiceClient } from "@/lib/supabase/server";
import type { BranchOrderStatus, OrderItemDraft } from "@/lib/types";

export async function GET(request: NextRequest) {
  const orderDate = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const supabase = createServiceClient();

  const { data: branches, error: branchError } = await supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (branchError) return NextResponse.json({ error: branchError.message }, { status: 500 });

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, branch_id, status, order_items(product_name, spec, supplier_name, quantity, is_unregistered, barcode, product_code)")
    .eq("order_date", orderDate);

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  const branchStatuses: BranchOrderStatus[] = branches.map((branch) => {
    const order = orders.find((item) => item.branch_id === branch.id);
    const orderItems = order?.order_items ?? [];
    return {
      branchId: branch.id,
      branchName: branch.name,
      status: order?.status ?? "not_submitted",
      itemCount: orderItems.length,
      totalQuantity: orderItems.reduce((sum, item) => sum + item.quantity, 0),
    };
  });

  const items: OrderItemDraft[] = orders.flatMap((order) =>
    (order.order_items ?? []).map((item) => ({
      barcode: item.barcode,
      productCode: item.product_code ?? undefined,
      productName: item.product_name,
      spec: item.spec,
      supplierName: item.supplier_name ?? undefined,
      quantity: item.quantity,
      isUnregistered: item.is_unregistered,
    })),
  );

  return NextResponse.json({
    orderDate,
    branchStatuses,
    summary: buildClosingSummary(branchStatuses, items),
  });
}
```

- [ ] **Step 3: Create close and cancel APIs**

Create `src/app/api/admin/close/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { closeDateSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const parsed = closeDateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceClient();
  const { orderDate } = parsed.data;

  const { data: unresolved, error: unresolvedError } = await supabase
    .from("orders")
    .select("id, order_items(id)")
    .eq("order_date", orderDate)
    .eq("order_items.is_unregistered", true)
    .is("order_items.supplier_name", null);

  if (unresolvedError) return NextResponse.json({ error: unresolvedError.message }, { status: 500 });
  if (unresolved.some((order) => order.order_items.length > 0)) {
    return NextResponse.json({ error: "납품처가 없는 미등록 상품을 먼저 정리하세요." }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("order_date", orderDate)
    .eq("status", "submitted");

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: closingBatch, error: closeError } = await supabase
    .from("closing_batches")
    .insert({ order_date: orderDate, status: "closed" })
    .select("id")
    .single();

  if (closeError) return NextResponse.json({ error: closeError.message }, { status: 500 });

  return NextResponse.json({ closingBatchId: closingBatch.id });
}
```

Create `src/app/api/admin/cancel-close/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { closeDateSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const parsed = closeDateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceClient();
  const { orderDate } = parsed.data;

  const { error: orderError } = await supabase
    .from("orders")
    .update({ status: "submitted", closed_at: null })
    .eq("order_date", orderDate)
    .eq("status", "closed");

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  const { error: batchError } = await supabase
    .from("closing_batches")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("order_date", orderDate)
    .eq("status", "closed");

  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create admin page and dashboard**

Create `src/app/admin/page.tsx`:

```tsx
import AdminDashboard from "./AdminDashboard";

export default function AdminPage() {
  return <AdminDashboard />;
}
```

Create `src/app/admin/AdminDashboard.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type AdminStatus = {
  orderDate: string;
  branchStatuses: Array<{
    branchId: string;
    branchName: string;
    status: string;
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

const today = new Date().toISOString().slice(0, 10);

export default function AdminDashboard() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [message, setMessage] = useState("");

  async function loadStatus() {
    const response = await fetch(`/api/admin/status?date=${today}`);
    const data = await response.json();
    setStatus(data);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function closeOrders() {
    const response = await fetch("/api/admin/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderDate: today }),
    });
    const data = await response.json();
    setMessage(response.ok ? "마감되었습니다." : data.error);
    setConfirmingClose(false);
    await loadStatus();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <section className="mx-auto flex max-w-5xl flex-col gap-5">
        <h1 className="text-3xl font-bold">본사 관리자</h1>
        {status ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-white p-4"><p>제출 지사</p><strong className="text-2xl">{status.summary.submittedBranchCount}</strong></div>
              <div className="rounded-lg bg-white p-4"><p>미제출</p><strong className="text-2xl">{status.summary.unsubmittedBranchNames.length}</strong></div>
              <div className="rounded-lg bg-white p-4"><p>총 수량</p><strong className="text-2xl">{status.summary.totalQuantity}</strong></div>
              <div className="rounded-lg bg-white p-4"><p>미등록</p><strong className="text-2xl">{status.summary.unregisteredItemCount}</strong></div>
            </div>

            <div className="rounded-lg bg-white p-4">
              <h2 className="text-xl font-bold">지사별 현황</h2>
              {status.branchStatuses.map((branch) => (
                <div key={branch.branchId} className="grid grid-cols-4 border-b border-slate-200 py-3">
                  <span className="font-semibold">{branch.branchName}</span>
                  <span>{branch.status}</span>
                  <span>{branch.itemCount}개 상품</span>
                  <span>{branch.totalQuantity}개</span>
                </div>
              ))}
            </div>

            {confirmingClose ? (
              <div className="rounded-lg border border-red-300 bg-white p-5">
                <h2 className="text-xl font-bold text-red-700">마감 전 확인</h2>
                <p>미제출 지사: {status.summary.unsubmittedBranchNames.join(", ") || "없음"}</p>
                <p>총 상품 수: {status.summary.totalItemCount}</p>
                <p>총 수량: {status.summary.totalQuantity}</p>
                <p>납품처 수: {status.summary.supplierCount}</p>
                <button className="mt-4 rounded-lg bg-red-700 px-5 py-4 text-lg font-bold text-white" type="button" onClick={closeOrders}>오늘 주문 마감</button>
              </div>
            ) : (
              <button className="rounded-lg bg-red-700 px-5 py-4 text-lg font-bold text-white" type="button" onClick={() => setConfirmingClose(true)}>
                마감 확인
              </button>
            )}
          </>
        ) : null}
        {message ? <p className="rounded-lg bg-slate-900 p-4 text-white">{message}</p> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit admin closing flow**

```bash
git add src/app/admin src/app/api/admin src/lib/auth
git commit -m "feat: add admin closing flow"
```

## Task 6: Implement Excel And ZIP Generation

**Files:**
- Create: `src/lib/excel/supplier-files.ts`
- Create: `src/app/api/admin/excel/route.ts`
- Test: `tests/unit/supplier-files.test.ts`

- [ ] **Step 1: Write failing supplier grouping test**

Create `tests/unit/supplier-files.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupRowsBySupplier } from "@/lib/excel/supplier-files";

describe("groupRowsBySupplier", () => {
  it("groups rows by supplier name", () => {
    const rows = [
      { supplierName: "A납품처", branchName: "강남", address: "서울", phone: "010", productCode: "P1", productName: "물티슈", spec: "100매", quantity: 2 },
      { supplierName: "B납품처", branchName: "부산", address: "부산", phone: "010", productCode: "P2", productName: "장갑", spec: "L", quantity: 1 },
      { supplierName: "A납품처", branchName: "대구", address: "대구", phone: "010", productCode: "P1", productName: "물티슈", spec: "100매", quantity: 3 },
    ];

    expect(groupRowsBySupplier(rows).get("A납품처")).toHaveLength(2);
    expect(groupRowsBySupplier(rows).get("B납품처")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/supplier-files.test.ts
```

Expected: FAIL because `supplier-files` does not exist.

- [ ] **Step 3: Implement supplier Excel helpers**

Create `src/lib/excel/supplier-files.ts`:

```ts
import ExcelJS from "exceljs";
import JSZip from "jszip";

export type SupplierExcelRow = {
  supplierName: string;
  branchName: string;
  address: string;
  phone: string;
  productCode: string;
  productName: string;
  spec: string;
  quantity: number;
};

export function groupRowsBySupplier(rows: SupplierExcelRow[]) {
  return rows.reduce((map, row) => {
    const existing = map.get(row.supplierName) ?? [];
    existing.push(row);
    map.set(row.supplierName, existing);
    return map;
  }, new Map<string, SupplierExcelRow[]>());
}

export async function createSupplierWorkbook(rows: SupplierExcelRow[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("발주서");
  worksheet.columns = [
    { header: "주문지사명", key: "branchName", width: 18 },
    { header: "주소", key: "address", width: 35 },
    { header: "연락처", key: "phone", width: 18 },
    { header: "상품코드", key: "productCode", width: 16 },
    { header: "상품명", key: "productName", width: 30 },
    { header: "규격", key: "spec", width: 18 },
    { header: "수량", key: "quantity", width: 10 },
  ];
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

export async function createSupplierZip(rows: SupplierExcelRow[], orderDate: string) {
  const zip = new JSZip();
  const grouped = groupRowsBySupplier(rows);

  for (const [supplierName, supplierRows] of grouped) {
    const buffer = await createSupplierWorkbook(supplierRows);
    zip.file(`${supplierName}_${orderDate}.xlsx`, buffer);
  }

  return zip.generateAsync({ type: "uint8array" });
}
```

- [ ] **Step 4: Run supplier file test**

Run:

```bash
npm test -- tests/unit/supplier-files.test.ts
```

Expected: PASS with 1 test.

- [ ] **Step 5: Create Excel download API**

Create `src/app/api/admin/excel/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupplierZip, type SupplierExcelRow } from "@/lib/excel/supplier-files";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const orderDate = request.nextUrl.searchParams.get("date");
  if (!orderDate) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select("branches(name, delivery_address, phone), order_items(product_code, product_name, spec, supplier_name, quantity)")
    .eq("order_date", orderDate)
    .eq("status", "closed");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: SupplierExcelRow[] = data.flatMap((order) =>
    order.order_items.map((item) => ({
      supplierName: item.supplier_name ?? "",
      branchName: order.branches?.name ?? "",
      address: order.branches?.delivery_address ?? "",
      phone: order.branches?.phone ?? "",
      productCode: item.product_code ?? "",
      productName: item.product_name,
      spec: item.spec,
      quantity: item.quantity,
    })),
  ).filter((row) => row.supplierName);

  const zip = await createSupplierZip(rows, orderDate);

  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="supplier-orders-${orderDate}.zip"`,
    },
  });
}
```

- [ ] **Step 6: Add admin download link**

Modify `src/app/admin/AdminDashboard.tsx` by adding this link near the close button:

```tsx
<a className="rounded-lg border border-slate-300 bg-white px-5 py-4 text-center text-lg font-bold" href={`/api/admin/excel?date=${today}`}>
  납품처 ZIP 다운로드
</a>
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: tests and build pass.

- [ ] **Step 8: Commit Excel generation**

```bash
git add src/lib/excel src/app/api/admin/excel src/app/admin/AdminDashboard.tsx tests/unit/supplier-files.test.ts
git commit -m "feat: add supplier Excel generation"
```

## Task 7: Add Admin Master Data Upload

**Files:**
- Create: `src/lib/domain/product-master.ts`
- Create: `src/app/api/admin/products/upload/route.ts`
- Test: `tests/unit/product-master.test.ts`
- Modify: `src/app/admin/AdminDashboard.tsx`

- [ ] **Step 1: Write failing product master parser test**

Create `tests/unit/product-master.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeProductMasterRow } from "@/lib/domain/product-master";

describe("normalizeProductMasterRow", () => {
  it("normalizes a valid product master row", () => {
    expect(normalizeProductMasterRow({
      "바코드 번호": "8801111123456",
      "상품코드": "P-001",
      "상품명": "프리미엄 물티슈",
      "규격": "100매",
      "납품 거래처명": "A납품처",
      "단가": 1200,
    })).toEqual({
      barcode: "8801111123456",
      productCode: "P-001",
      name: "프리미엄 물티슈",
      spec: "100매",
      supplierName: "A납품처",
      unitPrice: 1200,
    });
  });
});
```

- [ ] **Step 2: Run parser test to verify it fails**

Run:

```bash
npm test -- tests/unit/product-master.test.ts
```

Expected: FAIL because `product-master` does not exist.

- [ ] **Step 3: Implement product master normalizer**

Create `src/lib/domain/product-master.ts`:

```ts
export type ProductMasterInputRow = Record<string, string | number | null | undefined>;

export type NormalizedProductMasterRow = {
  barcode: string;
  productCode: string;
  name: string;
  spec: string;
  supplierName: string;
  unitPrice: number;
};

function readRequired(row: ProductMasterInputRow, key: string) {
  const value = row[key];
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(`${key} 값이 필요합니다.`);
  }
  return String(value).trim();
}

export function normalizeProductMasterRow(row: ProductMasterInputRow): NormalizedProductMasterRow {
  return {
    barcode: readRequired(row, "바코드 번호"),
    productCode: readRequired(row, "상품코드"),
    name: readRequired(row, "상품명"),
    spec: String(row["규격"] ?? "").trim(),
    supplierName: readRequired(row, "납품 거래처명"),
    unitPrice: Number(row["단가"] ?? 0),
  };
}
```

- [ ] **Step 4: Run parser test**

Run:

```bash
npm test -- tests/unit/product-master.test.ts
```

Expected: PASS with 1 test.

- [ ] **Step 5: Create upload API**

Create `src/app/api/admin/products/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { normalizeProductMasterRow } from "@/lib/domain/product-master";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "엑셀 파일이 필요합니다." }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(await file.arrayBuffer());
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return NextResponse.json({ error: "첫 번째 시트를 찾을 수 없습니다." }, { status: 400 });
  }

  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values as Array<string | number | undefined>;
  const rows = [];
  const errors = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const raw: Record<string, string | number | null | undefined> = {};

    headers.forEach((header, index) => {
      if (index > 0 && header) {
        raw[String(header)] = row.getCell(index).value?.toString();
      }
    });

    try {
      const normalized = normalizeProductMasterRow(raw);
      rows.push({
        barcode: normalized.barcode,
        product_code: normalized.productCode,
        name: normalized.name,
        spec: normalized.spec,
        supplier_name: normalized.supplierName,
        unit_price: normalized.unitPrice,
        is_active: true,
      });
    } catch (error) {
      errors.push({
        rowNumber,
        reason: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("products").upsert(rows, { onConflict: "barcode" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ importedCount: rows.length });
}
```

- [ ] **Step 6: Add upload section to admin dashboard**

Modify `src/app/admin/AdminDashboard.tsx` by adding this section below the summary cards:

```tsx
<div className="rounded-lg bg-white p-4">
  <h2 className="text-xl font-bold">상품 마스터</h2>
  <form
    className="mt-3 flex flex-col gap-3"
    onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/products/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setMessage(response.ok ? `${data.importedCount}개 상품을 반영했습니다.` : JSON.stringify(data));
    }}
  >
    <input className="rounded-lg border border-slate-300 p-3" name="file" type="file" accept=".xlsx" />
    <button className="rounded-lg bg-slate-900 px-5 py-4 text-lg font-bold text-white" type="submit">
      상품 마스터 업로드
    </button>
  </form>
</div>
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: tests and build pass.

- [ ] **Step 8: Commit product master upload**

```bash
git add src/lib/domain/product-master.ts src/app/api/admin/products src/app/admin/AdminDashboard.tsx tests/unit/product-master.test.ts
git commit -m "feat: add product master upload"
```

## Task 8: Final Verification And Local Run

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Create README**

Create `README.md`:

```md
# Auto Order

지사 주문 취합 및 납품처 발주 자동화 MVP입니다.

## Stack

- Next.js
- Supabase
- Vercel
- Vitest
- ExcelJS

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Fill Supabase environment variables.
3. Install dependencies with `npm install`.
4. Run `npm run dev`.

## Main Routes

- `/branch`: 지사용 PWA 주문 화면
- `/admin`: 본사 관리자 화면

## Verification

```bash
npm test
npm run build
```
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: tests pass and production build succeeds.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: Next.js dev server starts and prints a local URL such as `http://localhost:3000`.

- [ ] **Step 4: Manual smoke check**

Open the local URL and check:

- `/` shows links to branch and admin.
- `/branch` renders branch selection and order entry controls.
- `/admin` renders dashboard shell.
- PWA manifest is available at `/manifest.webmanifest`.

- [ ] **Step 5: Commit README**

```bash
git add README.md
git commit -m "docs: add local setup guide"
```

## Self-Review Checklist

- Spec coverage: This plan covers Next.js, Supabase, Vercel, branch PWA, branch selection access, manual unregistered products, admin status, manual close, double-check screens, and supplier Excel ZIP download.
- Spec coverage: Product master upload includes Excel parsing, row-level validation, and barcode-based upsert.
- Type consistency: Order statuses use `draft`, `submitted`, and `closed`. Branch UI uses `OrderItemDraft`. Excel rows use `SupplierExcelRow`.
- Verification: Every implementation task includes test/build commands and a commit step.
