import { fetchRdapJson, fetchRdapText } from "./rdap_http_client";
import { parseAddress, parseCidr } from "./address";
import { LookupError, parseRetryAfter } from "./lookup_policy";
import type { ParsedQuery } from "./query";

const RIR_HOSTS = new Set([
  "rdap.arin.net",
  "rdap.apnic.net",
  "rdap.db.ripe.net",
  "rdap.lacnic.net",
  "rdap.afrinic.net",
  "rdap.registro.br",
]);
type Bootstrap = { services: Array<[string[], string[]]> };
const bootstraps = new Map<
  string,
  { expires: number; promise: Promise<Bootstrap> }
>();

function trustedServer(input: string): URL {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !RIR_HOSTS.has(url.hostname)
  )
    throw new LookupError(
      "UNTRUSTED_REFERRAL",
      "The RDAP referral is not a supported registry endpoint.",
    );
  return url;
}

export async function lookupNetworkRdap(query: ParsedQuery) {
  const deadline = Date.now() + 12000;
  const asn =
    query.queryType === "asn" ? Number(query.normalizedQuery.slice(2)) : null;
  const address =
    asn === null ? parseAddress(query.normalizedQuery.split("/")[0])! : null;
  const kind = asn !== null ? "asn" : address!.bits === 32 ? "ipv4" : "ipv6";
  let cached = bootstraps.get(kind);
  if (!cached || cached.expires < Date.now()) {
    cached = {
      expires: Date.now() + 86400000,
      promise: fetchRdapJson<Bootstrap>(
        `https://data.iana.org/rdap/${kind}.json`,
        { accept: "application/json" },
        { deadline, sameOriginRedirects: true },
      ).catch((error) => {
        bootstraps.delete(kind);
        throw error;
      }),
    };
    bootstraps.set(kind, cached);
  }
  const bootstrap = await cached.promise;
  let selected: string | undefined,
    longest = -1;
  for (const [ranges, servers] of bootstrap.services || []) {
    for (const range of ranges) {
      let score = -1;
      if (asn !== null) {
        const [low, high = low] = range.split("-").map(Number);
        if (asn >= low && asn <= high) score = 0;
      } else {
        const cidr = parseCidr(range);
        if (
          cidr &&
          cidr.bits === address!.bits &&
          address!.value >= cidr.start &&
          address!.value <= cidr.end
        )
          score = cidr.prefix;
      }
      if (score > longest) {
        selected = servers.find((url) => {
          try {
            trustedServer(url);
            return true;
          } catch {
            return false;
          }
        });
        if (selected) longest = score;
      }
    }
  }
  if (!selected)
    throw new LookupError(
      "RIR_NOT_FOUND",
      "No responsible RIR could be discovered.",
    );
  let url = new URL(
    `${selected.replace(/\/$/, "")}/${asn === null ? "ip" : "autnum"}/${asn === null ? query.normalizedQuery : asn}`,
  );
  const visited = new Set<string>();
  for (let hop = 0; hop <= 3; hop++) {
    trustedServer(url.href);
    if (visited.has(url.href))
      throw new LookupError(
        "REFERRAL_LOOP",
        "The RDAP referral repeated an endpoint.",
      );
    visited.add(url.href);
    const response = await fetchRdapText(
      url.href,
      { accept: "application/rdap+json,application/json" },
      { deadline, maxRedirects: 0 },
    );
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.location
    ) {
      url = new URL(response.headers.location, url);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new LookupError(
        `RDAP_${response.status}`,
        "The RIR RDAP service returned an error.",
        response.status,
        parseRetryAfter(response.headers["retry-after"]),
      );
    }
    const data = JSON.parse(response.body);
    Object.defineProperty(data, "__rdapServer", {
      value: url.href,
      enumerable: false,
    });
    return data;
  }
  throw new LookupError(
    "REFERRAL_LIMIT",
    "The RDAP referral limit was exceeded.",
  );
}
