import assert from "node:assert/strict";
import test from "node:test";
import { sourceLoader } from "./helpers/load-source.mjs";

function lookupHarness({
  rdap,
  rdapError,
  whoisText = "Error: Invalid query invalid_input",
  cache = false,
  networkWhois,
} = {}) {
  let upstreamCalls = 0;
  const stored = new Map();
  const load = sourceLoader({
    "@/lib/utils": {
      extractDomain: (value) => (value.includes(".") ? value : null),
      includeArgs: (text, ...keys) => keys.some((key) => text.includes(key)),
    },
    "@/lib/server/redis": {
      redis: cache ? {} : undefined,
      getJsonRedisValue: async (key) => stored.get(key),
      setJsonRedisValue: async (key, value) => {
        stored.set(key, value);
        return true;
      },
      REDIS_CACHE_TTL: 3600,
    },
    "@/lib/whois/rdap_client": {
      RegistryRdapError: class extends Error {},
      lookupRdap: async () => {
        upstreamCalls++;
        if (rdapError) throw rdapError;
        if (!rdap) throw new Error("RDAP unavailable");
        return rdap;
      },
      convertRdapToWhoisResult: async (data, query) =>
        load("src/lib/whois/rdap_parser.ts").parseRdapToWhoisResult(
          data,
          query,
        ),
    },
    "./registrar_rdap": { supplementRegistrarExpiration: async () => {} },
    "@/lib/pricing/client": {
      getDomainPricing: async () => null,
      getDomainPricingList: async () => [],
    },
    "@/lib/moz/client": {
      getMozMetrics: async () => ({
        domainAuthority: -1,
        pageAuthority: -1,
        spamScore: -1,
      }),
    },
    "whois-raw": {
      lookup: (_, options, callback) => {
        upstreamCalls++;
        callback(null, whoisText);
      },
    },
    ...(networkWhois
      ? { "./network_whois": { lookupNetworkWhois: async () => networkWhois } }
      : {}),
  });
  return {
    load,
    ...load("src/lib/whois/lookup.ts"),
    calls: () => upstreamCalls,
    stored,
  };
}

test("invalid input never reaches upstream or reports business success", async () => {
  const client = lookupHarness();
  const result = await client.lookupWhois("invalid_input");
  assert.equal(result.status, false);
  assert.equal(result.outcome, "invalid_input");
  assert.equal(result.errorCode, "INVALID_QUERY");
  assert.equal(client.calls(), 0);
});

test("WHOIS error text and bootstrap errors are not registration records", async () => {
  const result = await lookupHarness({
    whoisText: "Error: Invalid query example.com",
  }).lookupWhois("example.com");
  assert.equal(result.status, false);
  assert.equal(result.outcome, "upstream_error");
  assert.equal(result.available, undefined);
});

export const networkRecord = {
  objectClassName: "ip network",
  handle: "1.1.1.0 - 1.1.1.255",
  name: "APNIC-LABS",
  country: "AU",
  startAddress: "1.1.1.0",
  endAddress: "1.1.1.255",
  ipVersion: "v4",
  cidr0_cidrs: [{ v4prefix: "1.1.1.0", length: 24 }],
  entities: [
    {
      roles: ["registrant"],
      vcardArray: [
        "vcard",
        [["fn", {}, "text", "APNIC Research and Development"]],
      ],
      entities: [
        {
          roles: ["abuse"],
          vcardArray: ["vcard", [["email", {}, "text", "abuse@example.net"]]],
        },
      ],
    },
  ],
  remarks: [{ description: ["Routed by AS13335/Cloudflare"] }],
};

test("RDAP parses CIDRs, registration country and nested contact roles", () => {
  const { parseRdapToWhoisResult } = sourceLoader()(
    "src/lib/whois/rdap_parser.ts",
  );
  const result = parseRdapToWhoisResult(networkRecord, "1.1.1.1");
  assert.equal(result.cidr, "1.1.1.0/24");
  assert.deepEqual(result.cidrs, ["1.1.1.0/24"]);
  assert.equal(result.registrantCountry, "AU");
  assert.equal(result.registrantOrganization, "APNIC Research and Development");
  assert.equal(result.contacts.abuse[0].email, "abuse@example.net");
  assert.equal(result.domainAge, null);
});

