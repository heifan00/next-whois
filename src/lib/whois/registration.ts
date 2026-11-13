import type { RegistrationContact, RegistrationContacts } from "./types";

export function nullableText(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    /^(?:unknown|n\/?a|null|none|not available|-1)?$/i.test(value.trim())
  )
    return null;
  return value.trim();
}

export function isoDate(value: unknown): string | null {
  const text = nullableText(value);
  if (!text) return null;
  // A timestamp without an offset has no known timezone. Do not use the host's timezone.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) &&
    !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
  )
    return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function parseContacts(entities: any[] = []): RegistrationContacts {
  const contacts: RegistrationContacts = {
    registrant: [],
    technical: [],
    abuse: [],
  };
  function visit(list: any[], depth: number) {
    if (depth > 8) return;
    for (const entity of list) {
      const card: any[] = Array.isArray(entity?.vcardArray?.[1])
        ? entity.vcardArray[1]
        : [];
      const field = (name: string) => {
        const value = card.find(
          (entry) => Array.isArray(entry) && entry[0] === name,
        )?.[3];
        return nullableText(
          Array.isArray(value) ? value.flat().join(", ") : value,
        );
      };
      const address = card.find((entry) => entry?.[0] === "adr");
      const contact: RegistrationContact = {
        handle: nullableText(entity.handle),
        name: field("fn"),
        organization: field("org"),
        email: field("email"),
        phone: field("tel"),
        country:
          nullableText(address?.[1]?.cc) ||
          field("country-name") ||
          nullableText(address?.[3]?.[6]),
      };
      for (const role of ["registrant", "technical", "abuse"] as const) {
        if (entity.roles?.includes(role)) contacts[role].push(contact);
      }
      if (Array.isArray(entity.entities)) visit(entity.entities, depth + 1);
    }
  }
  visit(entities, 0);
  return contacts;
}
