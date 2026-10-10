# Cloudflare Git Auto-deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pushes to `heifan00/next-whois` branch `master` automatically build and deploy the existing `next-whois-ui` Worker serving `94.cx`.

**Architecture:** Cloudflare Workers Builds owns the Git connection and deployment credentials. The repository provides a single build command that runs existing offline regression tests and TypeScript checks before OpenNext builds the Worker. Cloudflare then deploys the generated artifact with OpenNext.

**Tech Stack:** Next.js 15.5.27, OpenNext Cloudflare 1.20.10, Wrangler 4.149.0, Node.js 22.23.2, pnpm 9.15.9.

**Spec:** User request in this conversation: use Cloudflare's built-in Git deployment, with the existing repository and Worker.

## Global Constraints

- Production branch is `master`; Worker name is `next-whois-ui`.
- Build failures must stop before deployment; public upstream smoke tests run after deployment, not during builds.
- Keep local manual deployment available. Never commit credentials.

## Review Focus

- Dependency installation must use pnpm 9.15.9 with the committed lockfile.
- Node must support the existing RDAP TypeScript test import.
- Deploy must reuse the completed OpenNext artifact rather than rebuild.
- Preview branches must not promote code to production.
- A browser connection error does not establish that the Git trigger was enabled.

## Task 1: Repository build entry point

- [x] Add `.node-version`, `test`, `typecheck`, and `build:cloudflare:ci` scripts; update deployment documentation with exact Cloudflare settings.
- [x] Run `pnpm build:cloudflare:ci`: 18 tests passed, TypeScript passed, OpenNext build completed with exit code 0 on local Windows / Node.js 24.19.0.
- [x] Independent configuration review found no actionable issues. Commit and push use the user's existing authorization.

## Task 2: Connect and verify Workers Builds

- [x] User confirmed on 2026-10-10 that the dashboard Git connection was saved using the supplied settings: repository `heifan00/next-whois`, production branch `master`, build `pnpm build:cloudflare:ci`, deploy `pnpm exec opennextjs-cloudflare deploy`, root `/`, build variable `PNPM_VERSION=9.15.9`.
- [x] Push `8c629e16b8221b1bf9b187b4ff60d5b1cc986c92` triggered Workers Build `99802911-e29b-451b-b691-a797df0dd159`, which completed successfully on 2026-10-10 at 15:22 Asia/Shanghai.
- [x] Cloudflare's deployment API confirms version `2dccb357-7e0c-4a48-97e6-be4646f4e1d8` receives 100% of production traffic. `94.cx`, `www.94.cx`, and the public Worker all serve Next build `r1az9RWg9MzAPpcPn46JF`, different from the previous manual build.
- [x] `LOOKUP_BASE_URL=https://94.cx node scripts/verify-cloudflare.mjs` completed with exit code 0 against the automatically deployed version, covering pages/assets, locales, prices in USD/CNY, domains, IPs, ASN, ccTLDs, and availability.

**Connection status:** The user saved the Git connection after repository configuration commit `f3806e3` was pushed. A subsequent push triggered a successful production build, verified through GitHub check runs, Cloudflare deployment metadata, and the public site. The browser connector remains unavailable, but that no longer prevents verification of the Git deployment. An initial check of the previous manual version encountered incomplete ASN upstream data; the complete check of the automatically deployed version passed without application changes.

**Ruling:** Reuse existing offline regression tests rather than add tests that mirror package scripts. Changes are build commands and documentation, with no application behavior changes.
