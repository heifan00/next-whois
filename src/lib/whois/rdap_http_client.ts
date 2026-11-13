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
type RdapRequestOptions = {
  sameOriginRedirects?: boolean;
  deadline?: number;
  maxRedirects?: number;
};

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
  options: RdapRequestOptions = {},
  redirectCount = 0,
): Promise<RdapHttpResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.username ||
      target.password
    )
      return reject(new Error("Unsupported RDAP URL"));
    const deadline = options.deadline ?? Date.now() + getRdapTimeoutMs();
    if (deadline <= Date.now())
      return reject(new Error("RDAP request timed out"));
    const client = target.protocol === "http:" ? http : https;
    const timeoutMs = Math.min(getRdapTimeoutMs(), deadline - Date.now());
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
        let size = 0;

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          size += Buffer.byteLength(chunk);
          if (size > 2 * 1024 * 1024) {
            request.destroy(new Error("RDAP response exceeds 2 MiB"));
            return;
          }
          body += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode || 0;
          const location = response.headers.location;

          if (
            status >= 300 &&
            status < 400 &&
            location &&
            redirectCount < (options.maxRedirects ?? MAX_REDIRECTS) &&
            URL.canParse(location, target)
          ) {
            const redirect = new URL(location, target);
            if (
              !options.sameOriginRedirects ||
              (redirect.origin === target.origin &&
                !redirect.username &&
                !redirect.password)
            ) {
              resolve(
                fetchRdapText(
                  redirect.href,
                  headers,
                  { ...options, deadline },
                  redirectCount + 1,
                ),
              );
              return;
            }
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

    const timer = setTimeout(() => {
      request.destroy(
        new Error(`RDAP request timed out after ${timeoutMs}ms: ${url}`),
      );
    }, timeoutMs);
    request.on("close", () => clearTimeout(timer));
    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.end();
  });
}

export async function fetchRdapJson<T>(
  url: string,
  headers: Record<string, string>,
  options: RdapRequestOptions = {},
): Promise<T> {
  const response = await fetchRdapText(url, headers, options);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `RDAP HTTP error (${response.status}): ${
        response.body || response.statusText
      }`,
    );
  }

  return JSON.parse(response.body) as T;
}
