const NAZHUMI_API_URL = "https://www.nazhumi.com/api/v1";

type NazhumiOrder = "new" | "renew" | "transfer";
interface NazhumiRegistrar {
  registrar: string;
  registrarname: string;
  registrarweb: string;
  new: number | "n/a";
  renew: number | "n/a";
  transfer: number | "n/a";
  currency: string;
  currencyname: string;
  currencytype: string;
  promocode: boolean;
  updatedtime: string;
}

interface NazhumiResponse {
  domain: string;
  order: "new" | "renew" | "transfer";
  count: number;
  price: NazhumiRegistrar[];
}

export interface DomainPricing extends NazhumiRegistrar {
  isPremium: boolean;
  externalLink: string;
}

const defaultDomainPricing: DomainPricing = {
  registrar: "Unknown",
  registrarname: "Unknown",
  registrarweb: "Unknown",
  new: -1,
  renew: -1,
  transfer: -1,
  currency: "Unknown",
  currencyname: "Unknown",
  currencytype: "Unknown",
  promocode: false,
  updatedtime: "Unknown",
  isPremium: false,
  externalLink: "",
};

function normalizeTld(domain: string): string {
  const raw = domain.trim().toLowerCase();
  const dotIndex = raw.lastIndexOf(".");
  const tld =
    dotIndex >= 0 ? raw.substring(dotIndex + 1) : raw.replace("www.", "");
  return tld.replace(/^\./, "").trim();
}

function toDomainPricing(
  registrar: NazhumiRegistrar,
  domain: string,
  type: NazhumiOrder,
): DomainPricing {
  return {
    ...registrar,
    isPremium:
      typeof registrar.new === "number" &&
      registrar.new > 100 &&
      ["usd", "eur", "cad"].includes(registrar.currency.toLowerCase()),
    externalLink: `https://www.nazhumi.com/domain/${domain}/${type}`,
  };
}

export async function getDomainPricingList(
  domain: string,
  type: NazhumiOrder,
  limit = 5,
): Promise<DomainPricing[]> {
  try {
    const tld = normalizeTld(domain);
    if (!tld) return [];

    const url = `${NAZHUMI_API_URL}?domain=${encodeURIComponent(tld)}&order=${type}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Nazhumi API error: ${response.statusText}`);
      return [];
    }

    const data: NazhumiResponse = await response.json().then((res) => res.data);
    const list = Array.isArray(data?.price) ? data.price : [];

    return list.slice(0, limit).map((item) => toDomainPricing(item, domain, type));
  } catch (error) {
    console.error("Error fetching domain pricing list:", error);
    return [];
  }
}

export async function getDomainPricing(
  domain: string,
  type: NazhumiOrder,
): Promise<DomainPricing | null> {
  const list = await getDomainPricingList(domain, type, 1);
  return list.length > 0 ? list[0] : null;
}
