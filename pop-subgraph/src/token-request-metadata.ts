import { Bytes, dataSource, json, BigInt, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { TokenRequestMetadata } from "../generated/schema";
import { jsonToBigInt } from "./json-utils";

/**
 * Handler for IPFS file data source that parses token request metadata JSON.
 *
 * Expected JSON structure:
 * {
 *   reason: "Justification for the token request",
 *   submittedAt: 1706812800  // unix timestamp
 * }
 */
export function handleTokenRequestMetadata(content: Bytes): void {
  let ipfsCid = dataSource.stringParam();

  // No context is read here. This entity writes no owner pointer, so the spawning site passes
  // no context at all — that is what lets graph-node's (template, CID, context) dedup collapse
  // repeat references to one data source instead of double-INSERTing this immutable id.
  // File data sources have no block context, so indexedAt is fixed at 0 (as in org-metadata.ts).
  let existing = TokenRequestMetadata.load(ipfsCid);
  if (existing != null) {
    return;
  }

  let metadata = new TokenRequestMetadata(ipfsCid);
  metadata.indexedAt = BigInt.fromI32(0);

  // Try to parse the JSON content
  let jsonResult = json.try_fromBytes(content);
  if (jsonResult.isError) {
    log.warning("[TokenRequestMetadata] Failed to parse JSON for CID: {}", [ipfsCid]);
    metadata.save();
    return;
  }

  let jsonValue = jsonResult.value;
  if (jsonValue.isNull() || jsonValue.kind != JSONValueKind.OBJECT) {
    metadata.save();
    return;
  }

  let jsonObject = jsonValue.toObject();

  // Parse reason
  let reasonValue = jsonObject.get("reason");
  if (reasonValue != null && !reasonValue.isNull() && reasonValue.kind == JSONValueKind.STRING) {
    metadata.reason = reasonValue.toString();
  }

  // Parse submittedAt
  let submittedAt = jsonToBigInt(jsonObject.get("submittedAt"));
  if (submittedAt !== null) {
    metadata.submittedAt = submittedAt;
  }

  metadata.save();
}