test("normalization handles IDNs, IPv6 and CIDR while rejecting ambiguous inputs", () => {
  const { normalizeQuery } = sourceLoader()("src/lib/whois/query.ts");
  for (const value of [
    "",
    "invalid_input",
    "999.1.1.1",
    "https://example.com/a",
    "example.com:443",
    "AS4294967296",
    "2001:::1",
    "1.1.1.1/33",
    "a".repeat(64) + ".com",
  ])
    assert.equal(normalizeQuery(value), null, value);
  assert.deepEqual(normalizeQuery(" EXAMPLE.COM. "), {
    queryType: "domain",
    normalizedQuery: "example.com",
  });
  assert.equal(normalizeQuery("中国.cn").normalizedQuery, "xn--fiqs8s.cn");
  assert.equal(
    normalizeQuery("2001:0DB8:0:0:0:0:0:1").normalizedQuery,
    "2001:db8::1",
  );
  assert.equal(normalizeQuery("1.1.1.17/24").normalizedQuery, "1.1.1.0/24");
});

test("address ranges produce multiple aligned IPv4 and IPv6 CIDRs", () => {
  const { rangeToCidrs } = sourceLoader()("src/lib/whois/address.ts");
  assert.deepEqual(rangeToCidrs("1.1.1.1", "1.1.1.6"), [
    "1.1.1.1/32",
    "1.1.1.2/31",
    "1.1.1.4/31",
    "1.1.1.6/32",
  ]);
  assert.deepEqual(rangeToCidrs("2001:db8::", "2001:db8::ff"), [
    "2001:db8::/120",
  ]);
});

test("ASN referrals resolve the final operator and retain allocation separately", async () => {
  const { lookupNetworkWhois, normalizeWhoisReferral } = sourceLoader()(
    "src/lib/whois/network_whois.ts",
  );
  const requests = [];
  const response = await lookupNetworkWhois(
    { queryType: "asn", normalizedQuery: "AS13335" },
    async (server) => {
      requests.push(server);
      return server === "whois.iana.org"
        ? "as-block: 13312-15359\norganisation: Assigned by ARIN\nrefer: whois.arin.net"
        : "ASNumber: 13335\nASName: CLOUDFLARENET\nOrgName: Cloudflare, Inc.";
    },
  );
  assert.deepEqual(requests, ["whois.iana.org", "whois.arin.net"]);
  assert.equal(response.allocationRegistry, "ARIN");
  assert.match(response.text, /Cloudflare/);
  assert.equal(response.warning, undefined);
  for (const value of [
    "127.0.0.1",
    "whois://whois.arin.net:80",
    "https://whois.arin.net",
    "whois.arin.net.evil.example",
  ])
    assert.equal(normalizeWhoisReferral(value), null);
  const incomplete = await lookupNetworkWhois(
    { queryType: "asn", normalizedQuery: "AS13335" },
    async () =>
      "as-block: 13312-15359\norganisation: Assigned by ARIN\nrefer: whois.iana.org",
  );
  assert.equal(incomplete.warning.code, "REFERRAL_LOOP");
});

test("v2 omits domain-only fields on IPs and distinguishes mentioned ASNs", async () => {
  const client = lookupHarness({ rdap: networkRecord });
  const result = await client.lookupWhois("1.1.1.1");
  const { toLookupV2 } = client.load("src/lib/whois/api_response.ts");
  const response = toLookupV2(result, false);
  assert.equal(response.queryType, "ipv4");
  for (const field of ["domain", "domainAge", "expirationDate", "dnssec"])
    assert.equal(field in response.data, false);
  assert.equal(response.data.registeredCountry, "AU");
  assert.equal(response.data.geolocation, null);
  assert.deepEqual(response.data.routing.mentionedASNs, ["AS13335"]);
  assert.deepEqual(response.data.routing.bgpConfirmedASNs, []);
  assert.equal("raw" in response, false);
  assert.equal(typeof toLookupV2(result, true).raw.rdap, "object");
});

