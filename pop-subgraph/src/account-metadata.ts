import { Bytes, dataSource, json, BigInt, JSONValueKind } from "@graphprotocol/graph-ts";
import { AccountMetadata } from "../generated/schema";

/**
 * Handler for IPFS file data source that parses account profile metadata JSON.
 *
 * Expected JSON structure:
 * {
 *   bio: "Building decentralized organizations",
 *   avatar: "QmXxx...",      // IPFS CID for avatar image
 *   github: "hudsonhrh",
 *   twitter: "@hudsonhrh",
 *   website: "https://poa.earth"
 * }
 */
export function handleAccountMetadata(content: Bytes): void {
  let ipfsHash = dataSource.stringParam();

  let context = dataSource.context();
  let userAddress = context.getBytes("userAddress");

  // Account-scoped id, matching accountMetadataId() in universal-account-registry.ts and the
  // context key above. Not the bare CID: this row carries an `account` pointer, so two accounts
  // with identical profile JSON would otherwise overwrite each other and cross-link.
  let entityId = userAddress.toHexString() + "-" + ipfsHash;

  let jsonResult = json.try_fromBytes(content);
  if (jsonResult.isError) {
    let metadata = AccountMetadata.load(entityId);
    if (metadata == null) {
      metadata = new AccountMetadata(entityId);
      metadata.account = userAddress;
      metadata.save();
    }
    return;
  }

  let jsonValue = jsonResult.value;
  if (!jsonValue.isNull() && jsonValue.kind == JSONValueKind.OBJECT) {
    let jsonObject = jsonValue.toObject();

    // Load or create — profile metadata is mutable (user can update)
    let metadata = AccountMetadata.load(entityId);
    if (metadata == null) {
      metadata = new AccountMetadata(entityId);
    }

    metadata.account = userAddress;

    let bioValue = jsonObject.get("bio");
    if (bioValue != null && !bioValue.isNull() && bioValue.kind == JSONValueKind.STRING) {
      metadata.bio = bioValue.toString();
    }

    let avatarValue = jsonObject.get("avatar");
    if (avatarValue != null && !avatarValue.isNull() && avatarValue.kind == JSONValueKind.STRING) {
      metadata.avatar = avatarValue.toString();
    }

    let githubValue = jsonObject.get("github");
    if (githubValue != null && !githubValue.isNull() && githubValue.kind == JSONValueKind.STRING) {
      metadata.github = githubValue.toString();
    }

    let twitterValue = jsonObject.get("twitter");
    if (twitterValue != null && !twitterValue.isNull() && twitterValue.kind == JSONValueKind.STRING) {
      metadata.twitter = twitterValue.toString();
    }

    let websiteValue = jsonObject.get("website");
    if (websiteValue != null && !websiteValue.isNull() && websiteValue.kind == JSONValueKind.STRING) {
      metadata.website = websiteValue.toString();
    }

    metadata.indexedAt = BigInt.fromI32(0);
    metadata.save();
  } else {
    let metadata = AccountMetadata.load(entityId);
    if (metadata == null) {
      metadata = new AccountMetadata(entityId);
      metadata.account = userAddress;
      metadata.save();
    }
  }
}
