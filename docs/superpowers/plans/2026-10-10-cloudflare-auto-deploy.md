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

- [ ] Connect `heifan00/next-whois` to the existing Worker through the Cloudflare dashboard, production branch `master`, build `pnpm build:cloudflare:ci`, deploy `pnpm exec opennextjs-cloudflare deploy`, root `/`, build variable `PNPM_VERSION=9.15.9`.
- [ ] Verify a build for the pushed commit succeeds and that `94.cx` serves the new deployment. Record any concrete connection blocker if the dashboard remains inaccessible.

**Connection status:** Even after the user reattached Chrome and the current Worker URL, and after resetting the browser session, the browser connector returns `Unable to load browser request-header policy`. The user has been given the exact dashboard settings for a one-time connection. Local Wrangler OAuth lacks Workers Builds configuration access. Git binding and the first automatic build are pending; repository readiness alone is not completion.

**Ruling:** Reuse existing offline regression tests rather than add tests that mirror package scripts. Changes are build commands and documentation, with no application behavior changes.
