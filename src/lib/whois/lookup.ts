import { MAX_WHOIS_FOLLOW } from "@/lib/env";
import type { DomainPricingSummary, WhoisResult } from "./types";
import {
  getJsonRedisValue,
  setJsonRedisValue,
  REDIS_CACHE_TTL,
  redis,
} from "@/lib/server/redis";
import { analyzeWhois } from "@/lib/whois/common_parser";
import {
  lookupRdap,
  convertRdapToWhoisResult,
  RegistryRdapError,
} from "@/lib/whois/rdap_client";
import whois from "whois-raw";
import { getDomainPricingList } from "@/lib/pricing/client";
import { normalizeQuery, type ParsedQuery } from "./query";
import { classifyWhois, errorDetails, validateRdap } from "./lookup_policy";
import { lookupNetworkWhois } from "./network_whois";

async function getAvailabilityPricing(
  domain: string,
): Promise<DomainPricingSummary> {
  const [register, renew] = await Promise.all([
    getDomainPricingList(domain, "register"),
    getDomainPricingList(domain, "renew"),
  ]);
  return { register, renew };
}

function getLookupRawWhois(domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = domain.endsWith(".li")
      ? "whois.nic.li"
      : domain.endsWith(".ch")
        ? "whois.nic.ch"
        : undefined;
    const timer = setTimeout(
      () => reject(new Error("WHOIS lookup timed out")),
      10000,
    );
    try {
      // Keep the existing domain follow policy. RIR referrals use the bounded client.
      whois.lookup(
        domain,
        {
          follow: Math.min(Math.max(MAX_WHOIS_FOLLOW, 0), 3),
          timeout: 5000,
          ...(server ? { server } : {}),
        },
        (error: Error, data: string) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(data);
        },
      );
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

function measured(
  result: WhoisResult,
  input: string,
  parsed: ParsedQuery | null,
  start: number,
): WhoisResult {
  const totalMs = Math.round((performance.now() - start) * 100) / 100;
  return {
    ...result,
    query: input,
    normalizedQuery: parsed?.normalizedQuery ?? null,
    queryType: parsed?.queryType ?? null,
    time: totalMs / 1000,
    timing: { totalMs },
    queriedAt: result.queriedAt || new Date().toISOString(),
    warnings: result.warnings || [],
  };
}

export async function lookupWhoisWithCache(
  input: string,
): Promise<WhoisResult> {
  const start = performance.now();
  const parsed = normalizeQuery(input);
  if (!parsed) return lookupWhois(input);
  // New namespace prevents previously cached false successes from surviving the fix.
  const key = `whois:v2:${parsed.queryType}:${parsed.normalizedQuery}`;
  const enabled = !!redis && REDIS_CACHE_TTL > 0;
  const emptyCache = { enabled, hit: false, storedAt: null, expiresAt: null };
  if (enabled) {
    try {
      const cached = await getJsonRedisValue<WhoisResult>(key);
      if (
        cached?.outcome === "ok" &&
        cached.cache?.expiresAt &&
        Date.parse(cached.cache.expiresAt) > Date.now()
      )
        return measured(
          { ...cached, cached: true, cache: { ...cached.cache, hit: true } },
          input,
          parsed,
          start,
        );
    } catch {
      /* Cache outages must not prevent an upstream lookup. */
    }
  }
  const result = await lookupWhois(input);
  let cache: WhoisResult["cache"] = emptyCache;
  if (enabled && result.outcome === "ok") {
    const now = Date.now();
    const storedCache = {
      enabled,
      hit: false,
      storedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + REDIS_CACHE_TTL * 1000).toISOString(),
    };
    const saved = await setJsonRedisValue(key, {
      ...result,
      cache: storedCache,
    });
    if (saved) cache = storedCache;
  }
  return measured({ ...result, cached: false, cache }, input, parsed, start);
}

export async function lookupWhois(input: string): Promise<WhoisResult> {
  const start = performance.now();
  const parsed = normalizeQuery(input);
  const finish = (result: Omit<WhoisResult, "time">) =>
    measured({ time: 0, cached: false, ...result }, input, parsed, start);
  if (!parsed)
    return finish({
      status: false,
      outcome: "invalid_input",
      errorCode: "INVALID_QUERY",
      error:
        "Provide a domain, IPv4, IPv6, ASN (1–4294967295), or CIDR. URLs, empty input and malformed addresses are not supported.",
    });
  const domain = parsed.normalizedQuery;
  let rdapFailure: ReturnType<typeof errorDetails>;
  try {
    const rdap = await lookupRdap(domain);
    validateRdap(rdap, parsed);
    const result = await convertRdapToWhoisResult(rdap, domain);
    return finish({ status: true, outcome: "ok", source: "rdap", result });
  } catch (error) {
    rdapFailure = errorDetails(error);
    if (
      rdapFailure.outcome === "not_found" ||
      rdapFailure.outcome === "rate_limited"
    ) {
      const isDomain = parsed.queryType === "domain";
      const pricing = isDomain
        ? await getAvailabilityPricing(domain)
        : undefined;
      const browserRdapUrl =
        error instanceof RegistryRdapError &&
        error.status === 429 &&
        new URL(error.url).hostname === "pubapi.registry.google"
          ? error.url
          : undefined;
      return finish({
        status: false,
        source: "rdap",
        ...rdapFailure,
        ...(isDomain && rdapFailure.outcome === "not_found"
          ? { available: true }
          : {}),
        ...(pricing ? { pricing } : {}),
        ...(browserRdapUrl ? { browserRdapUrl } : {}),
      });
    }
  }
  try {
    const response =
      parsed.queryType === "domain"
        ? {
            text: await getLookupRawWhois(domain),
            server: undefined,
            warning: undefined,
            allocationRegistry: undefined,
          }
        : await lookupNetworkWhois(parsed);
    const outcome = classifyWhois(response.text, parsed);
    if (
      outcome === "not_found" ||
      outcome === "rate_limited" ||
      outcome === "upstream_error"
    ) {
      const failure = errorDetails({
        status:
          outcome === "not_found"
            ? 404
            : outcome === "rate_limited"
              ? 429
              : 502,
      });
      return finish({
        status: false,
        source: "whois",
        ...failure,
        ...(outcome === "not_found" && parsed.queryType === "domain"
          ? { available: true, pricing: await getAvailabilityPricing(domain) }
          : {}),
      });
    }
    const result = await analyzeWhois(
      response.text,
      parsed.queryType === "domain" ? domain : undefined,
    );
    result.domain ||= domain;
    if (response.server) result.whoisServer = response.server;
    if (response.allocationRegistry)
      result.allocationRegistry = response.allocationRegistry;
    const warnings = response.warning
      ? [response.warning]
      : outcome === "partial"
        ? [
            {
              code: "INCOMPLETE_OBJECT",
              message:
                "The response contains allocation or referral information, but the final object could not be confirmed.",
            },
          ]
        : [];
    return finish({
      status: true,
      outcome: warnings.length ? "partial" : "ok",
      source: "whois",
      result,
      warnings,
    });
  } catch (error) {
    const failure = errorDetails(error);
    return finish({
      status: false,
      source: "whois",
      ...(failure.errorCode === "UPSTREAM_ERROR" &&
      rdapFailure.errorCode === "UPSTREAM_TIMEOUT"
        ? rdapFailure
        : failure),
    });
  }
}
