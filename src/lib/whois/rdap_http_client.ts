import * as http from "node:http";
import * as https from "node:https";
import type { IncomingHttpHeaders } from "node:http";

export type RdapHttpResponse = {
  status: number;
  statusText: string;
  headers: IncomingHttpHeaders;
  body: string;
};

const DEFAULT_RDAP_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;

export function getRdapRequestFamily(): 4 | 6 | undefined {
  const family = (process.env.RDAP_DNS_FAMILY || "4").trim().toLowerCase();

  if (family === "auto" || family === "0" || family === "false") {
    return undefined;
  }

  if (family === "6" || family === "ipv6") {
    return 6;
  }

  return 4;
}

function getRdapTimeoutMs(): number {
  const timeout = Number.parseInt(process.env.RDAP_FETCH_TIMEOUT_MS || "", 10);
  return Number.isFinite(timeout) && timeout > 0
    ? timeout
    : DEFAULT_RDAP_TIMEOUT_MS;
}

export function fetchRdapText(
  url: string,
  headers: Record<string, string>,
  redirectCount = 0,
): Promise<RdapHttpResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === "http:" ? http : https;
    const timeoutMs = getRdapTimeoutMs();
    const family = getRdapRequestFamily();

    const request = client.request(
      target,
      {
        method: "GET",
        headers,
        ...(family ? { family } : {}),
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode || 0;
          const location = response.headers.location;

          if (
            status >= 300 &&
            status < 400 &&
            location &&
            redirectCount < MAX_REDIRECTS
          ) {
            const redirectUrl = new URL(location, target).toString();
            resolve(fetchRdapText(redirectUrl, headers, redirectCount + 1));
            return;
          }

          resolve({
            status,
            statusText: response.statusMessage || "",
            headers: response.headers,
            body,
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(
        new Error(`RDAP request timed out after ${timeoutMs}ms: ${url}`),
      );
    });
    request.on("error", reject);
    request.end();
  });
}

export async function fetchRdapJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetchRdapText(url, headers);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `RDAP HTTP error (${response.status}): ${
        response.body || response.statusText
      }`,
    );
  }

  return JSON.parse(response.body) as T;
}
