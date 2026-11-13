import { parseAddress, parseCidr } from "./address";
import type { ParsedQuery } from "./query";
import type { LookupOutcome } from "./types";
import { domainToASCII } from "node:url";

export class LookupError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LookupError";
  }
}

export function parseRetryAfter(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

export function validateRdap(data: any, query: ParsedQuery): void {
  if (data?.errorCode)
    throw new LookupError(
      `RDAP_${data.errorCode}`,
      "The RDAP service returned an error.",
      Number(data.errorCode),
    );
  if (!data || typeof data !== "object")
    throw new LookupError(
      "INVALID_UPSTREAM_RESPONSE",
      "The RDAP service did not return a registration object.",
    );
  let matches = false;
  if (query.queryType === "domain") {
    const name = data.ldhName || data.unicodeName;
    matches =
      typeof name === "string" &&
      domainToASCII(name.replace(/\.$/, "")).toLowerCase() ===
        query.normalizedQuery;
  } else if (query.queryType === "asn") {
    const asn = Number(query.normalizedQuery.slice(2));
    // An allocation block is not the requested autonomous system object.
    matches =
      Number(data.startAutnum) === asn && Number(data.endAutnum) === asn;
  } else {
    const requestedRange =
      query.queryType === "cidr" ? parseCidr(query.normalizedQuery) : null;
    const requested = requestedRange || parseAddress(query.normalizedQuery);
    const start = parseAddress(data.startAddress || ""),
      end = parseAddress(data.endAddress || "");
    if (
      requested &&
      start &&
      end &&
      requested.bits === start.bits &&
      start.bits === end.bits
    ) {
      const low = requestedRange ? requestedRange.start : requested.value;
      const high = requestedRange ? requestedRange.end : requested.value;
      matches = start.value <= low && end.value >= high;
    }
  }
  if (!matches)
    throw new LookupError(
      "INCOMPLETE_RDAP_OBJECT",
      "The RDAP response does not identify the requested object.",
    );
}

export function classifyWhois(text: string, query: ParsedQuery): LookupOutcome {
  if (!text.trim()) return "upstream_error";
  const ripeCode = text.match(/^\s*%\s*ERROR:\s*(\d+)\b/im)?.[1];
  if (ripeCode === "101") return "not_found";
  if (ripeCode === "202") return "rate_limited";
  if (
    /(?:rate.?limit|query limit|quota exceeded|too many (?:requests|queries)|maximum.*queries|WHOIS LIMIT EXCEEDED)/i.test(
      text,
    )
  )
    return "rate_limited";
  if (
    /^\s*(?:%\s*)?(?:error\s*:|invalid (?:query|input)|access denied|service unavailable)/im.test(
      text,
    )
  )
    return "upstream_error";
  if (
    /^\s*(?:%\s*)?(?:no match(?:\s|!|:)|not found\b|no (?:entries|objects|data) found\b|domain (?:name )?not found\b|status:\s*(?:free|available)\b)/im.test(
      text,
    )
  )
    return "not_found";
  if (query.queryType === "domain") {
    const names = [
      ...text.matchAll(
        /^\s*(?:domain(?:\s+name)?|\[domain name\])\s*[:.]?\s*([^\s]+)/gim,
      ),
    ].map((match) => domainToASCII(match[1].replace(/\.$/, "")).toLowerCase());
    if (names.includes(query.normalizedQuery)) return "ok";
    if (names.length) return "upstream_error";
  } else if (query.queryType === "asn") {
    const numbers = [
      ...text.matchAll(/^\s*(?:aut-num|ASNumber)\s*:\s*(?:AS)?(\d+)\s*$/gim),
    ].map((match) => Number(match[1]));
    if (numbers.includes(Number(query.normalizedQuery.slice(2)))) return "ok";
    if (numbers.length) return "upstream_error";
  } else {
    const fields = [
      ...text.matchAll(
        /^\s*(?:inetnum|inet6num|netrange|cidr)\s*:\s*([^\r\n]+)/gim,
      ),
    ];
    const requestedRange = parseCidr(query.normalizedQuery);
    const requested = requestedRange || parseAddress(query.normalizedQuery);
    if (!requested) return "upstream_error";
    const low = requestedRange?.start ?? requested.value;
    const high = requestedRange?.end ?? requested.value;
    for (const field of fields) {
      for (const value of field[1].split(/,\s*/)) {
        const cidr = parseCidr(value.trim());
        const [first, last = first] = value.trim().split(/\s*-\s*/);
        const start = parseAddress(first),
          end = parseAddress(last);
        if (
          cidr &&
          cidr.bits === requested.bits &&
          cidr.start <= low &&
          cidr.end >= high
        )
          return "ok";
        if (
          start &&
          end &&
          start.bits === requested.bits &&
          end.bits === requested.bits &&
          start.value <= low &&
          end.value >= high
        )
          return "ok";
      }
    }
    if (fields.length) return "upstream_error";
  }
  return /^\s*(?:refer|whois|as-block|organisation|netname|registrar|domain status)\s*:/im.test(
    text,
  )
    ? "partial"
    : "upstream_error";
}

export function errorDetails(error: unknown): {
  outcome: LookupOutcome;
  errorCode: string;
  error: string;
  retryAfterSeconds?: number;
} {
  const value = error as
    | {
        status?: number;
        code?: string;
        message?: string;
        retryAfterSeconds?: number;
      }
    | undefined;
  const status = value?.status;
  if (status === 429)
    return {
      outcome: "rate_limited",
      errorCode: "UPSTREAM_RATE_LIMITED",
      error:
        "The registration service is rate limiting requests. Try again later.",
      ...(value?.retryAfterSeconds
        ? { retryAfterSeconds: value.retryAfterSeconds }
        : {}),
    };
  if (status === 404)
    return {
      outcome: "not_found",
      errorCode: "NO_MATCH",
      error:
        "No matching registration record was found. This does not confirm availability for registration.",
    };
  if (
    status === 504 ||
    /timeout|timed out|ETIMEDOUT|AbortError/i.test(
      `${value?.code} ${value?.message}`,
    )
  )
    return {
      outcome: "upstream_error",
      errorCode: "UPSTREAM_TIMEOUT",
      error: "The registration service did not respond before the timeout.",
    };
  return {
    outcome: "upstream_error",
    errorCode:
      value?.code === "INCOMPLETE_RDAP_OBJECT" ? value.code : "UPSTREAM_ERROR",
    error: "The registration service failed or returned an invalid response.",
  };
}

export function outcomeHttpStatus(
  outcome?: LookupOutcome,
  errorCode?: string,
): number {
  if (outcome === "invalid_input") return 400;
  if (outcome === "rate_limited") return 429;
  if (outcome === "upstream_error")
    return errorCode === "UPSTREAM_TIMEOUT" ? 504 : 502;
  return 200;
}
