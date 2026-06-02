import { BigDecimal, BigInt, Bytes, dataSource, json, JSONValueKind } from "@graphprotocol/graph-ts";
import { TaskMetadata } from "../generated/schema";

/**
 * Handler for IPFS file data source that parses task metadata JSON.
 *
 * Creates a mutable TaskMetadata entity keyed by taskId-CID for uniqueness.
 * Uses "load or create" pattern which is safe for mutable entities and
 * handles retries gracefully without triggering duplicate key constraint violations.
 *
 * The ID MUST be scoped by taskId (not tx hash): when several tasks are created
 * in one batch transaction they share a tx hash, and identical task metadata
 * (e.g. same title) yields an identical CID. A txHash-CID key would then collide
 * across those tasks, producing two file data sources that write the same entity
 * id in the same block — which graph-node rejects with
 * "can not append operations that go backwards". taskId is globally unique
 * (taskManager-taskId), so taskId-CID is collision-free.
 */
export function handleTaskMetadata(content: Bytes): void {
  let ipfsCid = dataSource.stringParam();
  let context = dataSource.context();
  let taskId = context.getString("taskId");
  let timestamp = context.getBigInt("timestamp");

  // Entity ID is scoped by the (globally unique) task id for uniqueness
  let entityId = taskId + "-" + ipfsCid;

  // Load or create metadata entity (mutable entity - safe to update)
  let metadata = TaskMetadata.load(entityId);
  if (metadata == null) {
    metadata = new TaskMetadata(entityId);
    metadata.task = taskId;
    metadata.indexedAt = timestamp;
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

  metadata.save();
}
