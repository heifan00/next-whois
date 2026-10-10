import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const source = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const middlewareModule = { exports: {} };
new Function("require", "module", "exports", compiled)(require, middlewareModule, middlewareModule.exports);
const { middleware } = middlewareModule.exports;
const nextConfig = { i18n: { locales: ["en", "zh"], defaultLocale: "zh" } };

test("the Chinese default home page does not redirect back to itself", () => {
  const response = middleware(new NextRequest("https://94.cx/", { nextConfig }));
  assert.equal(response?.headers.get("location") ?? null, null);
});

test("an explicit English page remains English after Next strips the locale from nextUrl.pathname", () => {
  const response = middleware(new NextRequest("https://94.cx/en", { nextConfig }));
  assert.equal(response?.headers.get("location") ?? null, null);
});

test("an English preference redirects the home page once and preserves the query", () => {
  const response = middleware(new NextRequest("https://94.cx/?from=test", {
    nextConfig, headers: { cookie: "NEXT_LOCALE=en" },
  }));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://94.cx/en?from=test");
  assert.ok(response.headers.get("set-cookie").includes("NEXT_LOCALE=en"));
});
