import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/lib/pricing/client.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const pricingModule = { exports: {} };
new Function("require", "module", "exports", compiled)(
  require,
  pricingModule,
  pricingModule.exports,
);
const { getDomainPricing, getDomainPricingList, formatDomainPrice } =
  pricingModule.exports;

// Snapshot of the current public API's .cc registration row (2026-10-10).
const registration = {
  registrar: "porkbun",
  registrarname: "porkbun",
  registrarweb: "https://porkbun.com/",
  register: 3.4,
  register_cny: 22.76,
  renew: 8.55,
  renew_cny: 57.22,
  transfer: 8.55,
  transfer_cny: 57.22,
  currency: "usd",
  currencyname: "美元",
  currencytype: "美元",
  promocode: { register: true, renew: false, transfer: true },
  updatedtime: "2026-10-10 07:05:19",
};

function stubApi(t, body, checkUrl = () => {}) {
  t.mock.method(globalThis, "fetch", async (url) => {
    checkUrl(new URL(url));
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

test("registration queries use the current API and suffix comparison link", async (t) => {
  stubApi(t, { code: 100, data: { price: [registration] } }, (url) => {
    assert.equal(url.searchParams.get("domain"), "cc");
    assert.equal(url.searchParams.get("order"), "register");
    assert.equal(url.searchParams.get("limit"), "1");
    assert.equal(url.searchParams.get("page"), "1");
  });
  const row = await getDomainPricing("PLT.CC", "register");
  assert.equal(row?.register, 3.4);
  assert.equal(row?.register_cny, 22.76);
  assert.equal(row?.externalLink, "https://www.nazhumi.com/domain/cc/register");
});

test("unavailable and malformed prices cannot hide a later valid quote", async (t) => {
  stubApi(t, {
    code: 100,
    data: {
      price: [
        { ...registration, register: "n/a" },
        { ...registration, register: null },
        { ...registration, register: -1 },
        registration,
      ],
    },
  });
  const rows = await getDomainPricingList("plt.cc", "register", 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].register, 3.4);
});

test("HTTP 200 with a business error does not produce a quote", async (t) => {
  stubApi(t, { code: 201, msg: "参数错误", data: { price: [registration] } });
  assert.deepEqual(await getDomainPricingList("plt.cc", "register"), []);
});

test("empty API results do not produce a fabricated zero price", async (t) => {
  stubApi(t, { code: 100, data: { price: [] } });
  assert.equal(await getDomainPricing("plt.cc", "register"), null);
});

test("currency switching uses each operation's supplied CNY quote", () => {
  assert.equal(
    formatDomainPrice?.(registration, "register", "original"),
    "3.4 USD",
  );
  assert.equal(
    formatDomainPrice?.(registration, "register", "cny"),
    "22.76 CNY",
  );
  assert.equal(formatDomainPrice?.(registration, "renew", "cny"), "57.22 CNY");
  assert.equal(
    formatDomainPrice?.(registration, "transfer", "cny"),
    "57.22 CNY",
  );
});

test("zero prices remain valid; unavailable prices never display undefined", () => {
  assert.equal(
    formatDomainPrice?.(
      { ...registration, register: 0, register_cny: 0 },
      "register",
      "cny",
    ),
    "0.00 CNY",
  );
  assert.equal(
    formatDomainPrice?.(
      { ...registration, register: "n/a" },
      "register",
      "original",
    ),
    null,
  );
  assert.equal(
    formatDomainPrice?.(
      { ...registration, register: undefined },
      "register",
      "original",
    ),
    null,
  );
});

test("missing CNY quotes preserve the original currency without inventing a rate", () => {
  assert.equal(
    formatDomainPrice?.(
      { ...registration, register_cny: undefined },
      "register",
      "cny",
    ),
    "3.4 USD",
  );
  assert.equal(
    formatDomainPrice?.(
      {
        ...registration,
        currency: "cny",
        register: 25,
        register_cny: undefined,
      },
      "register",
      "cny",
    ),
    "25.00 CNY",
  );
});
