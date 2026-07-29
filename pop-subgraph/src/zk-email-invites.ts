import { Address, BigInt, Bytes, DataSourceContext, ethereum } from "@graphprotocol/graph-ts";
import {
  ActiveAllowlistSet as ActiveAllowlistSetEvent,
  RoleClaimedByDomain as RoleClaimedByDomainEvent,
  RoleClaimedByEmail as RoleClaimedByEmailEvent,
  RegisteredAndClaimedByDomain as RegisteredAndClaimedByDomainEvent,
  RegisteredAndClaimedByEmail as RegisteredAndClaimedByEmailEvent,
  RegisteredEmailCleared as RegisteredEmailClearedEvent,
  DomainVerifierUpdated as DomainVerifierUpdatedEvent,
  EmailVerifierUpdated as EmailVerifierUpdatedEvent,
  DKIMRegistryUpdated as DKIMRegistryUpdatedEvent,
  AccountRegistryUpdated as AccountRegistryUpdatedEvent,
  UniversalFactoryUpdated as UniversalFactoryUpdatedEvent
} from "../generated/templates/ZkEmailInvites/ZkEmailInvites";
import {
  ZkEmailInvites,
  ZkEmailClaim,
  ZkEmailRegisteredEmail,
  ZkEmailNullifier,
  User
} from "../generated/schema";
import { ZkEmailAllowlist as ZkEmailAllowlistTemplate } from "../generated/templates";
import { getUsernameForAddress } from "./utils";
import { ZkEmailInvites as ZkEmailInvitesContract } from "../generated/templates/ZkEmailInvites/ZkEmailInvites";

// 32-byte zero digest. A zero allowlistCid means the allowlist was cleared (the module is dormant).
const ZERO_HASH: Bytes = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");

/**
 * Convert a bytes32 sha256 digest to an IPFS CIDv0 string.
 *
 * CIDv0 = base58( 0x1220 + sha256_digest )
 * - 0x12 = sha2-256 multicodec
 * - 0x20 = 32 bytes length
 * - sha256_digest = the bytes32 emitted by the contract
 *
 * Mirrors bytes32ToCid in org-registry.ts / education-hub.ts.
 */
function bytes32ToCid(hash: Bytes): string {
  let prefix = Bytes.fromHexString("0x1220");
  let multihash = new Bytes(34);
  for (let i = 0; i < 2; i++) {
    multihash[i] = prefix[i];
  }
  for (let i = 0; i < 32; i++) {
    multihash[i + 2] = hash[i];
  }
  return multihash.toBase58();
}

/**
 * Spawn an IPFS file data source over the active allowlist CID. Carries the module proxy address in
 * a DataSourceContext so handleZkEmailAllowlist can link the parsed content back to the module.
 * Mirrors createIpfsDataSource in org-registry.ts (zero-hash skip + dedupe-by-CID).
 */
function createAllowlistDataSource(allowlistHash: Bytes, moduleAddress: Bytes): string {
  let ipfsCid = bytes32ToCid(allowlistHash);

  // Pass the module address so the file handler can set ZkEmailAllowlist.module + back-link
  // ZkEmailInvites.activeAllowlist. The file handler dedupes on the CID for immutable children.
  let context = new DataSourceContext();
  context.setBytes("module", moduleAddress);

  ZkEmailAllowlistTemplate.createWithContext(ipfsCid, context);
  return ipfsCid;
}

/**
 * ActiveAllowlistSet(bytes32 indexed merkleRoot, bytes32 indexed allowlistCid).
 * Emitted at initialize() and whenever a new allowlist is committed (or cleared, with a zero CID).
 */
export function handleActiveAllowlistSet(event: ActiveAllowlistSetEvent): void {
  let moduleAddress = event.address;
  let merkleRoot = event.params.merkleRoot;
  let allowlistCid = event.params.allowlistCid;

  // The ZkEmailInvites entity is created in org-registry.ts when the proxy is registered, which the
  // contract guarantees happens BEFORE initialize() emits this event (register-before-initialize, so
  // the data-source template exists in time to catch the init-time ActiveAllowlistSet). We therefore
  // never need to fabricate the entity here — and must not, since `organization` is required and is
  // only known to the registration handler. If it is somehow missing, skip rather than brick.
  let module = ZkEmailInvites.load(moduleAddress);
  if (module == null) {
    return;
  }

  // A zero CID means the allowlist was cleared: the module is dormant, no file source to spawn.
  if (allowlistCid.equals(ZERO_HASH)) {
    module.activeRoot = null;
    module.activeAllowlistCid = null;
    module.activeAllowlist = null;
    module.lastUpdatedAt = event.block.timestamp;
    module.save();
    return;
  }

  let cid = bytes32ToCid(allowlistCid);
  module.activeRoot = merkleRoot;
  module.activeAllowlistCid = cid;
  // Link to the ZkEmailAllowlist entity (populated once the IPFS content is indexed).
  module.activeAllowlist = cid;
  module.lastUpdatedAt = event.block.timestamp;
  module.save();

  // Fetch + index the allowlist JSON. Resilient: if IPFS is slow/unavailable, on-chain indexing
  // continues and activeAllowlist simply resolves null until the file lands.
  createAllowlistDataSource(allowlistCid, moduleAddress);
}

