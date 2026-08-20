import { Bytes, dataSource, json, BigInt, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { TaskApplicationMetadata } from "../generated/schema";

/**
 * Handler for IPFS file data source that parses task application metadata JSON.
 *
 * Expected JSON structure:
 * {
 *   notes: "Why I want this task",
 *   experience: "Relevant experience description"
 * }
 */
export function handleTaskApplicationMetadata(content: Bytes): void {
  let ipfsCid = dataSource.stringParam();

  // No context is read here. This entity writes no owner pointer, so the spawning site passes
  // no context at all — that is what lets graph-node's (template, CID, context) dedup collapse
  // repeat references to one data source instead of double-INSERTing this immutable id.
  // File data sources have no block context, so indexedAt is fixed at 0 (as in org-metadata.ts).
  let existing = TaskApplicationMetadata.load(ipfsCid);
  if (existing != null) {
    return;
  }

  let metadata = new TaskApplicationMetadata(ipfsCid);
  metadata.indexedAt = BigInt.fromI32(0);

  // Try to parse the JSON content
  let jsonResult = json.try_fromBytes(content);
  if (jsonResult.isError) {
    log.warning("[TaskApplicationMetadata] Failed to parse JSON for CID: {}", [ipfsCid]);
    metadata.save();
    return;
  }

  let jsonValue = jsonResult.value;
  if (jsonValue.isNull() || jsonValue.kind != JSONValueKind.OBJECT) {
    metadata.save();
    return;
  }

  let jsonObject = jsonValue.toObject();

  // Parse notes
  let notesValue = jsonObject.get("notes");
  if (notesValue != null && !notesValue.isNull() && notesValue.kind == JSONValueKind.STRING) {
    metadata.notes = notesValue.toString();
  }

  // Parse experience
  let experienceValue = jsonObject.get("experience");
  if (experienceValue != null && !experienceValue.isNull() && experienceValue.kind == JSONValueKind.STRING) {
    metadata.experience = experienceValue.toString();
  }

  metadata.save();
}
