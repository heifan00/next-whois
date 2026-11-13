import { domainToASCII } from "node:url";
import { getDomain } from "tldjs";
import { formatAddress, parseAddress, parseCidr } from "./address";

export type QueryType = "domain" | "ipv4" | "ipv6" | "asn" | "cidr";
export type ParsedQuery = { queryType: QueryType; normalizedQuery: string };

export function normalizeQuery(input: string): ParsedQuery | null {
  if (!input || input.length > 512) return null;
  const query = input.trim();
  if (!query || /[\s\x00-\x1f\x7f]/.test(query)) return null;
  if (query.includes("/")) {
    const cidr = parseCidr(query);
    return cidr ? { queryType: "cidr", normalizedQuery: cidr.cidr } : null;
  }
  const address = parseAddress(query);
  if (address)
    return {
      queryType: address.bits === 32 ? "ipv4" : "ipv6",
      normalizedQuery: formatAddress(address.value, address.bits),
    };
  if (/^(?:AS)?\d+$/i.test(query)) {
    const number = Number(query.replace(/^as/i, ""));
    return Number.isInteger(number) && number > 0 && number <= 4294967295
      ? { queryType: "asn", normalizedQuery: `AS${number}` }
      : null;
  }
  if (/[\/:@?#\[\]\\]/.test(query) || /^[\d.]+$/.test(query)) return null;
  const ascii = domainToASCII(query.replace(/\.$/, "")).toLowerCase();
  const labels = ascii.split(".");
  if (
    ascii.length > 253 ||
    labels.length < 2 ||
    labels.some(
      (label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label),
    ) ||
    /^\d+$/.test(labels.at(-1)!)
  )
    return null;
  return { queryType: "domain", normalizedQuery: getDomain(ascii) || ascii };
}
