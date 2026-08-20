const baseUrl = process.env.LOOKUP_BASE_URL || "http://127.0.0.1:3001";

const cases = [
  {
    query: "nic.li",
    domain: "nic.li",
    rdapServer: "https://rdap.nic.li/",
  },
  {
    query: "google.ss",
    domain: "google.ss",
    rdapServer: "https://rdap.nic.ss/",
  },
];

const fallbackCases = [
  {
    query: ".ss",
    domain: ".ss",
    source: "whois",
  },
];

for (const testCase of cases) {
  const url = new URL("/api/lookup", baseUrl);
  url.searchParams.set("query", testCase.query);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Expected HTTP 200 for ${testCase.query}, got ${response.status}`,
    );
  }

  const body = await response.json();

  if (body.status !== true) {
    throw new Error(
      `Expected ${testCase.query} lookup to succeed: ${JSON.stringify(body)}`,
    );
  }

  if (body.source !== "rdap") {
    throw new Error(`Expected ${testCase.query} to use RDAP, got ${body.source}`);
  }

  if (body.result?.domain?.toLowerCase() !== testCase.domain) {
    throw new Error(
      `Expected ${testCase.domain} domain, got ${body.result?.domain}`,
    );
  }

  if (body.result?.whoisServer !== testCase.rdapServer) {
    throw new Error(
      `Expected ${testCase.rdapServer} RDAP server, got ${body.result?.whoisServer}`,
    );
  }
}

for (const testCase of fallbackCases) {
  const url = new URL("/api/lookup", baseUrl);
  url.searchParams.set("query", testCase.query);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Expected HTTP 200 for ${testCase.query}, got ${response.status}`,
    );
  }

  const body = await response.json();

  if (body.status !== true) {
    throw new Error(
      `Expected ${testCase.query} lookup to succeed: ${JSON.stringify(body)}`,
    );
  }

  if (body.source !== testCase.source) {
    throw new Error(
      `Expected ${testCase.query} to use ${testCase.source}, got ${body.source}`,
    );
  }

  if (body.result?.domain?.toLowerCase() !== testCase.domain) {
    throw new Error(
      `Expected ${testCase.domain} domain, got ${body.result?.domain}`,
    );
  }
}

console.log("ccTLD lookups verified");