test("v2 uses null for missing values and does not invent pricing terms", async () => {
  const client = lookupHarness({ rdap: { ldhName: "example.com" } });
  const result = await client.lookupWhois("example.com");
  result.result.mozDomainAuthority = -1;
  result.result.registerPrice = {
    register: 10,
    register_cny: 70,
    register_eff_cny: 60,
    currency: "usd",
    isPremium: false,
    updatedtime: "2026-11-13 10:30:00",
    promocode: { register: true },
  };
  const { toLookupV2 } = client.load("src/lib/whois/api_response.ts");
  const response = toLookupV2(result, false);
  assert.equal(response.data.creationDate, null);
  assert.equal(response.data.moz.domainAuthority, null);
  assert.equal(response.pricing.scope, "tld");
  const offer = response.pricing.offers[0];
  assert.equal(offer.billingPeriodYears, null);
  assert.equal(offer.premiumChecked, false);
  assert.equal(offer.isPremium, null);
  assert.equal(offer.updatedAt, null);
  assert.equal(offer.promotion.codeRequired, true);
  assert.equal(offer.promotion.newCustomersOnly, null);
});

test("HTTP errors distinguish invalid input, no record, rate limits and timeouts", async () => {
  async function request(client, query, extra = {}) {
    let code, body;
    const headers = {};
    const res = {
      setHeader: (key, value) => {
        headers[key] = value;
      },
      status: (value) => {
        code = value;
        return res;
      },
      json: (value) => {
        body = value;
      },
    };
    const { createLookupHandler } = client.load("src/lib/whois/api_handler.ts");
    await createLookupHandler(2)(
      { method: "GET", query: { query, ...extra } },
      res,
    );
    return { code, body, headers };
  }
  const invalid = await request(lookupHarness(), "invalid_input");
  assert.equal(invalid.code, 400);
  assert.equal(invalid.body.error.code, "INVALID_QUERY");
  assert.equal((await request(lookupHarness(), ["a.com", "b.com"])).code, 400);
  assert.equal(
    (await request(lookupHarness(), "example.com", { includeRaw: "yes" })).code,
    400,
  );
  const missing = await request(
    lookupHarness({ rdapError: { status: 404 } }),
    "example.com",
  );
  assert.equal(missing.code, 200);
  assert.equal(missing.body.outcome, "not_found");
  assert.equal(missing.body.data, null);
  assert.equal(missing.body.pricing.registrationAvailability, null);
  const limited = await request(
    lookupHarness({ rdapError: { status: 429, retryAfterSeconds: 60 } }),
    "example.com",
  );
  assert.equal(limited.code, 429);
  assert.equal(limited.headers["Retry-After"], "60");
  const timeout = await request(
    lookupHarness({
      rdapError: new Error("RDAP timed out"),
      whoisText: "Error: service unavailable",
    }),
    "example.com",
  );
  assert.equal(timeout.code, 502);
  const { outcomeHttpStatus } = sourceLoader()(
    "src/lib/whois/lookup_policy.ts",
  );
  assert.equal(outcomeHttpStatus("upstream_error", "UPSTREAM_TIMEOUT"), 504);
});

test("cache keys are normalized, timestamps survive hits and failures are not cached", async () => {
  const client = lookupHarness({
    rdap: { ldhName: "example.com" },
    cache: true,
  });
  const first = await client.lookupWhoisWithCache("EXAMPLE.COM.");
  const second = await client.lookupWhoisWithCache(" example.com ");
  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
  assert.equal(second.query, " example.com ");
  assert.equal(first.queriedAt, second.queriedAt);
  assert.ok(
    Date.parse(second.cache.expiresAt) > Date.parse(second.cache.storedAt),
  );
  assert.equal(client.calls(), 1);
  const limited = lookupHarness({ rdapError: { status: 429 }, cache: true });
  await limited.lookupWhoisWithCache("example.com");
  await limited.lookupWhoisWithCache("example.com");
  assert.equal(limited.stored.size, 0);
  assert.equal(limited.calls(), 2);
});

