import type { ParsedQuery } from "./query";
import type { RegistrationContact, RegistrationContacts } from "./types";
import { parseAddress, parseCidr } from "./address";
import { hasContactData, nullableText } from "./registration";

type RecordBlock = { fields: Map<string, string[]>; lines: string[] };
const value = (block: RecordBlock | undefined, key: string) =>
  nullableText(block?.fields.get(key)?.[0]);
const isResource = (block: RecordBlock) =>
  block.fields.has("asnumber") || block.fields.has("netrange");

function records(data: string): RecordBlock[] {
  const result: RecordBlock[] = [];
  let block: RecordBlock = { fields: new Map(), lines: [] };
  const flush = () => {
    if (block.lines.length) result.push(block);
    block = { fields: new Map(), lines: [] };
  };
  for (const line of data.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const match = line.match(/^\s*([a-z][\w-]*):[ \t]*(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    // Record identities also delimit compact replies without blank lines.
    if (
      ["asnumber", "netrange", "orgname"].includes(key) ||
      /^(?:org|r)(?:tech|abuse|noc|routing)handle$/.test(key)
    )
      flush();
    block.lines.push(line.trim());
    block.fields.set(key, [...(block.fields.get(key) || []), match[2].trim()]);
  }
  flush();
  return result;
}

function matches(block: RecordBlock, query?: ParsedQuery): boolean {
  if (!query) return isResource(block);
  if (query.queryType === "asn")
    return (
      Number(value(block, "asnumber")?.replace(/^as/i, "")) ===
      Number(query.normalizedQuery.slice(2))
    );
  const requestedCidr = parseCidr(query.normalizedQuery);
  const requested = requestedCidr || parseAddress(query.normalizedQuery);
  const [low, high] = (value(block, "netrange") || "").split(/\s*-\s*/);
  const start = parseAddress(low || ""),
    end = parseAddress(high || "");
  return !!(
    requested &&
    start &&
    end &&
    requested.bits === start.bits &&
    start.bits === end.bits &&
    start.value <= (requestedCidr?.start ?? requested.value) &&
    end.value >= (requestedCidr?.end ?? requested.value)
  );
}

export function scopeArinWhois(data: string, query?: ParsedQuery) {
  if (query?.queryType === "domain") return null;
  const blocks = records(data);
  if (!blocks.some(isResource)) return null;
  const candidates = blocks.filter(
    (block) => isResource(block) && matches(block, query),
  );
  if (query && query.queryType !== "asn") {
    const rangeSize = (block: RecordBlock) => {
      const [low, high] = value(block, "netrange")!.split(/\s*-\s*/);
      return parseAddress(high)!.value - parseAddress(low)!.value;
    };
    candidates.sort((a, b) =>
      rangeSize(a) < rangeSize(b) ? -1 : rangeSize(a) > rangeSize(b) ? 1 : 0,
    );
  }
  const resource = candidates[0];
  if (!resource)
    throw new Error("ARIN response does not contain the queried resource");

  const sectionAfter = (
    block: RecordBlock,
    stop: (next: RecordBlock) => boolean,
  ) => {
    const start = blocks.indexOf(block) + 1;
    const end = blocks.findIndex((next, index) => index >= start && stop(next));
    return blocks.slice(start, end < 0 ? undefined : end);
  };
  const resourceSection = sectionAfter(resource, isResource);
  const organizations = blocks.filter((block) => block.fields.has("orgname"));
  const relatedOrganizations = resourceSection.filter((block) =>
    block.fields.has("orgname"),
  );
  const orgId = value(resource, "orgid");
  const organization = orgId
    ? organizations.find((block) => value(block, "orgid") === orgId)
    : relatedOrganizations.length === 1
      ? relatedOrganizations[0]
      : organizations.length === 1
        ? organizations[0]
        : undefined;
  const organizationSection = organization
    ? sectionAfter(
        organization,
        (block) => isResource(block) || block.fields.has("orgname"),
      )
    : [];
  const contacts: RegistrationContacts = {
    registrant: [],
    technical: [],
    abuse: [],
  };
  if (organization) {
    const registrant: RegistrationContact = {
      handle: value(organization, "orgid"),
      name: value(organization, "orgname"),
      organization: value(organization, "orgname"),
      email: null,
      phone: null,
      country: value(organization, "country"),
    };
    if (hasContactData(registrant)) contacts.registrant.push(registrant);
  }
  for (const [role, suffix] of [
    ["technical", "tech"],
    ["abuse", "abuse"],
  ] as const) {
    // Resource contacts take precedence over duplicate organization contacts.
    for (const [prefix, section] of [
      [`r${suffix}`, resourceSection],
      [`org${suffix}`, organizationSection],
    ] as const) {
      for (const block of section) {
        const contact: RegistrationContact = {
          handle: value(block, `${prefix}handle`),
          name: value(block, `${prefix}name`),
          organization: null,
          email: value(block, `${prefix}email`),
          phone: value(block, `${prefix}phone`),
          country: value(block, `${prefix}country`),
        };
        if (!hasContactData(contact)) continue;
        const duplicate = contacts[role].find((existing) =>
          contact.handle
            ? existing.handle === contact.handle
            : JSON.stringify(existing) === JSON.stringify(contact),
        );
        if (duplicate) {
          for (const key of Object.keys(contact) as Array<
            keyof RegistrationContact
          >)
            duplicate[key] ||= contact[key];
        } else contacts[role].push(contact);
      }
    }
  }
  const organizationFields = organization
    ? [
        `OrgName: ${value(organization, "orgname") || ""}`,
        `Country: ${value(organization, "country") || ""}`,
        `Registrant State/Province: ${value(organization, "stateprov") || ""}`,
      ]
    : [];
  return {
    // Only the resource's dates enter the generic field parser. Other object
    // dates remain available in rawWhoisContent without changing their meaning.
    text: [...resource.lines, ...organizationFields].join("\n"),
    handle: value(resource, "ashandle") || value(resource, "nethandle"),
    contacts,
    description: (resource.fields.get("comment") || []).filter((line) =>
      nullableText(line),
    ),
  };
}
