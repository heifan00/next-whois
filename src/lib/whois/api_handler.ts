import type { NextApiRequest, NextApiResponse } from "next";
import { lookupWhoisWithCache } from "./lookup";
import { toLegacyResponse, toLookupV2 } from "./api_response";
import { outcomeHttpStatus } from "./lookup_policy";
import type { WhoisResult } from "./types";

export function createLookupHandler(version: 1 | 2) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    const start = performance.now();
    const { query, includeRaw } = req.query;
    const send = (
      data: WhoisResult,
      status = outcomeHttpStatus(data.outcome, data.errorCode),
    ) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-App-Version", process.env.APP_VERSION || "development");
      if (data.retryAfterSeconds)
        res.setHeader("Retry-After", String(data.retryAfterSeconds));
      return res
        .status(status)
        .json(
          version === 2
            ? toLookupV2(data, includeRaw === "true")
            : toLegacyResponse(data, includeRaw !== "false"),
        );
    };
    const failure = (code: string, message: string, status = 400) =>
      send(
        {
          status: false,
          time: 0,
          outcome: "invalid_input",
          errorCode: code,
          error: message,
          query: typeof query === "string" ? query : "",
        },
        status,
      );
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return failure("METHOD_NOT_ALLOWED", "Use GET for lookup requests.", 405);
    }
    if (typeof query !== "string" || !query.trim())
      return failure(
        "INVALID_QUERY",
        "Exactly one non-empty query parameter is required.",
      );
    if (
      includeRaw !== undefined &&
      includeRaw !== "true" &&
      includeRaw !== "false"
    )
      return failure("INVALID_PARAMETER", "includeRaw must be true or false.");
    try {
      return send(await lookupWhoisWithCache(query));
    } catch {
      return send({
        status: false,
        time: (performance.now() - start) / 1000,
        query,
        outcome: "upstream_error",
        errorCode: "UPSTREAM_ERROR",
        error: "The lookup could not be completed. Try again later.",
      });
    }
  };
}
