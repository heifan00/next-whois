import { MAX_WHOIS_FOLLOW } from "@/lib/env";
import { DomainPricingSummary, WhoisResult } from "@/lib/whois/types";
import { getJsonRedisValue, setJsonRedisValue } from "@/lib/server/redis";
import { analyzeWhois } from "@/lib/whois/common_parser";
import { extractDomain } from "@/lib/utils";
import { lookupRdap, convertRdapToWhoisResult } from "@/lib/whois/rdap_client";
import whois from "whois-raw";
import { getDomainPricingList } from "@/lib/pricing/client";

function isDomainQuery(query: string): boolean {
  return !!extractDomain(query);
}

function isRdapNotFoundError(err: unknown): boolean {
  if (!err) return false;
  const message = (
    err instanceof Error ? err.message : String(err ?? "")
  ).toLowerCase();
  return (
    message.includes("rdap error (404)") ||
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("no entries found")
  );
}

function isWhoisAvailableResponse(data: string): boolean {
  const msg = data.toLowerCase();
  return (
    msg.includes("domain or tld not found") ||
    (msg.includes("no match") && msg.includes("domain")) ||
    (msg.includes("no entries found") && msg.includes("domain")) ||
    msg.includes("status: available") ||
    msg.includes("available for registration")
  );
}

async function getAvailabilityPricing(
  domain: string,
): Promise<DomainPricingSummary> {
  const [register, renew] = await Promise.all([
    getDomainPricingList(domain, "register"),
    getDomainPricingList(domain, "renew"),
  ]);
  return { register, renew };
}

function buildAvailableResult(
  domain: string,
  startTime: number,
  pricing?: DomainPricingSummary,
): WhoisResult {
  return {
    time: (performance.now() - startTime) / 1000,
    status: false,
    cached: false,
    available: true,
    pricing,
    error: "Domain is available for registration",
  };
}

function getLookupOptions(domain: string) {
  const isDomain = !!extractDomain(domain);
  const lower = domain.trim().toLowerCase();

  // Some ccTLDs are not covered by the underlying whois server map.
  // Provide explicit servers to ensure lookup works.
  const server =
    lower.endsWith(".li") || lower === "nic.li"
      ? "whois.nic.li"
      : lower.endsWith(".ch") || lower === "nic.ch"
        ? "whois.nic.ch"
        : undefined;
  return {
    follow: isDomain ? MAX_WHOIS_FOLLOW : 0,
    ...(server ? { server } : {}),
  };
}

function getLookupRawWhois(domain: string, options?: any): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      whois.lookup(domain, options, (err: Error, data: string) => {
        if (err) {
          // reject err like tld error
          reject(err);
        } else {
          resolve(data);
        }
      });
    } catch (e) {
      // reject err like connection error
      reject(e);
    }
  });
}

export async function lookupWhoisWithCache(
  domain: string,
): Promise<WhoisResult> {
  const key = `whois:${domain}`;
  const cached = await getJsonRedisValue<WhoisResult>(key);
  if (cached) {
    return {
      ...cached,
      time: 0,
      cached: true,
    };
  }

  const result = await lookupWhois(domain);
  if (result.status || result.available) {
    await setJsonRedisValue<WhoisResult>(key, result);
  }

  return {
    ...result,
    cached: false,
  };
}

export async function lookupWhois(domain: string): Promise<WhoisResult> {
  const startTime = performance.now();

  try {
    const rdapData = await lookupRdap(domain);
    const result = await convertRdapToWhoisResult(rdapData, domain);

    return {
      time: (performance.now() - startTime) / 1000,
      status: true,
      cached: false,
      source: "rdap",
      result,
    };
  } catch (rdapError: unknown) {
    const isDomain = isDomainQuery(domain);
    if (isDomain && isRdapNotFoundError(rdapError)) {
      const pricing = await getAvailabilityPricing(domain);
      return buildAvailableResult(domain, startTime, pricing);
    }

    console.log("RDAP lookup failed, fallback to WHOIS:", rdapError);

    try {
      const whoisData = await getLookupRawWhois(
        domain,
        getLookupOptions(domain),
      );
      if (isDomain && isWhoisAvailableResponse(whoisData)) {
        const pricing = await getAvailabilityPricing(domain);
        return buildAvailableResult(domain, startTime, pricing);
      }
      const result = await analyzeWhois(whoisData);
      if (!result.domain) {
        result.domain = domain;
      }

      return {
        time: (performance.now() - startTime) / 1000,
        status: true,
        cached: false,
        source: "whois",
        result,
      };
    } catch (whoisError: unknown) {
      const errorMessage =
        whoisError instanceof Error
          ? whoisError.message
          : "Unknown error occurred";
      return {
        time: (performance.now() - startTime) / 1000,
        status: false,
        cached: false,
        source: "whois",
        error: errorMessage,
      };
    }
  }
}
