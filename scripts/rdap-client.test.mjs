import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/whois/rdap_client.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;

const parserModule = { exports: {} };
const compiledParser = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/whois/rdap_parser.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
new Function("require", "module", "exports", compiledParser)(
  require,
  parserModule,
  parserModule.exports,
);

function loadClient(responses, bootstrap = { services: [] }) {
  const requests = [];
  const module = { exports: {} };
  const dependencies = {
    "./rdap_parser": parserModule.exports,
    "node-rdap": {
      domain: async () => {
        throw new Error("Outdated RDAP fallback used");
      },
    },
    "@/lib/utils": { extractDomain: (query) => query },
    "./common_parser": { applyParams: async (result) => result },
    "./rdap_http_client": {
      fetchRdapJson: async () => {
        if (bootstrap instanceof Error) throw bootstrap;
        return bootstrap;
      },
      fetchRdapText: async (url) => {
        requests.push(url);
        const response = responses[url];
        if (!response) throw new Error(`Unexpected request: ${url}`);
        if (response instanceof Error) throw response;
        if (response.httpStatus)
          return { status: response.httpStatus, body: response.body };
        return { status: 200, body: JSON.stringify(response) };
      },
    },
  };
  new Function("require", "module", "exports", compiled)(
    (id) => dependencies[id] ?? require(id),
    module,
    module.exports,
  );
  return { ...module.exports, requests };
}

// Public registry/registrar response shapes observed on 2026-11-09.
const liRegistry = {
  ldhName: "java.li",
  entities: [
    {
      roles: ["registrar"],
      url: "https://www.dynadot.com",
      vcardArray: ["vcard", [["org", {}, "text", "Dynadot Inc."]]],
    },
  ],
  events: [{ eventAction: "registration", eventDate: "2000-01-19" }],
};
const liRegistrar = {
  ldhName: "java.li",
  events: [
    { eventAction: "registration", eventDate: "1970-01-01T00:00:00Z" },
    { eventAction: "expiration", eventDate: "2027-10-05T21:59:59Z" },
    { eventAction: "registrar expiration", eventDate: "2027-10-05T21:59:59Z" },
  ],
};
const registrarUrl = "https://rdap.dynadot.com/domain/java.li";

