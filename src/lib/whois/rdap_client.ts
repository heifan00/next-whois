import { domain, ip, autnum } from "node-rdap";
import type { WhoisAnalyzeResult } from "./types";
import {
  DEFAULT_RDAP_SERVER,
  parseRdapToWhoisResult,
  type RdapResponse,
} from "./rdap_parser";
export type { RdapResponse } from "./rdap_parser";
import { extractDomain } from "@/lib/utils";
import { applyParams } from "./common_parser";
import { fetchRdapJson, fetchRdapText } from "./rdap_http_client";
import { supplementRegistrarExpiration } from "./registrar_rdap";

const IANA_RDAP_DNS_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const REGISTRY_RDAP_SERVERS: Record<string, string> = {
  ".li": "https://rdap.nic.li",
  ".ch": "https://rdap.nic.ch",
  ".dev": "https://pubapi.registry.google/rdap/",
};

type IanaRdapBootstrap = {
  services?: Array<[string[], string[]]>;
};

let rdapBootstrapPromise: Promise<Map<string, string>> | null = null;

export class RegistryRdapError extends Error {
  constructor(
    public status: number,
    public url: string,
    detail: string,
  ) {
    super(`Registry RDAP error (${status}): ${detail}`);
    this.name = "RegistryRdapError";
  }
}

function isIPAddress(query: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
  return ipv4Regex.test(query) || ipv6Regex.test(query);
}

function isASNumber(query: string): boolean {
  return /^AS\d+$/i.test(query) || /^\d+$/.test(query);
}

function attachRdapServer<T extends object>(data: T, rdapServer: string): T {
  Object.defineProperty(data, "__rdapServer", {
    value: rdapServer,
    enumerable: false,
  });
  return data;
}

function normalizeRdapServer(rdapServer: string): string {
  return rdapServer.endsWith("/") ? rdapServer : `${rdapServer}/`;
}

function getDomainTld(domainToQuery: string): string | undefined {
  const segments = domainToQuery.toLowerCase().split(".").filter(Boolean);
  return segments.at(-1);
}

async function getIanaRdapServers(): Promise<Map<string, string>> {
  if (!rdapBootstrapPromise) {
    rdapBootstrapPromise = fetchRdapJson<IanaRdapBootstrap>(
      IANA_RDAP_DNS_BOOTSTRAP_URL,
      {
        accept: "application/json",
      },
    )
      .then((bootstrap) => {
        const servers = new Map<string, string>();
        for (const service of bootstrap.services || []) {
          const [tlds, urls] = service;
          const rdapServer =
            urls.find((url) => url.startsWith("https://")) || urls[0];
          if (!rdapServer) continue;

          for (const tld of tlds) {
            servers.set(tld.toLowerCase(), normalizeRdapServer(rdapServer));
          }
        }
        return servers;
      })
      .catch((error) => {
        rdapBootstrapPromise = null;
        throw error;
      });
  }

  return rdapBootstrapPromise;
}

async function getRegistryRdapServer(
  domainToQuery: string,
): Promise<string | undefined> {
  const tld = getDomainTld(domainToQuery);
  const knownServer = tld && REGISTRY_RDAP_SERVERS[`.${tld}`];
  if (knownServer) return knownServer;

  if (tld) {
    try {
      const ianaServers = await getIanaRdapServers();
      const ianaServer = ianaServers.get(tld);
      if (ianaServer) return ianaServer;
    } catch (error) {
      console.warn("Failed to load IANA RDAP bootstrap:", error);
    }
  }

  return undefined;
}

async function lookupRegistryRdap(
  domainToQuery: string,
  rdapServer: string,
): Promise<any> {
  const normalizedRdapServer = normalizeRdapServer(rdapServer);
  const url = `${normalizedRdapServer}domain/${encodeURIComponent(
    domainToQuery,
  )}`;
  const res = await fetchRdapText(url, {
    accept: "application/rdap+json,application/json;q=0.9,*/*;q=0.8",
  });

  if (res.status < 200 || res.status >= 300) {
    throw new RegistryRdapError(res.status, url, res.body || res.statusText);
  }

  return attachRdapServer(JSON.parse(res.body), normalizedRdapServer);
}

export async function lookupRdap(query: string): Promise<any> {
  const cleanQuery = query.trim().toLowerCase();

  if (isIPAddress(cleanQuery)) {
    return attachRdapServer(await ip(cleanQuery), DEFAULT_RDAP_SERVER);
  } else if (isASNumber(cleanQuery)) {
    const asNumber = cleanQuery.replace(/^as/i, "");
    return attachRdapServer(
      await autnum(parseInt(asNumber)),
      DEFAULT_RDAP_SERVER,
    );
  } else {
    const domainToQuery = extractDomain(cleanQuery) || cleanQuery;
    // Keep known registries independent of bootstrap outages and stale defaults.
    const registryRdapServer = await getRegistryRdapServer(domainToQuery);
    if (registryRdapServer) {
      return await lookupRegistryRdap(domainToQuery, registryRdapServer);
    }

    return attachRdapServer(await domain(domainToQuery), DEFAULT_RDAP_SERVER);
  }
}

export async function convertRdapToWhoisResult(
  rdapData: RdapResponse,
  originalQuery: string,
): Promise<WhoisAnalyzeResult> {
  const result = parseRdapToWhoisResult(rdapData, originalQuery);
  if (rdapData.ldhName || rdapData.unicodeName) {
    await supplementRegistrarExpiration(result, originalQuery, rdapData.links);
  }
  return await applyParams(result);
}
