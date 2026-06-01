import { Address, BigInt, Bytes, DataSourceContext } from "@graphprotocol/graph-ts";
import {
  OrgRegistered as OrgRegisteredEvent,
  MetaUpdated as MetaUpdatedEvent,
  ContractRegistered as ContractRegisteredEvent,
  OrgMetadataAdminHatSet as OrgMetadataAdminHatSetEvent,
  HatsTreeRegistered as HatsTreeRegisteredEvent
} from "../generated/templates/OrgRegistry/OrgRegistry";
import {
  OrgRegistryContract,
  Organization,
  OrgMetaUpdate,
  OrgMetadata,
  RegisteredContract,
  SwitchableBeaconContract,
  EducationHubContract,
  ParticipationTokenContract
} from "../generated/schema";
import { SwitchableBeacon as SwitchableBeaconTemplate } from "../generated/templates";
import { OrgMetadata as OrgMetadataTemplate } from "../generated/templates";
import { EducationHub as EducationHubTemplate } from "../generated/templates";
import { getOrCreateRole } from "./utils";

// 20-byte zero address. Optional module pointers (e.g. Organization.educationHub) are set to the
// zero-address entity at deploy time when the module was not deployed with the org.
const ZERO_ADDRESS: Bytes = Bytes.fromHexString("0x0000000000000000000000000000000000000000");

// keccak256("EducationHub") — the OrgRegistry typeId for the EducationHub module.
// EducationHub is the only module that is OPTIONAL at org-deployment time
// (ModulesFactory.EducationHubConfig.enabled); every other module is always deployed, and
// OrgRegistry.registerOrgContract reverts `TypeTaken` for an already-registered type. So the
// post-deployment registration path can only ever introduce an EducationHub today.
const EDUCATION_HUB_TYPE_ID: Bytes = Bytes.fromHexString(
  "0xa871f070b566fe185ede7c7d071cb2f92e7c75c6a2912b6f37c86a50cdc6bad3"
);

/**
 * Helper function to convert bytes32 sha256 digest to IPFS CIDv0.
 *
 * CIDv0 = base58( 0x1220 + sha256_digest )
 * - 0x12 = sha2-256 multicodec
 * - 0x20 = 32 bytes length
 * - sha256_digest = 32 bytes (the bytes32 from contract)
 */
function bytes32ToCid(hash: Bytes): string {
  // Create the multihash by prepending 0x1220 header
  let prefix = Bytes.fromHexString("0x1220");

  // Concatenate prefix + hash (34 bytes total)
  let multihash = new Bytes(34);
  for (let i = 0; i < 2; i++) {
    multihash[i] = prefix[i];
  }
  for (let i = 0; i < 32; i++) {
    multihash[i + 2] = hash[i];
  }

  // Base58 encode to get CIDv0 (starts with "Qm")
  return multihash.toBase58();
}

/**
 * Helper function to create an IPFS file data source for org metadata.
 * Uses DataSourceContext to pass the orgId to the handler so it can
 * link the metadata back to the organization.
 *
 * The contract stores bytes32 which is the sha256 digest from the IPFS CID.
 * We convert it back to CIDv0 format for The Graph to fetch.
 */
