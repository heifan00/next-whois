import { createConnection } from "node:net";
import type { ParsedQuery } from "./query";
import type { LookupWarning } from "./types";
import { LookupError } from "./lookup_policy";

const SERVERS = new Set([
  "whois.iana.org",
  "whois.arin.net",
  "whois.ripe.net",
  "whois.apnic.net",
  "whois.lacnic.net",
  "whois.afrinic.net",
  "whois.registro.br",
]);

export function normalizeWhoisReferral(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `whois://${value}`);
    return url.protocol === "whois:" &&
      (!url.port || url.port === "43") &&
      !url.username &&
      !url.password &&
      (!url.pathname || url.pathname === "/") &&
      !url.search &&
      !url.hash &&
      SERVERS.has(url.hostname.toLowerCase())
      ? url.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function readWhoisServer(
  server: string,
  query: string,
  deadline: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!SERVERS.has(server))
      return reject(
        new LookupError("UNTRUSTED_REFERRAL", "Unsupported WHOIS referral."),
      );
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      return reject(
        new LookupError("UPSTREAM_TIMEOUT", "WHOIS timed out.", 504),
      );
    const socket = createConnection({ host: server, port: 43, family: 4 });
    const timer = setTimeout(
      () =>
        socket.destroy(
          new LookupError("UPSTREAM_TIMEOUT", "WHOIS timed out.", 504),
        ),
      Math.min(5000, remaining),
    );
    let text = "",
      size = 0;
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${query}\r\n`));
    socket.on("data", (chunk: string) => {
      size += Buffer.byteLength(chunk);
      if (size > 1024 * 1024)
        socket.destroy(
          new LookupError(
            "UPSTREAM_TOO_LARGE",
            "WHOIS response exceeds 1 MiB.",
          ),
        );
      else text += chunk;
    });
    socket.on("error", reject);
    socket.on("close", (failed) => {
      clearTimeout(timer);
      if (!failed) resolve(text);
    });
  });
}

export async function lookupNetworkWhois(
  query: ParsedQuery,
  read = readWhoisServer,
): Promise<{
  text: string;
  server: string;
  allocationRegistry?: string;
  warning?: LookupWarning;
}> {
  const deadline = Date.now() + 10000;
  const visited = new Set<string>();
  let server = "whois.iana.org",
    text = "",
    allocationRegistry: string | undefined;
  const partial = (code: string, message: string) => ({
    text,
    server: [...visited].at(-1) || server,
    ...(allocationRegistry ? { allocationRegistry } : {}),
    warning: { code, message },
  });
  for (let hop = 0; hop <= 3; hop++) {
    if (visited.has(server))
      return partial("REFERRAL_LOOP", "The WHOIS referral repeated a server.");
    visited.add(server);
    try {
      text = await read(
        server,
        server === "whois.iana.org"
          ? query.normalizedQuery.split("/")[0]
          : query.normalizedQuery,
        deadline,
      );
    } catch (error) {
      if (!text) throw error;
      return partial(
        "REFERRAL_FAILED",
        "A WHOIS referral could not be completed before the lookup deadline.",
      );
    }
    const allocation = text.match(/^organisation:\s*Assigned by (.+)$/im);
    if (allocation) allocationRegistry = allocation[1].trim();
    const referral = text.match(
      /^\s*(?:refer|whois|ReferralServer):\s*(\S+)/im,
    )?.[1];
    if (!referral)
      return {
        text,
        server,
        ...(allocationRegistry ? { allocationRegistry } : {}),
      };
    const next = normalizeWhoisReferral(referral);
    if (!next)
      return partial(
        "UNTRUSTED_REFERRAL",
        "The WHOIS referral was outside the supported RIR servers or port 43.",
      );
    if (hop === 3)
      return partial(
        "REFERRAL_LIMIT",
        "The maximum of three WHOIS referrals was reached.",
      );
    server = next;
  }
  return partial("REFERRAL_LIMIT", "The WHOIS referral limit was reached.");
}
