const baseUrl = process.env.LOOKUP_BASE_URL || "http://127.0.0.1:3001";
const url = new URL("/api/lookup", baseUrl);
url.searchParams.set("query", "nic.li");

const response = await fetch(url, {
  headers: { accept: "application/json" },
});

if (!response.ok) {
  throw new Error(`Expected HTTP 200, got ${response.status}`);
}

const body = await response.json();

if (body.status !== true) {
  throw new Error(`Expected nic.li lookup to succeed: ${JSON.stringify(body)}`);
}

if (body.source !== "rdap") {
  throw new Error(`Expected nic.li to use RDAP, got ${body.source}`);
}

if (body.result?.domain?.toLowerCase() !== "nic.li") {
  throw new Error(`Expected nic.li domain, got ${body.result?.domain}`);
}

if (body.result?.whoisServer !== "https://rdap.nic.li") {
  throw new Error(
    `Expected NIC.LI RDAP server, got ${body.result?.whoisServer}`,
  );
}

console.log("nic.li RDAP lookup verified");
