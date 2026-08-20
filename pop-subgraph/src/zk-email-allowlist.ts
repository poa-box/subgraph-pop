import { Bytes, dataSource, json, BigInt, JSONValueKind, ByteArray } from "@graphprotocol/graph-ts";
import { ZkEmailAllowlist, ZkEmailAllowlistEntry } from "../generated/schema";

/**
 * Handler for the IPFS file data source that parses a ZkEmailInvites allowlist JSON.
 *
 * Expected JSON structure (schema "poa.zkemail.allowlist/1"):
 * {
 *   "schema": "poa.zkemail.allowlist/1",
 *   "orgId": "0x..",
 *   "root": "0x..",
 *   "entries": [
 *     { "type": "domain", "identifier": "anthropic.com", "hatIds": ["0x.."], "roleIndexes": [0] },
 *     { "type": "email",  "identifier": "alice@org.com", "emailHash": "0x..",
 *       "hatIds": ["0x.."], "roleIndexes": [1] }
 *   ]
 * }
 *
 * Mirrors org-metadata.ts: resilient to malformed data (the subgraph never bricks if IPFS is slow
 * or the JSON is bad — on-chain ZkEmailInvites indexing continues), and scopes every id by the
 * module from the DataSourceContext "module" key set in zk-email-invites.ts, so that two modules
 * committing the same allowlist CID cannot collide on the immutable entry children.
 *
 * Does NOT back-link ZkEmailInvites.activeAllowlist — a file data source cannot see chain-written
 * entities. handleActiveAllowlistSet sets that pointer directly.
 */
