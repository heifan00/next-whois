import type { WhoisResult, WhoisAnalyzeResult } from "./types";
import { isoDate, nullableText } from "./registration";

export const RAW_LIMIT_BYTES = 64 * 1024;
const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const emptyContacts = () => ({ registrant: [], technical: [], abuse: [] });

function domainData(result: WhoisAnalyzeResult) {
  return {
    domain: nullableText(result.domain),
    registrar: nullableText(result.registrar),
    registrarUrl: nullableText(result.registrarURL),
    ianaId: nullableText(result.ianaId),
    creationDate: isoDate(result.creationDate),
    updatedDate: isoDate(result.updatedDate),
    expirationDate: isoDate(result.expirationDate),
    expirationDateSource: nullableText(result.expirationDateSource),
    domainAge: numberOrNull(result.domainAge),
    remainingDays: numberOrNull(result.remainingDays),
    status: result.status.map((entry) => ({
      status: nullableText(entry.status),
      url: nullableText(entry.url),
    })),
    nameServers: result.nameServers.filter((name) => nullableText(name)),
    registrantOrganization: nullableText(result.registrantOrganization),
    registeredCountry: nullableText(result.registrantCountry),
    dnssec: nullableText(result.dnssec),
    contacts: result.contacts || emptyContacts(),
    moz: {
      domainAuthority: numberOrNull(result.mozDomainAuthority),
      pageAuthority: numberOrNull(result.mozPageAuthority),
      spamScore: numberOrNull(result.mozSpamScore),
    },
  };
}

function networkData(result: WhoisAnalyzeResult, asn: boolean) {
  const common = {
    handle: nullableText(result.handle),
    registeredOrganization: nullableText(result.registrantOrganization),
    registeredCountry: nullableText(result.registrantCountry),
    geolocation: null,
    registrationDate: isoDate(result.creationDate),
    updatedDate: isoDate(result.updatedDate),
    contacts: result.contacts || emptyContacts(),
    description: result.description || [],
  };
  if (asn)
    return {
      ...common,
      asNumber: numberOrNull(result.asNumber),
      asName: nullableText(result.asName),
      allocationRegistry: nullableText(result.allocationRegistry),
    };
  return {
    ...common,
    cidrs: result.cidrs || [],
    startAddress: nullableText(result.startAddress),
    endAddress: nullableText(result.endAddress),
    netRange: nullableText(result.netRange),
    netName: nullableText(result.netName),
    netType: nullableText(result.netType),
    routing: {
      mentionedASNs: result.mentionedASNs || [],
      mentionSource: result.mentionedASNs?.length ? "rdap.remarks" : null,
      whoisOriginAS: nullableText(result.originAS),
      bgpConfirmedASNs: [],
      bgpSource: null,
    },
  };
}

function pricingData(response: WhoisResult) {
  if (response.queryType !== "domain") return null;
  const offers: object[] = [];
  const result = response.result;
  for (const operation of ["register", "renew", "transfer"] as const) {
    const rows =
      operation === "register"
        ? response.pricing?.register
        : operation === "renew"
          ? response.pricing?.renew
          : undefined;
    const prices =
      rows ||
      (result?.[`${operation}Price`] ? [result[`${operation}Price`]!] : []);
    for (const price of prices) {
      const row = price as unknown as Record<string, any>;
      offers.push({
        operation,
        registrar:
          nullableText(row.registrarname) || nullableText(row.registrar),
        registrarUrl: nullableText(row.registrarweb),
        amount: numberOrNull(row[operation]),
        currency: nullableText(row.currency)?.toUpperCase() || null,
        amountCny: numberOrNull(row[`${operation}_cny`]),
        effectiveAmountCny: numberOrNull(row[`${operation}_eff_cny`]),
        conversion: {
          source: "nazhumi",
          exchangeRate: null,
          effectivePriceFormula: null,
        },
        billingPeriodYears: null,
        premiumChecked: false,
        isPremium: null,
        promotion: {
          codeRequired:
            typeof row.promocode?.[operation] === "boolean"
              ? row.promocode[operation]
              : null,
          code: null,
          newCustomersOnly: null,
          restrictions: [],
        },
        updatedAt: isoDate(row.updatedtime),
        sourceUpdatedAtText: nullableText(row.updatedtime),
        sourceTimezone: null,
        source: "https://www.nazhumi.com",
        sourceUrl: nullableText(row.externalLink),
      });
    }
  }
  return {
    scope: "tld",
    tld: response.normalizedQuery?.split(".").at(-1) || null,
    domainSpecific: false,
    registrationAvailability: null,
    offers,
  };
}

