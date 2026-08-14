import { Bytes, dataSource, json, BigInt, JSONValueKind } from "@graphprotocol/graph-ts";
import { ProjectMetadata } from "../generated/schema";

/**
 * Handler for IPFS file data source that parses project metadata JSON.
 *
 * Creates a ProjectMetadata entity with parsed fields from the IPFS JSON content.
 * The Project entity links are pre-set by the event handlers (handleProjectCreated),
 * so this handler only needs to populate the metadata.
 */
export function handleProjectMetadata(content: Bytes): void {
  let ipfsHash = dataSource.stringParam();
  let context = dataSource.context();
  let projectId = context.getString("projectId");

  // Project-scoped id, matching projectMetadataId() in task-manager.ts and the context key above.
  // Not the bare CID: this row carries a `project` pointer, so two projects with identical
  // metadata JSON (same CID) would otherwise fight over one row.
  let entityId = projectId + "-" + ipfsHash;

  // Load or create the ProjectMetadata entity using the IPFS hash as ID
  let metadata = ProjectMetadata.load(entityId);
  if (metadata == null) {
    metadata = new ProjectMetadata(entityId);
    metadata.project = projectId;
    metadata.indexedAt = BigInt.fromI32(0);
  }

  // Try to parse the JSON content
  let jsonResult = json.try_fromBytes(content);
  if (jsonResult.isError) {
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

  metadata.save();
}
