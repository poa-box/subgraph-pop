import { Bytes, dataSource, json, BigInt, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { ProposalMetadata } from "../generated/schema";

/**
 * Handler for IPFS file data source that parses proposal metadata JSON.
 *
 * Expected JSON structure:
 * {
 *   description: "Full proposal description text",
 *   optionNames: ["Option A", "Option B", "Option C"],
 *   createdAt: 1706812800000
 * }
 *
 * ProposalMetadata is immutable — the entity store only allows INSERT, not UPDATE.
 * Uses proposalEntityId (from DataSourceContext) as the entity ID instead of CID,
 * so each proposal gets its own metadata entity. This avoids INSERT conflicts when
 * two proposals share the same CID but land in different blocks (which run in
 * separate offchain causality regions in specVersion >= 1.0.0).
 */
export function handleProposalMetadata(content: Bytes): void {
  let context = dataSource.context();
  let proposalEntityId = context.getString("proposalEntityId");

  // Immutable — skip if already exists
  let existing = ProposalMetadata.load(proposalEntityId);
  if (existing != null) {
    return;
  }

  let metadata = new ProposalMetadata(proposalEntityId);
  metadata.description = "";
  metadata.optionNames = [];

  // Try to parse the JSON content
  let jsonResult = json.try_fromBytes(content);
  if (jsonResult.isError) {
    log.warning("[ProposalMetadata] Failed to parse JSON for proposal: {}", [proposalEntityId]);
    metadata.save();
    return;
  }

  let jsonValue = jsonResult.value;
  if (jsonValue.isNull() || jsonValue.kind != JSONValueKind.OBJECT) {
    metadata.save();
    return;
  }

  let jsonObject = jsonValue.toObject();

  // Parse description
  let descriptionValue = jsonObject.get("description");
  if (descriptionValue != null && !descriptionValue.isNull() && descriptionValue.kind == JSONValueKind.STRING) {
    metadata.description = descriptionValue.toString();
  }

  // Parse optionNames array
  let optionNamesValue = jsonObject.get("optionNames");
  if (optionNamesValue != null && !optionNamesValue.isNull() && optionNamesValue.kind == JSONValueKind.ARRAY) {
    let namesArray = optionNamesValue.toArray();
    let names: string[] = [];
    for (let i = 0; i < namesArray.length; i++) {
      let nameValue = namesArray[i];
      if (!nameValue.isNull() && nameValue.kind == JSONValueKind.STRING) {
        names.push(nameValue.toString());
      } else {
        names.push("");
      }
    }
    metadata.optionNames = names;
  }

  // Parse optional actionSummaries array (human-readable summaries of on-chain actions)
  let actionSummariesValue = jsonObject.get("actionSummaries");
  if (actionSummariesValue != null && !actionSummariesValue.isNull() && actionSummariesValue.kind == JSONValueKind.ARRAY) {
    let summariesArray = actionSummariesValue.toArray();
    let summaries: string[] = [];
    for (let i = 0; i < summariesArray.length; i++) {
      let summaryValue = summariesArray[i];
      if (!summaryValue.isNull() && summaryValue.kind == JSONValueKind.STRING) {
        summaries.push(summaryValue.toString());
      } else {
        summaries.push("");
      }
    }
    metadata.actionSummaries = summaries;
  }

  // Parse optional promotedFrom provenance string
  let promotedFromValue = jsonObject.get("promotedFrom");
  if (promotedFromValue != null && !promotedFromValue.isNull() && promotedFromValue.kind == JSONValueKind.STRING) {
    metadata.promotedFrom = promotedFromValue.toString();
  }

  // Parse createdAt timestamp
  let createdAtValue = jsonObject.get("createdAt");
  if (createdAtValue != null && !createdAtValue.isNull() && createdAtValue.kind == JSONValueKind.NUMBER) {
    let raw = createdAtValue.toF64().toString();
    let dotIndex = raw.indexOf(".");
    if (dotIndex >= 0) {
      raw = raw.substring(0, dotIndex);
    }
    metadata.createdAt = BigInt.fromString(raw);
  }

  metadata.save();
}
