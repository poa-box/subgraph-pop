import { BigDecimal, BigInt, Bytes, dataSource, json, JSONValueKind } from "@graphprotocol/graph-ts";
import { TaskMetadata } from "../generated/schema";

/**
 * Handler for IPFS file data source that parses task metadata JSON.
 *
 * The entity ID is `taskId-CID` where taskId is the globally-unique task entity id
 * (taskManager-taskId, so it is org-scoped — on-chain task ids repeat across orgs).
 * This must hold for two independent reasons, both of which otherwise crash the
 * indexer because file data sources run in isolated causality regions:
 *
 *   1. Cross-task: batch-created tasks share a tx hash, and identical metadata
 *      (e.g. same title) yields the same CID. A txHash-CID key would collide
 *      across those tasks ("can not append operations that go backwards").
 *
 *   2. Same task, different blocks: when a task re-references the same metadata
 *      later (e.g. TaskRejected restoring the original description), the indexer
 *      runs the file data source again. graph-node deduplicates file data sources
 *      by (template, CID, context), so the context MUST be identical across those
 *      references for the duplicate to be dropped. We therefore pass ONLY taskId
 *      (no per-block timestamp) — a timestamp in the context defeated dedup and
 *      produced two Inserts of the same id ("impossible combination of entity
 *      operations"). This mirrors the ProposalMetadata pattern.
 *
 * `indexedAt` is intentionally not populated (kept nullable for backward compat):
 * a per-block timestamp cannot live in the context without breaking dedup, and the
 * task's own createdAt/updatedAt already carry that information.
 */
export function handleTaskMetadata(content: Bytes): void {
  let ipfsCid = dataSource.stringParam();
  let context = dataSource.context();
  let taskId = context.getString("taskId");

  // Entity ID is scoped by the (globally unique) task id for uniqueness
  let entityId = taskId + "-" + ipfsCid;

  // Load or create metadata entity (mutable entity - safe to update)
  let metadata = TaskMetadata.load(entityId);
  if (metadata == null) {
    metadata = new TaskMetadata(entityId);
    metadata.task = taskId;
  }

  // Try to parse the JSON content
  let jsonResult = json.try_fromBytes(content);
  if (jsonResult.isError) {
    // Save minimal entity even on parse error so the link resolves
    metadata.save();
    return;
  }

  let jsonValue = jsonResult.value;
  if (jsonValue.isNull() || jsonValue.kind != JSONValueKind.OBJECT) {
    // Save minimal entity for non-object JSON
    metadata.save();
    return;
  }

  let jsonObject = jsonValue.toObject();

  // Parse name
  let nameValue = jsonObject.get("name");
  if (nameValue != null && !nameValue.isNull() && nameValue.kind == JSONValueKind.STRING) {
    metadata.name = nameValue.toString();
  }

  // Parse description
  let descriptionValue = jsonObject.get("description");
  if (descriptionValue != null && !descriptionValue.isNull() && descriptionValue.kind == JSONValueKind.STRING) {
    metadata.description = descriptionValue.toString();
  }

  // Parse location
  let locationValue = jsonObject.get("location");
  if (locationValue != null && !locationValue.isNull() && locationValue.kind == JSONValueKind.STRING) {
    metadata.location = locationValue.toString();
  }

  // Parse difficulty
  let difficultyValue = jsonObject.get("difficulty");
  if (difficultyValue != null && !difficultyValue.isNull() && difficultyValue.kind == JSONValueKind.STRING) {
    metadata.difficulty = difficultyValue.toString();
  }

  // Parse estHours (supports fractional values like 0.5)
  let estHoursValue = jsonObject.get("estHours");
  if (estHoursValue != null && !estHoursValue.isNull() && estHoursValue.kind == JSONValueKind.NUMBER) {
    metadata.estimatedHours = BigDecimal.fromString(estHoursValue.toF64().toString());
  }

  // Parse submission content (for submission metadata entities)
  let submissionValue = jsonObject.get("submission");
  if (submissionValue != null && !submissionValue.isNull() && submissionValue.kind == JSONValueKind.STRING) {
    metadata.submission = submissionValue.toString();
  }

  // Parse rejection reason (for rejection metadata entities)
  // The frontend uploads rejection metadata with key "rejectionReason"
  let rejectionValue = jsonObject.get("rejectionReason");
  if (rejectionValue != null && !rejectionValue.isNull() && rejectionValue.kind == JSONValueKind.STRING) {
    metadata.rejection = rejectionValue.toString();
  }

  // Parse optional soft due date (unix seconds, written by the frontend; v6).
  // Display-only — never enforced on-chain. Tolerates absence and wrong types;
  // fractional values are truncated (same pattern as proposal-metadata timestamps).
  let dueDateValue = jsonObject.get("dueDate");
  if (dueDateValue != null && !dueDateValue.isNull() && dueDateValue.kind == JSONValueKind.NUMBER) {
    let raw = dueDateValue.toF64().toString();
    let dotIndex = raw.indexOf(".");
    if (dotIndex >= 0) {
      raw = raw.substring(0, dotIndex);
    }
    metadata.dueDate = BigInt.fromString(raw);
  }

  metadata.save();
}