export function handleZkEmailAllowlist(content: Bytes): void {
  // dataSource.stringParam() is the IPFS CIDv0 (this entity's id).
  let cid = dataSource.stringParam();

  // Module proxy address passed by the spawning ActiveAllowlistSet handler.
  let context = dataSource.context();
  let moduleAddress = context.getBytes("module");

  // Module-scoped id, matching zkEmailAllowlistId() in zk-email-invites.ts and the context key
  // above — not the bare CID, since two modules can commit the same allowlist JSON.
  let entityId = moduleAddress.toHexString() + "-" + cid;

  // Immutable children — if this (module, CID) was already indexed, do nothing.
  let existing = ZkEmailAllowlist.load(entityId);
  if (existing != null) {
    return;
  }

  // Create the allowlist entity up front so it survives even if JSON parsing fails.
  let allowlist = new ZkEmailAllowlist(entityId);
  allowlist.module = moduleAddress;
  // File data sources have no block context; use 0 as a placeholder (same as org-metadata.ts).
  allowlist.indexedAt = BigInt.fromI32(0);

  let jsonResult = json.try_fromBytes(content);
  if (jsonResult.isError) {
    allowlist.save();
    return;
  }

  let jsonValue = jsonResult.value;
  if (jsonValue.isNull() || jsonValue.kind != JSONValueKind.OBJECT) {
    allowlist.save();
    return;
  }

  let obj = jsonValue.toObject();

  // Parse the declared merkle root (should match the on-chain commit).
  let rootValue = obj.get("root");
  if (rootValue != null && !rootValue.isNull() && rootValue.kind == JSONValueKind.STRING) {
    let rootStr = rootValue.toString();
    if (rootStr.length > 0) {
      allowlist.root = parseHexToBytes(rootStr);
    }
  }

  allowlist.save();

  // Parse entries[] — each becomes an immutable ZkEmailAllowlistEntry keyed "allowlistId-index".
  let entriesValue = obj.get("entries");
  if (entriesValue == null || entriesValue.isNull() || entriesValue.kind != JSONValueKind.ARRAY) {
    return;
  }

  let entriesArray = entriesValue.toArray();
  for (let i = 0; i < entriesArray.length; i++) {
    let entryValue = entriesArray[i];
    if (entryValue.isNull() || entryValue.kind != JSONValueKind.OBJECT) {
      continue;
    }
    let entryObj = entryValue.toObject();

    let entry = new ZkEmailAllowlistEntry(entityId + "-" + i.toString());
    entry.allowlist = entityId;
    entry.index = i;

    // type — "domain" or "email"; default to "domain" if absent so the field stays non-null.
    let typeValue = entryObj.get("type");
    if (typeValue != null && !typeValue.isNull() && typeValue.kind == JSONValueKind.STRING) {
      entry.entryType = typeValue.toString();
    } else {
      entry.entryType = "domain";
    }

    // identifier — "anthropic.com" or "alice@org.com" (optional).
    let identifierValue = entryObj.get("identifier");
    if (identifierValue != null && !identifierValue.isNull() && identifierValue.kind == JSONValueKind.STRING) {
      entry.identifier = identifierValue.toString();
    }

    // identifierHash — from "emailHash" for email entries (domains have no hash in the schema).
    let emailHashValue = entryObj.get("emailHash");
    if (emailHashValue != null && !emailHashValue.isNull() && emailHashValue.kind == JSONValueKind.STRING) {
      let emailHashStr = emailHashValue.toString();
      if (emailHashStr.length > 0) {
        entry.identifierHash = parseHexToBytes(emailHashStr);
      }
    }

    // hatIds — array of big-endian uint256 hex strings -> BigInt[].
    let hatIds: BigInt[] = [];
    let hatIdsValue = entryObj.get("hatIds");
    if (hatIdsValue != null && !hatIdsValue.isNull() && hatIdsValue.kind == JSONValueKind.ARRAY) {
      let hatIdsArray = hatIdsValue.toArray();
      for (let h = 0; h < hatIdsArray.length; h++) {
        let hv = hatIdsArray[h];
        if (hv.isNull()) {
          continue;
        }
        if (hv.kind == JSONValueKind.STRING) {
          let hatStr = hv.toString();
          if (hatStr.length > 0) {
            hatIds.push(parseHexToBigInt(hatStr));
          }
        } else if (hv.kind == JSONValueKind.NUMBER) {
          hatIds.push(hv.toBigInt());
        }
      }
    }
    entry.hatIds = hatIds;

    // roleIndexes — parallel array of small ints.
    let roleIndexes: i32[] = [];
    let roleIndexesValue = entryObj.get("roleIndexes");
    if (roleIndexesValue != null && !roleIndexesValue.isNull() && roleIndexesValue.kind == JSONValueKind.ARRAY) {
      let roleIndexesArray = roleIndexesValue.toArray();
      for (let r = 0; r < roleIndexesArray.length; r++) {
        let rv = roleIndexesArray[r];
        if (!rv.isNull() && rv.kind == JSONValueKind.NUMBER) {
          roleIndexes.push(rv.toBigInt().toI32());
        }
      }
    }
    entry.roleIndexes = roleIndexes;

    entry.save();
  }
}

/**
 * Parse a (possibly "0x"-prefixed) big-endian hex string into Bytes. Callers guard against empty
 * input. Uses charAt + substring (startsWith/substr have crashed this AS toolchain).
 */
function parseHexToBytes(hex: string): Bytes {
  let normalized = hex;
  if (normalized.length >= 2) {
    let c0 = normalized.charAt(0);
    let c1 = normalized.charAt(1);
    if (c0 == "0" && (c1 == "x" || c1 == "X")) {
      normalized = normalized.substring(2);
    }
  }
  // Bytes.fromHexString needs an even number of nibbles.
  if (normalized.length % 2 != 0) {
    normalized = "0" + normalized;
  }
  return Bytes.fromHexString("0x" + normalized);
}

/**
 * Parse a big-endian uint256 hex string into a BigInt. graph-ts BigInt is little-endian, so reverse
 * the big-endian bytes before fromUnsignedBytes. Callers guard against empty input.
 */
function parseHexToBigInt(hex: string): BigInt {
  let bytes = parseHexToBytes(hex);
  let reversed = Bytes.fromUint8Array(changetype<ByteArray>(bytes).reverse());
  return BigInt.fromUnsignedBytes(reversed);
}
