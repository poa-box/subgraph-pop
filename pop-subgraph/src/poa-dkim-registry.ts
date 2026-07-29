import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  KeyHashSet as KeyHashSetEvent,
  KeyHashRevoked as KeyHashRevokedEvent,
  OwnershipTransferred as OwnershipTransferredEvent
} from "../generated/PoaDKIMRegistry/PoaDKIMRegistry";
import { DkimRegistry, DkimKey } from "../generated/schema";
import { PoaDKIMRegistryDynamic as PoaDKIMRegistryDynamicTemplate } from "../generated/templates";

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
  let isNew = key == null;
  if (isNew) {
    key = new DkimKey(id);
    key.registry = event.address;
    key.domainHash = event.params.domainHash;
    key.keyHash = event.params.keyHash;
  }
  let k = key as DkimKey;
  k.valid = event.params.valid;

  if (event.params.valid) {
    // A genuine (re-)seed: refresh the expiry and the provenance, and clear any prior
    // revocation so a re-seeded key does not keep reading as retired.
    k.validUntil = event.params.validUntil;
    k.setAt = event.block.timestamp;
    k.setAtBlock = event.block.number;
    k.transactionHash = event.transaction.hash;
    k.revokedAt = null;
  } else {
    // A REVOKE also arrives as KeyHashSet: `_set` emits KeyHashSet(..., validUntil != 0,
    // validUntil) and only then KeyHashRevoked. Overwriting setAt/transactionHash/validUntil
    // here would rewrite the key's seeding provenance with the revocation's — destroying the
    // "when was this seeded, and with what expiry" answer the entity exists to give.
    k.revokedAt = event.block.timestamp;
    if (isNew) {
      // Never saw it seeded (before the start block); record what we do know.
      k.validUntil = event.params.validUntil;
      k.setAt = event.block.timestamp;
      k.setAtBlock = event.block.number;
      k.transactionHash = event.transaction.hash;
    }
  }
  k.save();

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
  }
  let k = key as DkimKey;
  // Provenance is deliberately NOT rewritten here: `_set` already emitted KeyHashSet for this
  // same revoke, and the row's setAt/transactionHash describe the seeding.
  k.valid = false;
  k.revokedAt = event.block.timestamp;
  k.save();

  registry.save();
}

/** OwnershipTransferred — who may seed keys. Also creates the registry row on deployment. */
export function handleDkimOwnershipTransferred(event: OwnershipTransferredEvent): void {
  let registry = getOrCreateRegistry(event.address, event.block.timestamp);
  registry.owner = event.params.newOwner;
  registry.save();
}


/**
 * Ensure a DkimRegistry row exists so ZkEmailInvites.dkimRegistry can be a real reference.
 *
 * A module can point at a registry this subgraph has not yet seen an event from — on a chain
 * where the registry is not configured at all (arbitrum-one stubs it to the zero address), or
 * simply before its first KeyHashSet. Creating the row keeps the reference resolvable, and lets
 * a client distinguish "registry not indexed here" from "domain not seeded".
 */
export function ensureDkimRegistry(address: Bytes, timestamp: BigInt): void {
  let registry = DkimRegistry.load(address);
  if (registry != null) {
    return;
  }
  registry = new DkimRegistry(address);
  registry.createdAt = timestamp;
  registry.lastUpdatedAt = timestamp;
  registry.save();

  // First time this subgraph has heard of this registry. Watch it, so a governance repoint to a
  // freshly deployed instance does not silently stop indexing keys. Safe to overlap with the
  // static dataSource: DkimKey ids are registry-scoped and no counters are incremented, so the
  // two sources converge on identical rows.
  PoaDKIMRegistryDynamicTemplate.create(Address.fromBytes(address));
}
