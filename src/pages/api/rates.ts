import type { NextApiRequest, NextApiResponse } from "next";

type RatesResponse = {
  base: string;
  rates: Record<string, number>;
  date?: string;
};

let cachedRates: RatesResponse | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const base = (req.query.base as string | undefined) || "USD";
  const now = Date.now();

  if (cachedRates && cachedRates.base === base && now - cachedAt < CACHE_TTL_MS) {
    return res.status(200).json(cachedRates);
  }

  try {
    // MoneyConvert provides a free, no-auth latest rates endpoint with USD base.
    const url = "https://cdn.moneyconvert.net/api/latest.json";
    const response = await fetch(url);
    if (!response.ok) {
      return res
        .status(502)
        .json({ error: "Upstream rates API error" });
    }
    const data = (await response.json()) as RatesResponse;
    if (!data?.rates) {
      return res.status(502).json({ error: "Invalid rates response" });
    }

    // Normalize base to USD if upstream returns a different case.
    cachedRates = { ...data, base: data.base?.toUpperCase?.() || "USD" };
    cachedAt = now;
    return res.status(200).json(cachedRates);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch rates" });
  }
}