function createIpfsDataSource(metadataHash: Bytes, orgId: Bytes): void {
  // Skip if metadataHash is empty (all zeros)
  if (metadataHash.equals(Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"))) {
    return;
  }

  // Convert bytes32 sha256 digest to IPFS CIDv0 string
  let ipfsCid = bytes32ToCid(metadataHash);

  // Skip if metadata already indexed (prevents duplicate IPFS data sources
  // which would cause INSERT conflicts for immutable OrgMetadataLink children)
  let existing = OrgMetadata.load(ipfsCid);
  if (existing != null) {
    return;
  }

  // Create context to pass orgId to the IPFS handler
  let context = new DataSourceContext();
  context.setBytes("orgId", orgId);

  OrgMetadataTemplate.createWithContext(ipfsCid, context);
}

/**
 * Helper function to get or create the OrgRegistryContract singleton
 */
function getOrCreateOrgRegistry(contractAddress: Bytes, timestamp: BigInt, blockNumber: BigInt): OrgRegistryContract {
  let registry = OrgRegistryContract.load(contractAddress);
  if (!registry) {
    registry = new OrgRegistryContract(contractAddress);
    registry.totalOrgs = BigInt.fromI32(0);
    registry.totalContracts = BigInt.fromI32(0);
    registry.createdAt = timestamp;
    registry.createdAtBlock = blockNumber;
    registry.save();
  }
  return registry;
}

/**
 * Handles OrgRegistered event
 * Updates the Organization entity with name and metadata from OrgRegistry
 * Also triggers IPFS indexing for the metadata content
 */
export function handleOrgRegistered(event: OrgRegisteredEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let name = event.params.name;
  let metadataHash = event.params.metadataHash;

  // Get or create registry
  let registry = getOrCreateOrgRegistry(
    contractAddress,
    event.block.timestamp,
    event.block.number
  );

  // Increment total orgs for this registration
  registry.totalOrgs = registry.totalOrgs.plus(BigInt.fromI32(1));
  registry.save();

  // Load or create Organization (OrgRegistered may fire before OrgDeployed)
  let org = Organization.load(orgId);
  if (!org) {
    org = new Organization(orgId);
  }

  let orgName = name.toString();
  org.name = orgName;
  org.metadataHash = metadataHash;

  // Link to metadata entity (will be populated when IPFS content is indexed)
  // Use CIDv0 format as the metadata ID (must match the ID used in org-metadata.ts)
  // Skip for zero hash (no metadata)
  if (!metadataHash.equals(Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"))) {
    let metadataId = bytes32ToCid(metadataHash);
    org.metadata = metadataId;
  }

  org.lastUpdatedAt = event.block.timestamp;
  org.save();

  // Create IPFS file data source to fetch and index the metadata content
  // This is resilient - if IPFS is slow/unavailable, main indexing continues
  createIpfsDataSource(metadataHash, orgId);
}

/**
 * Handles MetaUpdated event
 * Updates the org's metadata and creates a history record
 * Also triggers IPFS indexing for the new metadata content
 */
export function handleMetaUpdated(event: MetaUpdatedEvent): void {
  let orgId = event.params.orgId;
  let newName = event.params.newName;
  let newMetadataHash = event.params.newMetadataHash;

  // Load Organization
  let org = Organization.load(orgId);
  if (org) {
    let newOrgName = newName.toString();

    org.name = newOrgName;
    org.metadataHash = newMetadataHash;

    // Link to new metadata entity (will be populated when IPFS content is indexed)
    // Use CIDv0 format as the metadata ID (must match the ID used in org-metadata.ts)
    // Skip for zero hash (no metadata)
    if (!newMetadataHash.equals(Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"))) {
      let metadataId = bytes32ToCid(newMetadataHash);
      org.metadata = metadataId;
    } else {
      org.metadata = null;
    }

    org.lastUpdatedAt = event.block.timestamp;
    org.save();

    // Create history record
    let updateId = event.transaction.hash.concatI32(event.logIndex.toI32());
    let update = new OrgMetaUpdate(updateId);

    update.organization = orgId;
    update.orgId = orgId;
    update.newName = newOrgName;
    update.newMetadataHash = newMetadataHash;
    update.updatedAt = event.block.timestamp;
    update.updatedAtBlock = event.block.number;
    update.transactionHash = event.transaction.hash;

    update.save();

    // Create IPFS file data source for the new metadata
    // This is resilient - if IPFS is slow/unavailable, main indexing continues
    createIpfsDataSource(newMetadataHash, orgId);
  }
}

/**
 * Handles ContractRegistered event
 * Creates a new RegisteredContract entity and updates counters
 */
export function handleContractRegistered(event: ContractRegisteredEvent): void {
  let contractAddress = event.address;
  let contractId = event.params.contractId;
  let orgId = event.params.orgId;
  let typeId = event.params.typeId;
  let proxy = event.params.proxy;
  let beacon = event.params.beacon;
  let autoUpgrade = event.params.autoUpgrade;
  let owner = event.params.owner;

  // Get or create registry
  let registry = getOrCreateOrgRegistry(
    contractAddress,
    event.block.timestamp,
    event.block.number
  );

  // Create registered contract entity
  let registeredContract = new RegisteredContract(contractId);
  registeredContract.orgRegistry = contractAddress;
  registeredContract.organization = orgId;
  registeredContract.orgId = orgId;
  registeredContract.typeId = typeId;
  registeredContract.proxy = proxy;
  registeredContract.beacon = beacon;
  registeredContract.autoUpgrade = autoUpgrade;
  registeredContract.owner = owner;
  registeredContract.registeredAt = event.block.timestamp;
  registeredContract.registeredAtBlock = event.block.number;
  registeredContract.lastUpdatedAt = event.block.timestamp;
  registeredContract.transactionHash = event.transaction.hash;
  registeredContract.save();

  // Update registry total contracts
  registry.totalContracts = registry.totalContracts.plus(BigInt.fromI32(1));
  registry.save();

  // Create SwitchableBeaconContract entity and dynamic data source
  let beaconEntity = new SwitchableBeaconContract(beacon);
  beaconEntity.registeredContract = contractId;
  beaconEntity.organization = orgId;
  beaconEntity.typeId = typeId;
  beaconEntity.owner = owner;
  beaconEntity.mode = autoUpgrade ? "Mirror" : "Static";
  beaconEntity.createdAt = event.block.timestamp;
  beaconEntity.createdAtBlock = event.block.number;
  beaconEntity.save();

  // Create dynamic data source to index SwitchableBeacon events
  SwitchableBeaconTemplate.create(beacon);

  // Wire any module that is added to the org AFTER initial deployment (e.g. an EducationHub
  // enabled via governance later). handleOrgDeployed only wires modules present at deploy time, so
  // without this a post-hoc registration leaves Organization.educationHub pointing at the zero
  // entity and the module's events never index.
  wirePostDeployModule(orgId, typeId, proxy, event);
}

/**
 * Wire a module registered AFTER the org's initial deployment into its typed Organization pointer
 * and spin up its data-source template. No-op during the initial-deployment transaction (that is
 * handled by handleOrgDeployed) and idempotent for modules already wired.
 *
 * Why this is keyed on typeId rather than handling every module: registerOrgContract reverts
 * `TypeTaken` once a (orgId, typeId) pair is registered, so the only module that can legitimately
 * arrive through this path is one that was absent at deploy. EducationHub is the sole optional
 * module today; additional optional modules can be added as `else if` branches below.
 */
function wirePostDeployModule(orgId: Bytes, typeId: Bytes, proxy: Bytes, event: ContractRegisteredEvent): void {
  let org = Organization.load(orgId);
  // deployedAtBlock is null until handleOrgDeployed runs. Guarding on it makes this robust to the
  // event ordering inside the deployment tx: if ContractRegistered fires before OrgDeployed we skip
  // (OrgDeployed will wire the module + template), avoiding a duplicate dynamic data source.
  if (org == null || org.deployedAtBlock === null) {
    return;
  }

  if (typeId.equals(EDUCATION_HUB_TYPE_ID)) {
    // Idempotent: if the org already points at a real (non-zero) EducationHub, do nothing.
    let current = org.educationHub;
    if (current !== null && !changetype<Bytes>(current).equals(ZERO_ADDRESS)) {
      return;
    }

    // The module's own initializer events (TokenSet/HatsSet/ExecutorSet) were emitted before this
    // proxy's template exists, so they will not backfill. Seed the entity from known org context
    // instead; handleTokenSet/HatsSet/ExecutorSet will keep it current from here on.
    let eduHub = new EducationHubContract(proxy);
    eduHub.organization = org.id;
    eduHub.token = org.participationToken !== null ? changetype<Bytes>(org.participationToken) : ZERO_ADDRESS;
    eduHub.executor = org.executorContract !== null ? changetype<Bytes>(org.executorContract) : ZERO_ADDRESS;
    eduHub.hatsContract = resolveOrgHats(org);
    eduHub.isPaused = false;
    eduHub.nextModuleId = BigInt.fromI32(0);
    eduHub.createdAt = event.block.timestamp;
    eduHub.createdAtBlock = event.block.number;
    eduHub.save();

    org.educationHub = proxy;
    org.lastUpdatedAt = event.block.timestamp;
    org.save();

    // Index the module's modules/completions/permission changes from this block forward.
    EducationHubTemplate.create(Address.fromBytes(proxy));
  }
}

/**
 * Best-effort lookup of the org's Hats Protocol address from an already-indexed module entity.
 * Falls back to the zero address (handleHatsSet will correct it if setHats is ever called).
 */
function resolveOrgHats(org: Organization): Bytes {
  let pt = org.participationToken;
  if (pt !== null) {
    let ptc = ParticipationTokenContract.load(changetype<Bytes>(pt));
    if (ptc != null && !ptc.hatsContract.equals(ZERO_ADDRESS)) {
      return ptc.hatsContract;
    }
  }
  return ZERO_ADDRESS;
}

/**
 * Handles OrgMetadataAdminHatSet event
 * Updates the organization's metadata admin hat ID
 */
export function handleOrgMetadataAdminHatSet(event: OrgMetadataAdminHatSetEvent): void {
  let org = Organization.load(event.params.orgId);
  if (org) {
    org.metadataAdminHatId = event.params.hatId;
    org.lastUpdatedAt = event.block.timestamp;
    org.save();
  }
}

/**
 * Handles HatsTreeRegistered event
 * Updates the Organization with topHatId and roleHatIds
 * Note: Organization already has topHatId/roleHatIds from OrgDeployed,
 * but this event can update them if the hats tree is modified
 */
export function handleHatsTreeRegistered(event: HatsTreeRegisteredEvent): void {
  let orgId = event.params.orgId;
  let topHatId = event.params.topHatId;
  let roleHatIds = event.params.roleHatIds;

  // Load and update Organization
  let org = Organization.load(orgId);
  if (org) {
    org.topHatId = topHatId;
    org.roleHatIds = roleHatIds;
    org.lastUpdatedAt = event.block.timestamp;
    org.save();

    // Create Role entities for topHatId and all roleHatIds
    getOrCreateRole(orgId, topHatId, event);

    for (let i = 0; i < roleHatIds.length; i++) {
      getOrCreateRole(orgId, roleHatIds[i], event);
    }
  }
}
