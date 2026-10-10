# Cloudflare Workers Migration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline.

**Goal:** Run 94.cx on Cloudflare without relying on the current application server.

**Architecture:** Keep the Pages Router frontend and API routes together in an OpenNext Worker. Use Workers Node compatibility for RDAP HTTP and WHOIS TCP. Deploy and verify workers.dev before moving the existing domain.

**Tech Stack:** Next.js 15.5.27, React 18, OpenNext Cloudflare 1.20.10, Wrangler 4.149.0, pnpm 9.15.9.

**Spec:** User request to migrate the server-hosted service to Cloudflare, preserving the price API/CNY fixes.

## Global Constraints

- Preserve domain, IP, ASN, ccTLD RDAP, WHOIS fallback, pricing and CNY behavior.
- Do not enable a paid subscription or depend on the existing Redis server.
- Build and test before publishing; keep the old server as a recoverable fallback.
- Do not commit credentials or generated Worker/Next.js output.

## Review Focus

- Node HTTP and TCP must work in the Workers runtime.
- Middleware locale redirects and query pages must retain their routing.
- Worker upload size and account limits must permit the deployment.
- Existing 94.cx proxy status and Worker routes must be inspected before a domain cutover.
- Optional Moz credentials must be configured separately if required.

### Task 1: Build the Cloudflare application

- [x] Add OpenNext/Wrangler configuration and supported Next.js dependencies.
- [x] Install with the existing pnpm lockfile format.
- [x] Run pricing/RDAP tests, type checking and the OpenNext production build. Also verify 3 locale middleware regressions and 6 Windows build-link cases.

### Task 2: Verify and deploy

- [x] Preview in workerd and verify page/API behavior, including ccTLD fallback.
- [x] Inspect existing Workers and deploy this application to workers.dev.
- [x] Verify the public deployment, pricing fields and static assets. Local DNS gave a wrong workers.dev address; using the authenticated HTTPS DNS result allowed the public smoke checks to pass.

### Task 3: Move the domain and preserve deployment instructions

- [x] Inspect 94.cx DNS/domain routing and prepare a recoverable cutover. Both root and www serve this app through Cloudflare; no Worker routes exist. Wrangler OAuth lacks DNS read permission, so use Worker routes and retain DNS for recovery.
- [x] Bind 94.cx and verify the public domain before recommending server shutdown. Both routes target next-whois-ui; root and www have the same Worker build ID.
- [x] Document deployment commands and limitations; integrate the tested changes into master and push under the user's existing commit/push authorization.

## Deployment evidence

- Worker version: `6eb12b8e-d96b-45fe-b367-6044bf54dd29`; startup 20 ms; gzip upload approximately 2 MiB.
- Next build: `fxXf6Nx7WRWD_tlWmYiNA`.
- Live checks: Chinese/English pages, JavaScript assets, registered/unregistered domains, registration/renewal original and CNY prices, nic.li/google.ss RDAP, .ss/.cc TCP WHOIS, IPv4, IPv6, ASN and existing CIDR page normalization.
- Old server is no longer part of the application request path. Its process was not stopped because no server session was provided.
