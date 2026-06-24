import { Address, BigInt, Bytes, DataSourceContext } from "@graphprotocol/graph-ts";
import {
  ActiveAllowlistSet as ActiveAllowlistSetEvent,
  RoleClaimedByDomain as RoleClaimedByDomainEvent,
  RoleClaimedByEmail as RoleClaimedByEmailEvent
} from "../generated/templates/ZkEmailInvites/ZkEmailInvites";
import { ZkEmailInvites } from "../generated/schema";
import { ZkEmailAllowlist as ZkEmailAllowlistTemplate } from "../generated/templates";

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

/**
 * RoleClaimedByDomain(address indexed claimer, bytes32 indexed domainHash, uint256[] hatIds, bytes32 nullifier).
 * Membership itself is indexed from the Hats TransferSingle/Batch handler; here we only freshen the
 * module's lastUpdatedAt so consumers can see recent activity.
 */
export function handleRoleClaimedByDomain(event: RoleClaimedByDomainEvent): void {
  let module = ZkEmailInvites.load(event.address);
  if (module == null) {
    return;
  }
  module.lastUpdatedAt = event.block.timestamp;
  module.save();
}

/**
 * RoleClaimedByEmail(address indexed claimer, bytes32 indexed emailHash, uint256[] hatIds, bytes32 nullifier).
 * Light-touch like handleRoleClaimedByDomain — membership comes from the Hats handler.
 */
export function handleRoleClaimedByEmail(event: RoleClaimedByEmailEvent): void {
  let module = ZkEmailInvites.load(event.address);
  if (module == null) {
    return;
  }
  module.lastUpdatedAt = event.block.timestamp;
  module.save();
}
