import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  ImplementationRegistered as ImplementationRegisteredEvent,
  OwnershipTransferred as OwnershipTransferredEvent
} from "../generated/ImplementationRegistry/ImplementationRegistry";
import {
  ImplementationRegistryContract,
  ImplementationType,
  ImplementationVersion,
  ImplementationRegistration
} from "../generated/schema";
import { ImplementationRegistryDynamic as ImplementationRegistryDynamicTemplate } from "../generated/templates";

/**
 * ImplementationRegistry — the only on-chain source of the human version string ("v6") for a
 * given implementation address.
 *
 * Why this is indexed at all: answering "which version is this org's TaskManager running?"
 * previously required an `eth_getLogs(ImplementationRegistered, fromBlock: 0)` against this
 * contract, because there is no other way back from an address to a version — the modules have
 * no `version()` getter, and `getImplementation(typeName, version)` takes the version string as
 * INPUT. Most public RPCs reject an unbounded log range, so that lookup failed far more often
 * than it succeeded and callers silently degraded to "unknown version".
 *
 * `Beacon.version` covers only the current mirror implementation of an auto-upgrading beacon.
 * A SwitchableBeacon pinned to an older implementation, a historical address, or a direct
 * ERC-1967 proxy all fall outside it — which is the whole reason `ImplementationVersion` is
 * keyed by implementation address instead.
 *
 * KNOWN GAP, by design of the contract: `setLatestVersion(typeName, version)` promotes an
 * already-registered version and emits NO event. Only registrations are observable, so the
 * `latest` flags here mean "latest as of the most recent registration". That is strictly the
 * best available from logs, and is the same fidelity the RPC scan had.
 */

function getOrCreateRegistry(
  address: Address,
  timestamp: BigInt,
  blockNumber: BigInt
): ImplementationRegistryContract {
  let registry = ImplementationRegistryContract.load(address);
  if (registry == null) {
    registry = new ImplementationRegistryContract(address);
    registry.typeCount = BigInt.zero();
    registry.registrationCount = BigInt.zero();
    registry.createdAt = timestamp;
    registry.createdAtBlock = blockNumber;
  }
  return registry as ImplementationRegistryContract;
}

function typeEntityId(registry: Address, typeId: Bytes): string {
  return registry.toHexString() + "-" + typeId.toHexString();
}

/**
 * ImplementationRegistered(bytes32 indexed typeId, string typeName, bytes32 indexed versionId,
 *                          string version, address implementation, bool latest)
 */
