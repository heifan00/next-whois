import type { DomainPricingSummary, WhoisResult } from "./types";
import { parseRdapToWhoisResult } from "./rdap_parser";

export async function lookupBrowserRdap(
  url: string,
  pricing?: DomainPricingSummary,
  signal?: AbortSignal,
): Promise<WhoisResult> {
  const startTime = performance.now();
  const target = new URL(url);
  const domain = decodeURIComponent(target.pathname.split("/").at(-1) || "");
  const response = await fetch(url, {
    headers: { accept: "application/rdap+json,application/json;q=0.9" },
    credentials: "omit",
    signal,
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Registry RDAP error (${response.status})`);
  }

  const data = await response.json();
  const time = (performance.now() - startTime) / 1000;
  if (response.status === 404 && data.errorCode === 404) {
    return {
      status: false,
      available: true,
      cached: false,
      source: "rdap",
      time,
      pricing,
    };
  }
  if (
    !response.ok ||
    (data.ldhName || data.unicodeName)?.toLowerCase() !== domain.toLowerCase()
  ) {
    throw new Error("Registry RDAP response does not match the queried domain");
  }

  const result = parseRdapToWhoisResult(data, domain);
  result.whoisServer = url.slice(0, url.lastIndexOf("/domain/") + 1);
  result.registerPrice = pricing?.register[0] || null;
  result.renewPrice = pricing?.renew[0] || null;
  return { status: true, cached: false, source: "rdap", result, time };
}