function loadBrowserClient() {
  const module = { exports: {} };
  const source = ts.transpileModule(
    readFileSync(
      new URL("../src/lib/whois/rdap_browser_client.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("require", "module", "exports", source)(
    (id) => (id === "./rdap_parser" ? parserModule.exports : require(id)),
    module,
    module.exports,
  );
  return module.exports;
}

test(".dev queries reach Google RDAP even when the IANA bootstrap is unavailable", async () => {
  const client = loadClient(
    {
      "https://pubapi.registry.google/rdap/domain/web.dev": {
        ldhName: "web.dev",
        events: [
          { eventAction: "expiration", eventDate: "2027-10-29T15:57:39.435Z" },
        ],
      },
    },
    new Error("Bootstrap unavailable"),
  );
  const data = await client.lookupRdap("web.dev");
  assert.equal(data.ldhName, "web.dev");
  assert.equal(data.__rdapServer, "https://pubapi.registry.google/rdap/");
});

test("Google 429 offers browser RDAP recovery without attempting retired WHOIS", async () => {
  const url = "https://pubapi.registry.google/rdap/domain/web.dev";
  const rdap = loadClient({
    [url]: { httpStatus: 429, body: "Too Many Requests" },
  });
  let whoisCalled = false;
  const module = { exports: {} };
  const dependencies = {
    "@/lib/env": { MAX_WHOIS_FOLLOW: 2 },
    "@/lib/server/redis": {},
    "@/lib/whois/common_parser": {},
    "@/lib/utils": { extractDomain: (query) => query },
    "@/lib/whois/rdap_client": rdap,
    "@/lib/pricing/client": { getDomainPricingList: async () => [] },
    "whois-raw": {
      lookup: (_, options, callback) => {
        whoisCalled = true;
        callback(new Error("getaddrinfo ENOTFOUND whois.nic.google"));
      },
    },
  };
  const compiledLookup = ts.transpileModule(
    readFileSync(
      new URL("../src/lib/whois/lookup.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  new Function("require", "module", "exports", compiledLookup)(
    (id) => dependencies[id] ?? require(id),
    module,
    module.exports,
  );
  const result = await module.exports.lookupWhois("web.dev");
  assert.equal(result.browserRdapUrl, url);
  assert.equal(result.source, "rdap");
  assert.equal(result.available, undefined);
  assert.equal(whoisCalled, false);
});

test(".li fills the missing expiry from its registrar without replacing registry dates", async () => {
  const client = loadClient({ [registrarUrl]: liRegistrar });
  const result = await client.convertRdapToWhoisResult(
    structuredClone(liRegistry),
    "java.li",
  );
  assert.equal(result.expirationDate, "2027-10-05T21:59:59Z");
  assert.equal(result.creationDate, "2000-01-19");
  assert.equal(result.expirationDateSource, registrarUrl);
  assert.deepEqual(JSON.parse(result.rawRdapContent), liRegistry);
});

test(".li recognizes registrars that publish org instead of fn", async () => {
  const client = loadClient({ [registrarUrl]: liRegistrar });
  const result = await client.convertRdapToWhoisResult(
    structuredClone(liRegistry),
    "java.li",
  );
  assert.equal(result.registrar, "Dynadot Inc.");
  assert.equal(result.registrarURL, "https://www.dynadot.com");
  assert.equal(result.registrantOrganization, "Unknown");
});

test("registrar failures and mismatched domains cannot break a registered .li result", async () => {
  for (const response of [
    new Error("Registrar unavailable"),
    { ...liRegistrar, ldhName: "other.li" },
  ]) {
    const client = loadClient({ [registrarUrl]: response });
    const result = await client.convertRdapToWhoisResult(
      structuredClone(liRegistry),
      "java.li",
    );
    assert.equal(result.domain, "java.li");
    assert.equal(result.expirationDate, "Unknown");
    assert.equal(result.expirationDateSource, undefined);
  }
});

test("an existing registry expiry is retained without a registrar request", async () => {
  const client = loadClient({});
  const data = structuredClone(liRegistry);
  data.events.push({
    eventAction: "expiration",
    eventDate: "2028-01-19T00:00:00Z",
  });
  const result = await client.convertRdapToWhoisResult(data, "java.li");
  assert.equal(result.expirationDate, "2028-01-19T00:00:00Z");
  assert.deepEqual(client.requests, []);
});

test("RDAP accepts the registrar expiration event when registry expiration is absent", async () => {
  const client = loadClient({});
  const result = await client.convertRdapToWhoisResult(
    {
      ldhName: "example.dev",
      events: [
        {
          eventAction: "registrar expiration",
          eventDate: "2027-01-01T00:00:00Z",
        },
      ],
    },
    "example.dev",
  );
  assert.equal(result.expirationDate, "2027-01-01T00:00:00Z");
});

test("browser recovery parses the official response and preserves server pricing", async (t) => {
  const { lookupBrowserRdap } = loadBrowserClient();
  const url = "https://pubapi.registry.google/rdap/domain/web.dev";
  const pricing = { register: [{ register: 12 }], renew: [{ renew: 14 }] };
  t.mock.method(globalThis, "fetch", async (requestUrl) => {
    assert.equal(requestUrl, url);
    return Response.json({
      ldhName: "web.dev",
      events: [
        { eventAction: "registration", eventDate: "2018-10-29T15:57:39.435Z" },
        { eventAction: "expiration", eventDate: "2027-10-29T15:57:39.435Z" },
      ],
    });
  });
  const result = await lookupBrowserRdap(url, pricing);
  assert.equal(result.status, true);
  assert.equal(result.result.domain, "web.dev");
  assert.equal(result.result.expirationDate, "2027-10-29T15:57:39.435Z");
  assert.equal(
    result.result.whoisServer,
    "https://pubapi.registry.google/rdap/",
  );
  assert.deepEqual(result.result.registerPrice, pricing.register[0]);
});

test("browser recovery only treats an RDAP 404 as unregistered", async (t) => {
  const { lookupBrowserRdap } = loadBrowserClient();
  const url = "https://pubapi.registry.google/rdap/domain/unregistered.dev";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ errorCode: 404 }, { status: 404 }),
  );
  const result = await lookupBrowserRdap(url);
  assert.equal(result.available, true);
  assert.equal(result.status, false);
});

test("browser recovery rejects rate limits and unrelated domain records", async (t) => {
  const { lookupBrowserRdap } = loadBrowserClient();
  const url = "https://pubapi.registry.google/rdap/domain/web.dev";
  let response = new Response("Too Many Requests", { status: 429 });
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(lookupBrowserRdap(url));
  response = Response.json({ ldhName: "other.dev" });
  await assert.rejects(lookupBrowserRdap(url));
});