export function rawData(result?: WhoisAnalyzeResult) {
  const whois = result?.rawWhoisContent || "";
  const rdap = result?.rawRdapContent || "";
  const whoisBytes = Buffer.byteLength(whois),
    rdapBytes = Buffer.byteLength(rdap);
  const truncated = whoisBytes + rdapBytes > RAW_LIMIT_BYTES;
  const rdapBudget = Math.max(
    0,
    RAW_LIMIT_BYTES - Math.min(whoisBytes, RAW_LIMIT_BYTES),
  );
  let rdapObject: unknown = null;
  if (rdap && rdapBytes <= rdapBudget) {
    try {
      rdapObject = JSON.parse(rdap);
    } catch {
      /* Report text as a preview instead of invalid JSON. */
    }
  }
  return {
    whois: whois
      ? Buffer.from(whois)
          .subarray(0, RAW_LIMIT_BYTES)
          .toString("utf8")
          .replace(/\uFFFD$/, "")
      : null,
    rdap: rdapObject,
    rdapPreview:
      rdap && rdapObject === null
        ? Buffer.from(rdap)
            .subarray(0, rdapBudget)
            .toString("utf8")
            .replace(/\uFFFD$/, "")
        : null,
    truncated,
    originalBytes: whoisBytes + rdapBytes,
    limitBytes: RAW_LIMIT_BYTES,
  };
}

export function toLookupV2(response: WhoisResult, includeRaw = false) {
  return {
    query: response.query ?? "",
    normalizedQuery: response.normalizedQuery ?? null,
    queryType: response.queryType ?? null,
    outcome: response.outcome || "upstream_error",
    source: response.source
      ? {
          protocol: response.source,
          server: nullableText(response.result?.whoisServer),
        }
      : null,
    data: response.result
      ? response.queryType === "domain"
        ? domainData(response.result)
        : networkData(response.result, response.queryType === "asn")
      : null,
    error: response.error
      ? {
          code: response.errorCode || "UPSTREAM_ERROR",
          message: response.error,
        }
      : null,
    warnings: response.warnings || [],
    queriedAt: response.queriedAt || new Date().toISOString(),
    cache: response.cache || {
      enabled: false,
      hit: false,
      storedAt: null,
      expiresAt: null,
    },
    timing: response.timing || { totalMs: Math.max(0, response.time * 1000) },
    pricing: pricingData(response),
    ...(response.retryAfterSeconds
      ? { retryAfterSeconds: response.retryAfterSeconds }
      : {}),
    ...(includeRaw ? { raw: rawData(response.result) } : {}),
  };
}

export function toLegacyResponse(
  response: WhoisResult,
  includeRaw = true,
): WhoisResult {
  if (!response.result) return response;
  const { rawWhoisContent, rawRdapContent, ...fields } = response.result;
  if (!includeRaw) return { ...response, result: fields as WhoisAnalyzeResult };
  const raw = rawData(response.result);
  return {
    ...response,
    rawTruncated: raw.truncated,
    result: {
      ...fields,
      rawWhoisContent: raw.whois || "",
      ...(rawRdapContent
        ? {
            rawRdapContent:
              raw.rdapPreview || JSON.stringify(raw.rdap, null, 2),
          }
        : {}),
    },
  };
}
