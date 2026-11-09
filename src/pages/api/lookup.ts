import type { NextApiRequest, NextApiResponse } from "next";
import { lookupWhoisWithCache } from "@/lib/whois/lookup";
import type { WhoisResult } from "@/lib/whois/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WhoisResult>,
) {
  const { query } = req.query;

  if (!query || typeof query !== "string" || query.length === 0) {
    return res
      .status(400)
      .json({ time: -1, status: false, error: "Query is required" });
  }

  const data = await lookupWhoisWithCache(query);
  if (!data.status && !data.available) {
    return res.status(data.browserRdapUrl ? 503 : 500).json(data);
  }

  return res.status(200).json(data);
}
