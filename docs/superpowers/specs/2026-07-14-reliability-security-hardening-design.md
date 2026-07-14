# Reliability and Security Hardening Design

## Scope

This change addresses the approved review findings only: Supabase session cookie handling, supplier email retry, same-day branch ordering, and browser security headers. Branch authentication, legacy XLS parsing, and public API request limits remain unchanged.

## Design

### Session cookies

The Supabase middleware will apply all refreshed cookies to the request first, create one response, then attach every cookie to that response. This preserves multi-part auth sessions.

### Supplier email retry

The email sender will accept an optional normalized supplier-name filter. A new admin-only endpoint will accept an order date and supplier name, verify that the order date is closed, and send only that supplier's order file. The dashboard will expose a retry button only for failed log rows. Skipped rows remain excluded.

### Branch order date

The order API will reject branch submissions whose order date is not today's Asia/Seoul date. A migration will add the same check inside `submit_branch_order` so server-side callers cannot bypass it.

### Security headers

Next.js will send CSP, framing, MIME, referrer, permissions, and HSTS headers in production. The CSP will permit the app, Supabase browser auth, and the mobile camera while blocking unrelated origins.

## Verification

Unit tests will cover date rejection, retry request validation, cookie response behavior, and header configuration. The complete test suite and production build must pass.
