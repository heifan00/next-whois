import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function compileWhoisSource(name) {
  return ts.transpileModule(
    readFileSync(
      new URL(`../src/lib/whois/${name}.ts`, import.meta.url),
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
}

function evaluateModule(compiled, dependencies = {}) {
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (id) => dependencies[id] ?? require(id),
    module,
    module.exports,
  );
  return module.exports;
}

const compiled = compileWhoisSource("rdap_client");
const compiledRegistrar = compileWhoisSource("registrar_rdap");
const parserModule = evaluateModule(compileWhoisSource("rdap_parser"));

function loadClient(responses, bootstrap = { services: [] }) {
  const requests = [];
  const dependencies = {
    "./rdap_parser": parserModule,
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
        if (typeof response === "string")
          return { status: 200, body: response };
        return { status: 200, body: JSON.stringify(response) };
      },
    },
  };
  const registrar = evaluateModule(compiledRegistrar, dependencies);
  const client = evaluateModule(compiled, {
    ...dependencies,
    "./registrar_rdap": registrar,
  });
  return { ...client, requests, registrar };
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
const ianaRegistrarDirectoryUrl =
  "https://www.iana.org/assignments/registrar-ids/registrar-ids-1.csv";
const ianaRegistrarDirectory = [
  "ID,Registrar Name,Status,RDAP Base URL",
  '1068,"NameCheap, Inc.",Accredited,https://rdap.namecheap.com/',
].join("\n");

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
    (id) => (id === "./rdap_parser" ? parserModule : require(id)),
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

// Public .li responses observed from the registrars' RDAP services on 2026-11-11.
for (const sample of [
  {
    registrar: "Gandi",
    domain: "gandi.li",
    website: "https://gandi.net",
    source: "https://rdap.gandi.net/domain/gandi.li",
    creationDate: "2007-03-19",
    eventAction: "registrar expiration",
    eventDate: "2026-12-31T23:59:59Z",
    expected: "2026-12-31T23:59:59Z",
  },
  {
    registrar: "EuroDNS",
    domain: "eurodns.li",
    website: "https://www.eurodns.com",
    source: "https://rdap.eurodns.com/domain/eurodns.li",
    creationDate: "2001-11-02",
    eventAction: "expiration",
    eventDate: "2026-11-29T00:00:00+01:00",
    expected: "2026-11-28T23:00:00Z",
  },
]) {
  test(`.li supplements expiry from ${sample.registrar} in UTC`, async () => {
    const client = loadClient({
      [sample.source]: {
        ldhName: sample.domain,
        events: [
          { eventAction: sample.eventAction, eventDate: sample.eventDate },
        ],
      },
    });
    const result = await client.convertRdapToWhoisResult(
      {
        ldhName: sample.domain,
        entities: [{ roles: ["registrar"], url: sample.website }],
        events: [
          { eventAction: "registration", eventDate: sample.creationDate },
        ],
      },
      sample.domain,
    );
    assert.equal(result.expirationDate, sample.expected);
    assert.equal(result.expirationDateSource, sample.source);
    assert.equal(result.creationDate, sample.creationDate);
  });
}

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

test("expiry supplementation also works for .ch registry records", async () => {
  const source = "https://rdap.eurodns.com/domain/eurodns.ch";
  const client = loadClient({
    [source]: {
      ldhName: "eurodns.ch",
      events: [
        { eventAction: "expiration", eventDate: "2026-11-29T00:00:00+01:00" },
      ],
    },
  });
  const result = await client.convertRdapToWhoisResult(
    {
      ldhName: "eurodns.ch",
      entities: [{ roles: ["registrar"], url: "https://www.eurodns.com" }],
      events: [{ eventAction: "registration", eventDate: "2001-11-02" }],
    },
    "eurodns.ch",
  );
  assert.equal(result.expirationDate, "2026-11-28T23:00:00Z");
  assert.equal(result.expirationDateSource, source);
  assert.deepEqual(client.requests, [source]);
});

test("a registrar ID discovers an RDAP endpoint without a website mapping", async () => {
  const source = "https://rdap.namecheap.com/domain/example.org";
  const client = loadClient({
    [ianaRegistrarDirectoryUrl]: ianaRegistrarDirectory,
    [source]: {
      ldhName: "example.org",
      events: [
        {
          eventAction: "registrar expiration",
          eventDate: "2027-09-01T12:00:00Z",
        },
      ],
    },
  });
  const result = await client.convertRdapToWhoisResult(
    {
      ldhName: "example.org",
      entities: [
        {
          roles: ["registrar"],
          publicIds: [{ type: "IANA Registrar ID", identifier: "1068" }],
        },
      ],
      events: [{ eventAction: "expiration", eventDate: "REDACTED" }],
    },
    "example.org",
  );
  assert.equal(result.expirationDate, "2027-09-01T12:00:00Z");
  assert.equal(result.expirationDateSource, source);
  assert.deepEqual(client.requests, [ianaRegistrarDirectoryUrl, source]);
});

test("RDAP referrals select a listed endpoint for the queried domain", async () => {
  const domain = "example.net";
  const source = `https://rdap.namecheap.com/domain/${domain}`;
  const client = loadClient({
    [ianaRegistrarDirectoryUrl]: ianaRegistrarDirectory,
    [source]: {
      ldhName: domain,
      events: [
        { eventAction: "expiration", eventDate: "2027-10-20T00:00:00Z" },
      ],
    },
  });
  const result = await client.convertRdapToWhoisResult(
    {
      ldhName: domain,
      links: [
        `https://unlisted.example/domain/${domain}`,
        "https://rdap.namecheap.com/domain/other.net",
        source,
      ].map((href) => ({
        rel: "related",
        type: "application/rdap+json",
        href,
      })),
    },
    domain,
  );
  assert.equal(result.expirationDateSource, source);
  assert.deepEqual(client.requests, [ianaRegistrarDirectoryUrl, source]);
});

test("WHOIS results discover registrar RDAP by the exact registrar name", async () => {
  const source = "https://rdap.namecheap.com/domain/example.nz";
  const client = loadClient({
    [ianaRegistrarDirectoryUrl]: ianaRegistrarDirectory,
    [source]: {
      ldhName: "example.nz",
      events: [
        { eventAction: "expiration", eventDate: "2027-06-05T00:00:00Z" },
      ],
    },
  });
  const { analyzeWhois } = evaluateModule(compileWhoisSource("common_parser"), {
    "./registrar_rdap": client.registrar,
    "@/lib/whois/types": evaluateModule(compileWhoisSource("types")),
    "@/lib/utils": {
      includeArgs: (text, ...keys) => keys.some((key) => text.includes(key)),
    },
    "@/lib/pricing/client": { getDomainPricing: async () => null },
    "@/lib/moz/client": {
      getMozMetrics: async () => ({
        domainAuthority: 0,
        pageAuthority: 0,
        spamScore: 0,
      }),
    },
  });
  const result = await analyzeWhois(
    "domain: EXAMPLE.NZ\nRegistrar: NameCheap, Inc.\n",
    "example.nz",
  );
  assert.equal(result.expirationDate, "2027-06-05T00:00:00Z");
  assert.equal(result.expirationDateSource, source);
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
