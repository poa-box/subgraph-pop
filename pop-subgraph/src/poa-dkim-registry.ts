import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  KeyHashSet as KeyHashSetEvent,
  KeyHashRevoked as KeyHashRevokedEvent,
  OwnershipTransferred as OwnershipTransferredEvent
} from "../generated/PoaDKIMRegistry/PoaDKIMRegistry";
import { DkimRegistry, DkimKey } from "../generated/schema";

/**
 * PoaDKIMRegistry (ERC-7969) — which DKIM public keys are trusted for which sending domain.
 *
 * Why this is indexed at all: a ZkEmailInvites claim is only accepted if the registry holds a
 * valid key for the PROVEN sending domain (`_commonPreChecks` reverts InvalidDKIMKey otherwise).
 * An allowlisted domain with no seeded key therefore fails every claim, and that is by far the
 * most common cause of a broken invite. The registry exposes only
 * `isKeyHashValid(domainHash, keyHash)` — there is no "any key for this domain" getter — so
 * without these entities a client has to scan the registry's entire event history over RPC to
 * answer the question.
 *
 * IMPORTANT: `domainHash` is the POSEIDON commitment of the domain (the circuit's
 * `fromDomainHash` signal), not keccak256. The registry's legacy `setKeyForDomain(string)`
 * helper keys by keccak and produces entries that can never match a live claim; those are
 * indexed here too, and will simply never correspond to a real domain commitment.
 */

function getOrCreateRegistry(address: Address, timestamp: BigInt): DkimRegistry {
  let registry = DkimRegistry.load(address);
  if (registry == null) {
    registry = new DkimRegistry(address);
    registry.keyCount = 0;
    registry.createdAt = timestamp;
  }
  registry.lastUpdatedAt = timestamp;
  return registry as DkimRegistry;
}

function keyId(registry: Address, domainHash: Bytes, keyHash: Bytes): string {
  return registry.toHexString() + "-" + domainHash.toHexString() + "-" + keyHash.toHexString();
}

/**
 * KeyHashSet(bytes32 indexed domainHash, bytes32 indexed keyHash, bool valid, uint256 validUntil).
 *
 * The contract emits this for both the set and unset directions (`valid: false` is how
 * `setKeyHash(..., false)` clears a key), so trust the event's own flag rather than assuming
 * this event only ever means "seeded".
 */
export function handleKeyHashSet(event: KeyHashSetEvent): void {
  let registry = getOrCreateRegistry(event.address, event.block.timestamp);

  let id = keyId(event.address, event.params.domainHash, event.params.keyHash);
  let key = DkimKey.load(id);
  if (key == null) {
    key = new DkimKey(id);
    key.registry = event.address;
    key.domainHash = event.params.domainHash;
    key.keyHash = event.params.keyHash;
    registry.keyCount = registry.keyCount + 1;
  }
  key.valid = event.params.valid;
  key.validUntil = event.params.validUntil;
  key.setAt = event.block.timestamp;
  key.setAtBlock = event.block.number;
  // Re-setting a previously revoked key un-revokes it; leaving revokedAt stale would make a
  // live key look retired.
  key.revokedAt = event.params.valid ? null : event.block.timestamp;
  key.transactionHash = event.transaction.hash;
  key.save();

  registry.save();
}

/** KeyHashRevoked(bytes32 indexed domainHash, bytes32 indexed keyHash). */
export function handleKeyHashRevoked(event: KeyHashRevokedEvent): void {
  let registry = getOrCreateRegistry(event.address, event.block.timestamp);

  let id = keyId(event.address, event.params.domainHash, event.params.keyHash);
  let key = DkimKey.load(id);
  if (key == null) {
    // Revoking a key this subgraph never saw set (seeded before the indexed range). Record it
    // as a known-invalid key rather than dropping the event, so a consumer asking "is this
    // domain seeded?" gets an explicit no instead of silence.
    key = new DkimKey(id);
    key.registry = event.address;
    key.domainHash = event.params.domainHash;
    key.keyHash = event.params.keyHash;
    key.validUntil = BigInt.zero();
    key.setAt = event.block.timestamp;
    key.setAtBlock = event.block.number;
    key.transactionHash = event.transaction.hash;
    registry.keyCount = registry.keyCount + 1;
  }
  key.valid = false;
  key.revokedAt = event.block.timestamp;
  key.save();

  registry.save();
}

/** OwnershipTransferred — who may seed keys. Also creates the registry row on deployment. */
export function handleDkimOwnershipTransferred(event: OwnershipTransferredEvent): void {
  let registry = getOrCreateRegistry(event.address, event.block.timestamp);
  registry.owner = event.params.newOwner;
  registry.save();
}