/** How a User entity id is derived elsewhere in this subgraph: orgId-userAddress. */
function userId(orgId: Bytes, claimer: Address): string {
  return orgId.toHexString() + "-" + claimer.toHexString();
}

/**
 * Record one claim, its nullifier, and (for specific-address claims) the address's now-spent
 * registration. Shared by all four claim events so the four paths cannot drift.
 *
 * `nullifier` is null for the RegisteredAndClaimed* onboarding variants: those events carry a
 * passkey credentialId instead, even though the contract still consumes a nullifier internally.
 */
function recordClaim(
  event: ethereum.Event,
  claimer: Address,
  kind: string,
  identifierHash: Bytes,
  hatIds: BigInt[],
  nullifier: Bytes | null,
  registeredUsername: string | null,
  credentialId: Bytes | null
): void {
  let moduleAddress = event.address;
  let module = ZkEmailInvites.load(moduleAddress);
  if (module == null) {
    return;
  }

  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let claim = new ZkEmailClaim(id);
  claim.module = moduleAddress;
  claim.organization = module.organization;
  claim.claimer = claimer;
  claim.claimerUsername = getUsernameForAddress(claimer);
  // Link the User only when one already exists for this org — membership is indexed from the
  // Hats TransferSingle handler, which may run after this event inside the same transaction.
  let uid = userId(module.organization, claimer);
  if (User.load(uid) != null) {
    claim.claimerUser = uid;
  }
  claim.kind = kind;
  claim.identifierHash = identifierHash;
  claim.hatIds = hatIds;
  claim.nullifier = nullifier;
  claim.registeredUsername = registeredUsername;
  claim.credentialId = credentialId;
  claim.claimedAt = event.block.timestamp;
  claim.claimedAtBlock = event.block.number;
  claim.transactionHash = event.transaction.hash;
  claim.save();

  // The per-message replay guard. Immutable: a nullifier is set once and never unset.
  if (nullifier !== null) {
    let nid = moduleAddress.toHexString() + "-" + (nullifier as Bytes).toHexString();
    if (ZkEmailNullifier.load(nid) == null) {
      let n = new ZkEmailNullifier(nid);
      n.module = moduleAddress;
      n.nullifier = nullifier as Bytes;
      n.usedAt = event.block.timestamp;
      n.usedAtBlock = event.block.number;
      n.save();
    }
  }

  // A specific-address claim consumes that address's ONE registration (the contract reverts
  // EmailAlreadyRegistered on a second attempt). Domain claims have no such limit, so they
  // must not write this row.
  if (kind == "Email") {
    let rid = moduleAddress.toHexString() + "-" + identifierHash.toHexString();
    let reg = ZkEmailRegisteredEmail.load(rid);
    if (reg == null) {
      reg = new ZkEmailRegisteredEmail(rid);
      reg.module = moduleAddress;
      reg.emailHash = identifierHash;
    }
    reg.registered = true;
    reg.claimer = claimer;
    reg.claimedAt = event.block.timestamp;
    reg.clearedAt = null;
    reg.save();
  }

  module.claimCount = module.claimCount + 1;
  module.lastUpdatedAt = event.block.timestamp;
  module.save();
}

/**
 * RoleClaimedByDomain(address indexed claimer, bytes32 indexed domainHash, uint256[] hatIds, bytes32 nullifier).
 * Membership itself is indexed from the Hats TransferSingle/Batch handler; this records the
 * claim's provenance (who, via which allowlist entry, for which hats).
 */
export function handleRoleClaimedByDomain(event: RoleClaimedByDomainEvent): void {
  recordClaim(
    event,
    event.params.claimer,
    "Domain",
    event.params.domainHash,
    event.params.hatIds,
    event.params.nullifier,
    null,
    null
  );
}

/**
 * RoleClaimedByEmail(address indexed claimer, bytes32 indexed emailHash, uint256[] hatIds, bytes32 nullifier).
 */
export function handleRoleClaimedByEmail(event: RoleClaimedByEmailEvent): void {
  recordClaim(
    event,
    event.params.claimer,
    "Email",
    event.params.emailHash,
    event.params.hatIds,
    event.params.nullifier,
    null,
    null
  );
}

