import assert from "node:assert/strict";

const baseUrl = process.env.LOOKUP_BASE_URL || "http://127.0.0.1:8787";

async function lookup(query) {
  const url = new URL("/api/lookup", baseUrl);
  url.searchParams.set("query", query);
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  const body = await response.json();
  assert.equal(response.status, 200, `${query}: ${JSON.stringify(body)}`);
  console.log(`${query}: ${body.source || "available"}, ${body.time}s`);
  return body;
}

for (const path of ["/", "/en", "/plt.cc", "/en/8.8.8.0%2F24"]) {
  const response = await fetch(new URL(path, baseUrl), {
    signal: AbortSignal.timeout(90000),
  });
  assert.equal(response.status, 200, `${path} must render`);
  const html = await response.text();
  assert.ok(html.includes("__NEXT_DATA__"), `${path} must contain the Next page`);
  const serialized = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const nextData = JSON.parse(serialized);
  assert.equal(nextData.locale, path.startsWith("/en") ? "en" : "zh");
  if (path === "/plt.cc") {
    const pageData = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(pageData, "the query page must contain serialized results");
    const queryData = JSON.parse(pageData).props.pageProps.data;
    assert.equal(queryData.status, true, "the query page must render a successful lookup");
    assert.equal(queryData.result.domain.toLowerCase(), "plt.cc");
  }
  if (path.includes("%2F24")) {
    const pageData = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    const queryData = JSON.parse(pageData).props.pageProps.data;
    assert.equal(queryData.status, true, "CIDR input must retain the existing IP lookup behavior");
    assert.equal(queryData.result.domain, "8.8.8.0");
  }
  const assetPath = html.match(/src="([^"]*\/_next\/static\/[^\"]+\.js)"/)?.[1];
  assert.ok(assetPath, `${path} must include a JavaScript asset`);
  const asset = await fetch(new URL(assetPath, baseUrl));
  assert.equal(asset.status, 200, `${assetPath} must load`);
  assert.ok((await asset.text()).length > 0, `${assetPath} must have content`);
  console.log(`${path}: page and JavaScript asset loaded`);
}

const preferred = await fetch(new URL("/", baseUrl), {
  headers: { cookie: "NEXT_LOCALE=en" }, redirect: "manual",
});
assert.equal(preferred.status, 307);
assert.equal(new URL(preferred.headers.get("location"), baseUrl).pathname, "/en");

const registered = await lookup("plt.cc");
assert.equal(registered.status, true);
assert.equal(registered.result.domain.toLowerCase(), "plt.cc");
for (const field of ["registerPrice", "renewPrice"]) {
  const price = registered.result[field];
  assert.ok(price, `${field} must be present`);
  const operation = field === "registerPrice" ? "register" : "renew";
  for (const amount of [price[operation], price[`${operation}_cny`]]) {
    assert.equal(typeof amount, "number", `${field} must contain numeric prices`);
    assert.ok(Number.isFinite(amount) && amount >= 0);
  }
}

for (const query of ["nic.li", "google.ss", ".ss", "8.8.8.8", "2606:4700:4700::1111", "AS13335", ".cc"]) {
  let result = await lookup(query);
  // The external RDAP service can briefly fail and yield incomplete WHOIS
  // fallback fields. Retry once, while still requiring a real ASN result.
  if (query === "AS13335" && result.result?.originAS !== "AS13335") {
    console.warn("AS13335 returned incomplete upstream data; retrying once");
    result = await lookup(query);
  }
  assert.equal(result.status, true, `${query} must succeed`);
  if (query === ".ss") assert.equal(result.source, "whois");
  if (query === "8.8.8.8" || query.includes(":")) {
    assert.notEqual(result.result.netRange, "Unknown", `${query} must contain a network range`);
  }
  if (query === "AS13335") assert.equal(result.result.originAS, "AS13335");
}

const available = await lookup(`next-whois-smoke-${Date.now()}.cc`);
assert.equal(available.available, true, "unregistered domains must show availability");
assert.ok(available.pricing.register.length > 0);
assert.ok(available.pricing.renew.length > 0);

console.log(`Cloudflare smoke checks passed: ${baseUrl}`);