export function handleImplementationRegistered(event: ImplementationRegisteredEvent): void {
  let registrationId = event.transaction.hash.concatI32(event.logIndex.toI32());

  // Idempotency guard. The static dataSource and a dynamically spawned template can both watch
  // the same registry address (see handleRegistryUpdated in poa-manager.ts), and graph-node will
  // deliver the log once per dataSource. Every counter below increments, so processing a log
  // twice would inflate registrationCount / versionCount and double-count versions. A log is
  // uniquely identified by txHash+logIndex, so an existing row means "already handled".
  if (ImplementationRegistration.load(registrationId) != null) {
    return;
  }

  let implementation = event.params.implementation;
  let typeId = event.params.typeId;
  let registry = getOrCreateRegistry(event.address, event.block.timestamp, event.block.number);

  // ── Type ───────────────────────────────────────────────────────────────────────────────
  let typeKey = typeEntityId(event.address, typeId);
  let implType = ImplementationType.load(typeKey);
  if (implType == null) {
    implType = new ImplementationType(typeKey);
    implType.registry = event.address;
    implType.typeId = typeId;
    implType.versionCount = BigInt.zero();
    implType.firstRegisteredAt = event.block.timestamp;
    registry.typeCount = registry.typeCount.plus(BigInt.fromI32(1));
  }
  let t = implType as ImplementationType;
  // typeName is re-emitted on every registration; keep the freshest spelling.
  t.typeName = event.params.typeName;
  t.versionCount = t.versionCount.plus(BigInt.fromI32(1));
  t.lastRegisteredAt = event.block.timestamp;

  // ── `latest` handover ──────────────────────────────────────────────────────────────────
  // Demote the incumbent BEFORE writing the new row, so that re-registering the address that is
  // already latest (same address, new version) cannot demote itself.
  if (event.params.latest) {
    let previous = t.latestImplementation;
    if (previous !== null && previous != implementation) {
      let incumbent = ImplementationVersion.load(previous as Bytes);
      // Only demote if the incumbent still belongs to THIS type. One address can be registered
      // under two types; the address-keyed row then describes the later type, and clearing its
      // `latest` here would wrongly retire the other type's current version.
      if (incumbent != null && incumbent.typeId == typeId) {
        incumbent.latest = false;
        incumbent.save();
      }
    }
    t.latestVersion = event.params.version;
    t.latestVersionId = event.params.versionId;
    t.latestImplementation = implementation;
  }
  t.save();

  // ── Version, keyed by implementation address ───────────────────────────────────────────
  let version = ImplementationVersion.load(implementation);
  if (version == null) {
    version = new ImplementationVersion(implementation);
    version.registrationCount = BigInt.zero();
    version.firstRegisteredAt = event.block.timestamp;
    version.firstRegisteredAtBlock = event.block.number;
  }
  let v = version as ImplementationVersion;
  // Last write wins: the same bytecode can be registered again under a new version of its type,
  // or under a different type entirely. `registrations` keeps the full history either way.
  v.registry = event.address;
  v.type = typeKey;
  v.typeId = typeId;
  v.typeName = event.params.typeName;
  v.version = event.params.version;
  v.versionId = event.params.versionId;
  v.latest = event.params.latest;
  v.registrationCount = v.registrationCount.plus(BigInt.fromI32(1));
  v.registeredAt = event.block.timestamp;
  v.registeredAtBlock = event.block.number;
  v.transactionHash = event.transaction.hash;
  v.save();

  // ── Immutable audit row ────────────────────────────────────────────────────────────────
  let registration = new ImplementationRegistration(registrationId);
  registration.registry = event.address;
  registration.type = typeKey;
  registration.implementationVersion = implementation;
  registration.typeId = typeId;
  registration.typeName = event.params.typeName;
  registration.versionId = event.params.versionId;
  registration.version = event.params.version;
  registration.implementation = implementation;
  registration.latest = event.params.latest;
  registration.registeredAt = event.block.timestamp;
  registration.registeredAtBlock = event.block.number;
  registration.transactionHash = event.transaction.hash;
  registration.save();

  registry.registrationCount = registry.registrationCount.plus(BigInt.fromI32(1));
  registry.lastRegisteredAt = event.block.timestamp;
  registry.save();
}

/**
 * OwnershipTransferred — who may register implementations. Also creates the registry row at
 * deployment, which is strictly before the first registration.
 */
export function handleImplementationRegistryOwnershipTransferred(
  event: OwnershipTransferredEvent
): void {
  let registry = getOrCreateRegistry(event.address, event.block.timestamp, event.block.number);
  registry.owner = event.params.newOwner;
  registry.save();
}

/**
 * Watch a registry this subgraph has not seen before.
 *
 * PoaManager.setRegistry repoints governance at a freshly deployed ImplementationRegistry
 * (RegistryUpdated). The static dataSource only covers the address known at manifest-authoring
 * time, so without this a repoint would silently stop resolving versions — the exact failure
 * mode these entities exist to remove. Overlap with the static dataSource is harmless:
 * handleImplementationRegistered drops any log whose txHash+logIndex it has already recorded.
 */
export function ensureImplementationRegistry(
  address: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt
): void {
  // PoaManager emits RegistryUpdated(0x0, …) on first configuration; there is nothing to watch.
  if (address == Address.zero()) {
    return;
  }
  if (ImplementationRegistryContract.load(address) != null) {
    return;
  }
  let registry = new ImplementationRegistryContract(address);
  registry.typeCount = BigInt.zero();
  registry.registrationCount = BigInt.zero();
  registry.createdAt = timestamp;
  registry.createdAtBlock = blockNumber;
  registry.save();

  ImplementationRegistryDynamicTemplate.create(Address.fromBytes(address));
}
