import { domainToASCII } from "node:url";
import { extractDomain } from "@/lib/utils";
import { fetchRdapText } from "./rdap_http_client";
import { findExpirationEvent, type RdapResponse } from "./rdap_parser";
import type { WhoisAnalyzeResult } from "./types";

const IANA_REGISTRAR_DIRECTORY =
  "https://www.iana.org/assignments/registrar-ids/registrar-ids-1.csv";
const DIRECTORY_TTL_MS = 24 * 60 * 60 * 1000;
const DIRECTORY_RETRY_MS = 60 * 1000;
const VERIFIED_REGISTRAR_SERVERS = new Map([
  ["dynadot.com", "https://rdap.dynadot.com/"],
  ["eurodns.com", "https://rdap.eurodns.com/"],
  ["gandi.net", "https://rdap.gandi.net/"],
]);

type RegistrarDirectory = {
  byId: Map<string, string>;
  byName: Map<string, string | null>;
  servers: Set<string>;
};

let directoryCache:
  | {
      value?: RegistrarDirectory;
      refreshAfter: number;
    }
  | undefined;

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeDomain(domain: string): string {
  return domainToASCII(domain.trim().replace(/\.$/, "")).toLowerCase();
}

function parseRdapUrl(value: string): URL | undefined {
  if (!URL.canParse(value)) return;
  const url = new URL(value);
  if (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  ) {
    return url;
  }
}

function parseRegistrarDirectory(csv: string): RegistrarDirectory {
  const byId = new Map<string, string>();
  const byName = new Map<string, string | null>();
  const servers = new Set<string>();
  // IANA CSV columns are ID, registrar name, accreditation status, and RDAP base URL.
  const activeRegistrarRow =
    /^(\d+),(?:"((?:[^"]|"")*)"|([^,]*)),Accredited,("[^"]+"|[^,]+)$/;

  for (const line of csv.split(/\r?\n/)) {
    const row = activeRegistrarRow.exec(line);
    if (!row) continue;
    const [, id, quotedName, plainName, baseUrl] = row;
    const base = parseRdapUrl(baseUrl.replace(/^"|"$/g, ""));
    if (!base) continue;
    if (!base.pathname.endsWith("/")) base.pathname += "/";

    const name = normalizeName(quotedName?.replace(/""/g, '"') ?? plainName);
    const previousServer = byName.get(name);
    byId.set(id, base.href);
    byName.set(
      name,
      previousServer === undefined || previousServer === base.href
        ? base.href
        : null,
    );
    servers.add(base.href);
  }

  return { byId, byName, servers };
}

async function getRegistrarDirectory(): Promise<
  RegistrarDirectory | undefined
> {
  if (directoryCache && directoryCache.refreshAfter > Date.now()) {
    return directoryCache.value;
  }

  try {
    const response = await fetchRdapText(
      IANA_REGISTRAR_DIRECTORY,
      { accept: "text/csv" },
      { sameOriginRedirects: true },
    );
    if (response.status !== 200) {
      throw new Error(
        `IANA registrar directory returned HTTP ${response.status}`,
      );
    }
    const value = parseRegistrarDirectory(response.body);
    if (value.byId.size === 0)
      throw new Error("IANA registrar directory was empty");
    directoryCache = { value, refreshAfter: Date.now() + DIRECTORY_TTL_MS };
  } catch (error) {
    console.warn("Could not refresh the IANA registrar directory:", error);
    directoryCache = {
      value: directoryCache?.value,
      refreshAfter: Date.now() + DIRECTORY_RETRY_MS,
    };
  }

  return directoryCache.value;
}

async function resolveRegistrarServer(
  result: WhoisAnalyzeResult,
  domain: string,
  links: NonNullable<RdapResponse["links"]>,
): Promise<string | undefined> {
  if (URL.canParse(result.registrarURL)) {
    const website = new URL(result.registrarURL).hostname.replace(/^www\./, "");
    const verifiedServer = VERIFIED_REGISTRAR_SERVERS.get(website);
    if (verifiedServer) return verifiedServer;
  }

  const registrarId = String(result.ianaId).trim();
  const registrarName = normalizeName(result.registrar);
  const referrals = links.filter(
    (link) => link.rel === "related" && link.type === "application/rdap+json",
  );
  if (
    !/^\d+$/.test(registrarId) &&
    (!registrarName || registrarName === "unknown") &&
    referrals.length === 0
  ) {
    return;
  }

  const directory = await getRegistrarDirectory();
  if (!directory) return;
  const serverById = directory.byId.get(registrarId);
  if (serverById) return serverById;

  const domainPath = `/domain/${domain}`;
  for (const referral of referrals) {
    const url = parseRdapUrl(referral.href);
    if (!url?.pathname.toLowerCase().endsWith(domainPath)) continue;
    url.pathname = `${url.pathname.slice(0, -domainPath.length)}/`;
    if (directory.servers.has(url.href)) return url.href;
  }

  return directory.byName.get(registrarName) ?? undefined;
}

export async function supplementRegistrarExpiration(
  result: WhoisAnalyzeResult,
  query: string,
  links: NonNullable<RdapResponse["links"]> = [],
): Promise<void> {
  if (Number.isFinite(Date.parse(result.expirationDate))) return;
  const domain = normalizeDomain(result.domain);
  if (
    !domain.includes(".") ||
    domain !== normalizeDomain(extractDomain(query) ?? query)
  )
    return;

  try {
    const server = await resolveRegistrarServer(result, domain, links);
    if (!server) return;

    const source = `${server}domain/${encodeURIComponent(domain)}`;
    const response = await fetchRdapText(
      source,
      { accept: "application/rdap+json,application/json;q=0.9" },
      { sameOriginRedirects: true },
    );
    if (response.status !== 200) return;

    const data: RdapResponse = JSON.parse(response.body);
    if (normalizeDomain(data.ldhName || data.unicodeName || "") !== domain)
      return;
    const event = findExpirationEvent(data.events);
    if (!event) return;

    result.expirationDate = /^\d{4}-\d{2}-\d{2}$/.test(event.eventDate)
      ? event.eventDate
      : new Date(event.eventDate).toISOString().replace(/\.000Z$/, "Z");
    result.expirationDateSource = source;
  } catch (error) {
    console.warn("Registrar RDAP expiry lookup failed:", error);
  }
}
