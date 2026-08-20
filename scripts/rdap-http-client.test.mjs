import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

const client = await import("../src/lib/whois/rdap_http_client.ts");

test("RDAP HTTP client defaults outbound lookups to IPv4", () => {
  const previous = process.env.RDAP_DNS_FAMILY;
  delete process.env.RDAP_DNS_FAMILY;

  try {
    assert.equal(client.getRdapRequestFamily(), 4);
  } finally {
    if (previous === undefined) {
      delete process.env.RDAP_DNS_FAMILY;
    } else {
      process.env.RDAP_DNS_FAMILY = previous;
    }
  }
});

test("RDAP HTTP client can read a response body", async () => {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const response = await client.fetchRdapText(
      `http://127.0.0.1:${address.port}/rdap`,
      { accept: "application/json" },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body, '{"ok":true}');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
