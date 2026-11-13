import type { DomainPricing } from "../pricing/client";
import type { QueryType } from "./query";

export type LookupOutcome =
  | "ok"
  | "partial"
  | "invalid_input"
  | "not_found"
  | "upstream_error"
  | "rate_limited";
export type LookupWarning = { code: string; message: string };
export type LookupCache = {
  enabled: boolean;
  hit: boolean;
  storedAt: string | null;
  expiresAt: string | null;
};
export type RegistrationContact = {
  handle: string | null;
  name: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
};
export type RegistrationContacts = {
  registrant: RegistrationContact[];
  technical: RegistrationContact[];
  abuse: RegistrationContact[];
};

export type DomainPricingSummary = {
  register: DomainPricing[];
  renew: DomainPricing[];
};

export type WhoisResult = {
  status: boolean;
  time: number;
  cached?: boolean;
  source?: "rdap" | "whois";
  result?: WhoisAnalyzeResult;
  error?: string;
  available?: boolean;
  pricing?: DomainPricingSummary;
  browserRdapUrl?: string;
  query?: string;
  normalizedQuery?: string | null;
  queryType?: QueryType | null;
  outcome?: LookupOutcome;
  errorCode?: string;
  warnings?: LookupWarning[];
  queriedAt?: string;
  cache?: LookupCache;
  timing?: { totalMs: number };
  retryAfterSeconds?: number;
  rawTruncated?: boolean;
};

export type WhoisAnalyzeResult = {
  domain: string;
  registrar: string;
  registrarURL: string;
  ianaId: string;
  whoisServer: string;
  updatedDate: string;
  creationDate: string;
  expirationDate: string;
  expirationDateSource?: string;
  status: DomainStatusProps[];
  nameServers: string[];
  registrantOrganization: string;
  registrantProvince: string;
  registrantCountry: string;
  registrantPhone: string;
  registrantEmail: string;
  dnssec: string;
  rawWhoisContent: string;
  rawRdapContent?: string;

  // Domain age and expiration
  domainAge: number | null;
  remainingDays: number | null;

  // Domain pricing
  registerPrice: DomainPricing | null;
  renewPrice: DomainPricing | null;
  transferPrice: DomainPricing | null;

  // Moz statistics
  mozDomainAuthority: number;
  mozPageAuthority: number;
  mozSpamScore: number;

  cidr: string;
  inetNum: string;
  inet6Num: string;
  netRange: string;
  netName: string;
  netType: string;
  originAS: string;
  cidrs?: string[];
  startAddress?: string | null;
  endAddress?: string | null;
  contacts?: RegistrationContacts;
  handle?: string | null;
  asNumber?: number | null;
  asName?: string | null;
  allocationRegistry?: string | null;
  description?: string[];
  mentionedASNs?: string[];
};

export type DomainStatusProps = {
  status: string;
  url: string;
};

export const initialWhoisAnalyzeResult: WhoisAnalyzeResult = {
  domain: "",
  registrar: "Unknown",
  registrarURL: "Unknown",
  ianaId: "N/A",
  whoisServer: "Unknown",
  updatedDate: "Unknown",
  creationDate: "Unknown",
  expirationDate: "Unknown",
  status: [],
  nameServers: [],
  registrantOrganization: "Unknown",
  registrantProvince: "Unknown",
  registrantCountry: "Unknown",
  registrantPhone: "Unknown",
  registrantEmail: "Unknown",
  dnssec: "",
  rawWhoisContent: "",

  // Domain age and expiration
  domainAge: null,
  remainingDays: null,

  // Domain pricing
  registerPrice: null,
  renewPrice: null,
  transferPrice: null,

  // Moz statistics
  mozDomainAuthority: 0,
  mozPageAuthority: 0,
  mozSpamScore: 0,

  cidr: "Unknown",
  inetNum: "Unknown",
  inet6Num: "Unknown",
  netRange: "Unknown",
  netName: "Unknown",
  netType: "Unknown",
  originAS: "Unknown",
};
