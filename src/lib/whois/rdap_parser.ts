import type { WhoisAnalyzeResult, DomainStatusProps } from "./types";
import moment from "moment";

export const DEFAULT_RDAP_SERVER = "https://rdap.org";

export interface RdapResponse {
  __rdapServer?: string;
  handle?: string;
  ldhName?: string;
  unicodeName?: string;
  links?: Array<{ href: string; rel?: string; type?: string }>;
  entities?: Array<{
    handle?: string;
    roles?: string[];
    vcardArray?: any[];
    url?: string;
    publicIds?: Array<{
      type: string;
      identifier: string;
    }>;
  }>;
  nameservers?: Array<{
    ldhName?: string;
    unicodeName?: string;
  }>;
  status?: string[];
  events?: Array<{
    eventAction: string;
    eventDate: string;
  }>;
  secureDNS?: {
    delegationSigned?: boolean;
    dsData?: Array<{
      keyTag?: number;
      algorithm?: number;
      digest?: string;
      digestType?: number;
    }>;
  };
  notices?: Array<{
    title?: string;
    description?: string[];
    links?: Array<{
      href: string;
      rel?: string;
      type?: string;
    }>;
  }>;
  startAddress?: string;
  endAddress?: string;
  ipVersion?: string;
  name?: string;
  type?: string;
  country?: string;
  parentHandle?: string;
  startAutnum?: string | number;
  endAutnum?: string | number;
}

function extractVcardField(vcardArray: any[], fieldName: string): string {
  if (!vcardArray || !Array.isArray(vcardArray)) return "Unknown";

  for (const entry of vcardArray) {
    if (Array.isArray(entry) && entry[0] === fieldName) {
      return Array.isArray(entry[3])
        ? entry[3].join(", ")
        : String(entry[3] || "Unknown");
    }
  }
  return "Unknown";
}

function parseRdapEntity(entities: any[]): {
  registrar: string;
  registrarURL: string;
  ianaId: string;
  registrantOrganization: string;
  registrantCountry: string;
  registrantProvince: string;
  registrantPhone: string;
  registrantEmail: string;
} {
  let registrar = "Unknown";
  let registrarURL = "Unknown";
  let ianaId = "N/A";
  let registrantOrganization = "Unknown";
  let registrantCountry = "Unknown";
  let registrantProvince = "Unknown";
  let registrantPhone = "Unknown";
  let registrantEmail = "Unknown";

  for (const entity of entities) {
    if (entity.roles?.includes("registrar")) {
      if (entity.vcardArray?.[1]) {
        const name = extractVcardField(entity.vcardArray[1], "fn");
        registrar =
          name !== "Unknown"
            ? name
            : extractVcardField(entity.vcardArray[1], "org");
      }
      registrarURL = entity.url || registrarURL;

      if (entity.publicIds) {
        const ianaEntry = entity.publicIds.find(
          (pub: any) => pub.type === "IANA Registrar ID",
        );
        if (ianaEntry) {
          ianaId = ianaEntry.identifier;
        }
      }
    }

    if (entity.roles?.includes("registrant") && entity.vcardArray?.[1]) {
      registrantOrganization =
        extractVcardField(entity.vcardArray[1], "org") ||
        registrantOrganization;
      registrantCountry =
        extractVcardField(entity.vcardArray[1], "country-name") ||
        registrantCountry;
      registrantProvince =
        extractVcardField(entity.vcardArray[1], "region") || registrantProvince;
      registrantPhone =
        extractVcardField(entity.vcardArray[1], "tel") || registrantPhone;
      registrantEmail =
        extractVcardField(entity.vcardArray[1], "email") || registrantEmail;
    }
  }

  return {
    registrar,
    registrarURL,
    ianaId,
    registrantOrganization,
    registrantCountry,
    registrantProvince,
    registrantPhone,
    registrantEmail,
  };
}

export function findExpirationEvent(events: RdapResponse["events"] = []) {
  const datedEvents = events.filter((event) =>
    Number.isFinite(Date.parse(event.eventDate)),
  );
  return (
    datedEvents.find((event) => event.eventAction === "expiration") ||
    datedEvents.find((event) => event.eventAction === "registrar expiration")
  );
}

export function parseRdapToWhoisResult(
  rdapData: any,
  originalQuery: string,
): WhoisAnalyzeResult {
  const entities = rdapData.entities || [];
  const entityData = parseRdapEntity(entities);

  const events = rdapData.events || [];
  const creationEvent = events.find(
    (e: any) => e.eventAction === "registration",
  );
  const updateEvent = events.find((e: any) => e.eventAction === "last changed");
  const expirationEvent = findExpirationEvent(events);

  const creationDate = creationEvent?.eventDate || "Unknown";
  const updatedDate = updateEvent?.eventDate || "Unknown";
  const expirationDate = expirationEvent?.eventDate || "Unknown";

  const domainAge =
    creationDate !== "Unknown" && Number.isFinite(Date.parse(creationDate))
      ? moment().diff(moment(creationDate), "years")
      : null;
  const remainingDays =
    expirationDate !== "Unknown" && Number.isFinite(Date.parse(expirationDate))
      ? Math.max(0, moment(expirationDate).diff(moment(), "days"))
      : null;

  const status: DomainStatusProps[] = (rdapData.status || []).map((s: any) => ({
    status: s,
    url: "https://icann.org/epp",
  }));

  const nameServers = (rdapData.nameservers || []).map(
    (ns: any) => ns.ldhName || ns.unicodeName || "Unknown",
  );

  const result = {
    domain: rdapData.ldhName || rdapData.unicodeName || originalQuery,
    registrar: entityData.registrar,
    registrarURL: entityData.registrarURL,
    ianaId: entityData.ianaId,
    whoisServer: rdapData.__rdapServer || DEFAULT_RDAP_SERVER,
    updatedDate,
    creationDate,
    expirationDate,
    status,
    nameServers,
    registrantOrganization: entityData.registrantOrganization,
    registrantProvince: entityData.registrantProvince,
    registrantCountry: entityData.registrantCountry,
    registrantPhone: entityData.registrantPhone,
    registrantEmail: entityData.registrantEmail,
    dnssec: rdapData.secureDNS?.delegationSigned
      ? "signedDelegation"
      : "unsigned",
    rawWhoisContent: "",
    rawRdapContent: JSON.stringify(rdapData, null, 2),
    domainAge,
    remainingDays,
    registerPrice: null,
    renewPrice: null,
    transferPrice: null,
    mozDomainAuthority: 0,
    mozPageAuthority: 0,
    mozSpamScore: 0,
    cidr:
      rdapData.startAddress && rdapData.endAddress
        ? `${rdapData.startAddress}-${rdapData.endAddress}`
        : "Unknown",
    inetNum: rdapData.startAddress || "Unknown",
    inet6Num:
      rdapData.ipVersion === "v6"
        ? rdapData.startAddress || "Unknown"
        : "Unknown",
    netRange:
      rdapData.startAddress && rdapData.endAddress
        ? `${rdapData.startAddress} - ${rdapData.endAddress}`
        : "Unknown",
    netName: rdapData.name || "Unknown",
    netType: rdapData.type || "Unknown",
    originAS: rdapData.startAutnum ? `AS${rdapData.startAutnum}` : "Unknown",
  };

  return result;
}