test("allocation-only ASN responses are partial and cannot become an operator", async () => {
  const client = lookupHarness({
    networkWhois: {
      text: "as-block: 13312-15359\norganisation: Assigned by ARIN\nrefer: whois.arin.net",
      server: "whois.iana.org",
      warning: { code: "REFERRAL_FAILED", message: "Referral unavailable" },
    },
  });
  const response = await client.lookupWhois("AS13335");
  const result = client
    .load("src/lib/whois/api_response.ts")
    .toLookupV2(response);
  assert.equal(result.outcome, "partial");
  assert.equal(result.data.asNumber, null);
  assert.equal(result.data.registeredOrganization, null);
  assert.equal(result.data.allocationRegistry, "ARIN");
});

test("RIR bootstrap selects ARIN for AS13335 and keeps upstream status", async () => {
  const urls = [];
  let status = 200;
  const load = sourceLoader({
    "./rdap_http_client": {
      fetchRdapJson: async () => ({
        services: [[["13312-15359"], ["https://rdap.arin.net/registry/"]]],
      }),
      fetchRdapText: async (url) => {
        urls.push(url);
        return {
          status,
          headers: { "retry-after": "45" },
          body: JSON.stringify({
            objectClassName: "autnum",
            startAutnum: 13335,
            endAutnum: 13335,
            name: "CLOUDFLARENET",
          }),
        };
      },
    },
  });
  const { lookupNetworkRdap } = load("src/lib/whois/network_rdap.ts");
  const result = await lookupNetworkRdap({
    queryType: "asn",
    normalizedQuery: "AS13335",
  });
  assert.equal(result.startAutnum, 13335);
  assert.equal(urls[0], "https://rdap.arin.net/registry/autnum/13335");
  status = 429;
  await assert.rejects(
    lookupNetworkRdap({ queryType: "asn", normalizedQuery: "AS13335" }),
    (error) => error.status === 429 && error.retryAfterSeconds === 45,
  );
});

test("raw options preserve legacy fields, enforce limits and do not mutate cached data", async () => {
  const client = lookupHarness({ rdap: networkRecord });
  const response = await client.lookupWhois("1.1.1.1");
  const { rawData, toLegacyResponse } = client.load(
    "src/lib/whois/api_response.ts",
  );
  assert.ok(toLegacyResponse(response).result.rawRdapContent);
  assert.equal(
    "rawRdapContent" in toLegacyResponse(response, false).result,
    false,
  );
  assert.ok(response.result.rawRdapContent);
  const raw = rawData({
    rawWhoisContent: "",
    rawRdapContent: JSON.stringify({ text: "汉".repeat(70000) }),
  });
  assert.equal(raw.truncated, true);
  assert.equal(raw.rdap, null);
  assert.ok(Buffer.byteLength(raw.rdapPreview) <= raw.limitBytes);
});

test("WHOIS classifies RIPE error codes before generic error text", () => {
  const { classifyWhois } = sourceLoader()("src/lib/whois/lookup_policy.ts");
  const query = { queryType: "ipv4", normalizedQuery: "1.1.1.1" };
  assert.equal(
    classifyWhois(
      "%ERROR:101: no entries found\n% No entries found in source RIPE.",
      query,
    ),
    "not_found",
  );
  assert.equal(
    classifyWhois("%ERROR:202: access control limit reached", query),
    "rate_limited",
  );
  assert.equal(
    classifyWhois("%ERROR:201: access denied", query),
    "upstream_error",
  );
});

test("WHOIS success requires the requested identity or a containing network", () => {
  const { classifyWhois } = sourceLoader()("src/lib/whois/lookup_policy.ts");
  assert.equal(
    classifyWhois("Domain Name: other.com\nRegistrar: Example", {
      queryType: "domain",
      normalizedQuery: "example.com",
    }),
    "upstream_error",
  );
  assert.equal(
    classifyWhois("inetnum: 8.8.8.0 - 8.8.8.255", {
      queryType: "ipv4",
      normalizedQuery: "1.1.1.1",
    }),
    "upstream_error",
  );
  assert.equal(
    classifyWhois("inet6num: 2001:db8::/32", {
      queryType: "ipv6",
      normalizedQuery: "2001:db8::1",
    }),
    "ok",
  );
});