/**
 * RegisteredAndClaimedByDomain(address indexed account, bytes32 indexed credentialId, string username,
 * bytes32 indexed domainHash, uint256[] hatIds) — the passkey onboarding path, where registering a
 * username and claiming the role happen in one transaction. Previously not indexed at all.
 */
export function handleRegisteredAndClaimedByDomain(event: RegisteredAndClaimedByDomainEvent): void {
  recordClaim(
    event,
    event.params.account,
    "Domain",
    event.params.domainHash,
    event.params.hatIds,
    null,
    event.params.username,
    event.params.credentialId
  );
}

/**
 * RegisteredAndClaimedByEmail(...) — onboarding via a specific-address allowlist entry.
 */
export function handleRegisteredAndClaimedByEmail(event: RegisteredAndClaimedByEmailEvent): void {
  recordClaim(
    event,
    event.params.account,
    "Email",
    event.params.emailHash,
    event.params.hatIds,
    null,
    event.params.username,
    event.params.credentialId
  );
}

/**
 * RegisteredEmailCleared(bytes32 indexed emailHash) — governance freed an address to claim again.
 *
 * Creates the row when absent: the module can be told to clear an address that never claimed
 * through THIS subgraph's indexed range, and recording registered=false is still the truth.
 */
export function handleRegisteredEmailCleared(event: RegisteredEmailClearedEvent): void {
  let moduleAddress = event.address;
  let module = ZkEmailInvites.load(moduleAddress);
  if (module == null) {
    return;
  }

  let rid = moduleAddress.toHexString() + "-" + event.params.emailHash.toHexString();
  let reg = ZkEmailRegisteredEmail.load(rid);
  if (reg == null) {
    reg = new ZkEmailRegisteredEmail(rid);
    reg.module = moduleAddress;
    reg.emailHash = event.params.emailHash;
    reg.claimedAt = null;
    reg.claimer = null;
  }
  reg.registered = false;
  reg.clearedAt = event.block.timestamp;
  reg.save();

  module.lastUpdatedAt = event.block.timestamp;
  module.save();
}

/* ─────────────────── Module wiring ─────────────────── */

function touch(moduleAddress: Bytes, timestamp: BigInt): ZkEmailInvites | null {
  let module = ZkEmailInvites.load(moduleAddress);
  if (module == null) {
    return null;
  }
  module.lastUpdatedAt = timestamp;
  ensureExecutor(module as ZkEmailInvites, moduleAddress);
  return module;
}

/**
 * Resolve the module's executor once, lazily.
 *
 * Unlike the verifiers and registries, `executor` has NO event: it is set in initialize() and
 * has no setter. Reading it therefore requires a contract call — but only ever one, and only
 * from a wiring handler, which by definition runs at/after initialize(), so the getter is
 * guaranteed live (calling it from the registration handler would revert, since the proxy is
 * registered before it is initialized).
 *
 * This matters because the module's executor is what actually gates setActiveAllowlist. It is
 * normally the org's Executor, but a module installed against a different one — or an executor
 * rotation — makes every governance proposal to update the allowlist unexecutable, and that is
 * invisible without this field.
 */
function ensureExecutor(module: ZkEmailInvites, moduleAddress: Bytes): void {
  if (module.executor !== null) {
    return;
  }
  let c = ZkEmailInvitesContract.bind(Address.fromBytes(moduleAddress));
  let executor = c.try_executor();
  if (!executor.reverted) {
    module.executor = executor.value;
  }
}

export function handleDomainVerifierUpdated(event: DomainVerifierUpdatedEvent): void {
  let module = touch(event.address, event.block.timestamp);
  if (module == null) return;
  module.domainVerifier = event.params.verifier;
  module.save();
}

export function handleEmailVerifierUpdated(event: EmailVerifierUpdatedEvent): void {
  let module = touch(event.address, event.block.timestamp);
  if (module == null) return;
  module.emailVerifier = event.params.verifier;
  module.save();
}

export function handleDKIMRegistryUpdated(event: DKIMRegistryUpdatedEvent): void {
  let module = touch(event.address, event.block.timestamp);
  if (module == null) return;
  module.dkimRegistry = event.params.registry;
  module.save();
}

export function handleAccountRegistryUpdated(event: AccountRegistryUpdatedEvent): void {
  let module = touch(event.address, event.block.timestamp);
  if (module == null) return;
  module.accountRegistry = event.params.registry;
  module.save();
}

export function handleUniversalFactoryUpdated(event: UniversalFactoryUpdatedEvent): void {
  let module = touch(event.address, event.block.timestamp);
  if (module == null) return;
  module.universalFactory = event.params.factory;
  module.save();
}
