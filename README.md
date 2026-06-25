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

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Main Routes

- `/branch`: 지사용 PWA 주문 화면
- `/admin`: 본사 관리자 화면

## Verification

```bash
npm test
npm run build
```
