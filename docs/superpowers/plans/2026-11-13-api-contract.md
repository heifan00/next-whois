# 94.cx API contract implementation plan

**Goal:** Implement the user's API correctness, normalization and integration checklist without breaking existing successful `/api/lookup` consumers.

**Architecture:** Keep the legacy response and add outcome metadata. Share the validated lookup pipeline with `/api/v2/lookup`, which has a discriminated data shape, null missing values and opt-in raw data. Resolve network objects through IANA RIR bootstrap and bounded WHOIS referrals.

**Tech stack:** Existing Next.js Pages API, TypeScript, Node HTTP/TCP, optional Redis; no new runtime dependency.

**Spec:** The user's 94.cx optimization checklist in this chat.

## Constraints and choices

- Preserve legacy successful fields and default raw output; expose the new defaults in v2.
- `not_found` is a registration-data result, never a guarantee of availability. Keep legacy `available` only for compatibility.
- IP/ASN do not receive domain enrichment. Missing dates/metrics are null in v2; timestamps without known timezone are not guessed.
- Price scope is a suffix comparison. Unknown promotion terms, billing period and premium status remain unknown.
- Reduce excessive validation: focused offline regression tests and production checks. Publication was subsequently authorized in the same chat; keep the existing CORS behavior and release through the configured Cloudflare pipeline.
- Continue in the existing clean checkout; leave changes reviewable locally.

## Tasks

- [x] Add regression coverage for invalid success, network CIDR/entity parsing, partial ASN, versioned HTTP responses and cache metadata.
- [x] Add query normalization and typed outcomes; implement RIR RDAP selection and bounded WHOIS referrals.
- [x] Add typed domain/IP/ASN projections, null/date normalization, pricing explanations and raw limits.
- [x] Add cache freshness metadata and normalized keys; do not cache transient failures.
- [x] Publish static `/api-docs`, `/docs` alias and `/openapi.json` with examples and operational limitations.
- [x] Run focused regressions, typecheck/build, and review the changed paths.

## Review focus

Input and upstream error text must never become successful objects; an allocation block must not become an ASN operator; IPv6 and non-aligned ranges must produce real CIDRs; failed optional enrichments must not erase a valid registration object; raw options must not change cached data or its query identity.

## Verification and delivery

- `pnpm test:lookup`: 42 passing tests, including the existing .li/.ch expiration and .dev browser recovery regressions.
- `pnpm build`: passed with Next.js type validation and static `/api-docs` / `/docs` routes. An initial TypeScript narrowing error was fixed; external font retries resolved. The final build after review fixes passed.
- One focused independent review found dropped domain Retry-After and RIPE error classification. Both were reproduced with failing tests and fixed. WHOIS object matching was also tightened and covered.
- Two live local pipeline samples returned AS13335 / Cloudflare and 1.1.1.0/24 through the WHOIS fallback. Direct official RDAP samples confirmed the entity shapes; local RIR RDAP bootstrap timed out during the pipeline sample, so live RDAP-first behavior is not claimed.
- Redis hit/expiry behavior was verified with a test double, not a production Redis instance. Partner projects were not changed or jointly tested. Deployment status is reported separately after publishing.
- The user approved publishing while preserving CORS behavior. Existing v1 clients need not migrate immediately; the compatibility notes in `docs/API.md` explain changed error/input handling and v2 field mapping.
- Build-generated service worker changes are excluded from the source commit.
