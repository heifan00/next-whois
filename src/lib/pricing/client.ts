const NAZHUMI_API_URL = "https://www.nazhumi.com/api/v1";

export type NazhumiOrder = "register" | "renew" | "transfer";
type PriceAmount = number | "n/a";
interface NazhumiRegistrar {
  registrar: string;
  registrarname: string;
  registrarweb: string;
  register: PriceAmount;
  renew: PriceAmount;
  transfer: PriceAmount;
  register_cny?: PriceAmount;
  renew_cny?: PriceAmount;
  transfer_cny?: PriceAmount;
  currency: string;
  currencyname: string;
  currencytype: string;
  promocode: Record<NazhumiOrder, boolean>;
  updatedtime: string;
}

interface NazhumiResponse {
  code: number;
  data?: {
    domain: string;
    order: NazhumiOrder;
    count: number;
    price: NazhumiRegistrar[];
  };
}

export interface DomainPricing extends NazhumiRegistrar {
  isPremium: boolean;
  externalLink: string;
}

function isPriceAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function formatDomainPrice(
  price: DomainPricing,
  type: NazhumiOrder,
  displayCurrency: "original" | "cny",
): string | null {
  const amount = price[type];
  if (!isPriceAmount(amount)) return null;

  const currency = (price.currency || "").trim().toUpperCase();
  if (displayCurrency === "cny") {
    const cnyAmount = price[`${type}_cny`];
    if (isPriceAmount(cnyAmount)) return `${cnyAmount.toFixed(2)} CNY`;
    if (currency === "CNY" || currency === "RMB") {
      return `${amount.toFixed(2)} CNY`;
    }
  }
  return `${amount} ${currency}`.trim();
}

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
      isPriceAmount(registrar.register) &&
      registrar.register > 100 &&
      ["usd", "eur", "cad"].includes((registrar.currency || "").toLowerCase()),
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

    const url = `${NAZHUMI_API_URL}?domain=${encodeURIComponent(tld)}&order=${type}&limit=${limit}&page=1`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Nazhumi API error: ${response.statusText}`);
      return [];
    }

    const body: NazhumiResponse = await response.json();
    if (body?.code !== 100) return [];
    const list = Array.isArray(body.data?.price) ? body.data.price : [];

    return list
      .filter((item) => item && isPriceAmount(item[type]))
      .slice(0, limit)
      .map((item) => toDomainPricing(item, tld, type));
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
