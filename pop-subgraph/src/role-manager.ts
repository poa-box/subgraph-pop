import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  RoleManagerInitialized as RoleManagerInitializedEvent,
  ModulesWired as ModulesWiredEvent,
  RoleCreated as RoleCreatedEvent,
  GroupCreated as GroupCreatedEvent,
  RoleGroupMembershipChanged as RoleGroupMembershipChangedEvent,
  RoleWiringApplied as RoleWiringAppliedEvent,
  RoleOffered as RoleOfferedEvent,
  RoleGranted as RoleGrantedEvent,
  RoleRevoked as RoleRevokedEvent,
  BudgetSkipped as BudgetSkippedEvent
} from "../generated/templates/RoleManager/RoleManager";
import {
  RoleManagerContract,
  ManagedRoleRef,
  RoleGroup,
  RoleGroupMembership,
  RoleOffer,
  Organization
} from "../generated/schema";
import { getUsernameForAddress, getOrCreateRole } from "./utils";

// 32-byte zero digest — a zero metadataCID means "no metadata".
const ZERO_HASH: Bytes = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");

/** roleManagerAddress-roleId — the ManagedRoleRef id (RoleManager internal roleId -> Role). */
function refId(roleManager: Bytes, roleId: BigInt): string {
  return roleManager.toHexString() + "-" + roleId.toString();
}

/** orgId-groupId — the RoleGroup id. */
function groupEntityId(orgId: Bytes, groupId: BigInt): string {
  return orgId.toHexString() + "-" + groupId.toString();
}

/**
 * RoleManagerInitialized(executor, orgId, eligibilityModule) — emitted inside initialize(), captured
 * because the data-source template is created at ContractRegistered (org-registry.ts) BEFORE
 * initialize() runs. Seeds the module-wiring pointers with zero eth_calls.
 */
export function handleRoleManagerInitialized(event: RoleManagerInitializedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    // Registration handler creates the entity; if it is somehow missing, skip rather than create a
    // row without its required `organization` link.
    return;
  }
  rm.executor = event.params.executor;
  rm.eligibilityModule = event.params.eligibilityModule;
  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * ModulesWired(...) — the sibling-module addresses RoleManager fans permission changes out to.
 * Mirrored onto the contract entity so one query renders the module's wiring.
 */
export function handleModulesWired(event: ModulesWiredEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  rm.ddVoting = event.params.ddVoting;
  rm.hybridVoting = event.params.hybridVoting;
  rm.taskManager = event.params.taskManager;
  rm.participationToken = event.params.participationToken;
  rm.educationHub = event.params.educationHub;
  rm.quickJoin = event.params.quickJoin;
  rm.paymasterHub = event.params.paymasterHub;
  rm.hats = event.params.hats;
  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * RoleCreated(roleId, hatId, name, metadataCID, isExisting) — a first-class IDENTITY role. The
 * identity hat's Hat + Role entities already exist (createHatWithEligibility emitted
 * HatCreatedWithEligibility earlier in the same tx, which flagged isUserRole=true and appended the
 * hatId to Organization.roleHatIds — exactly what we want for identity roles). Here we attach the
 * RoleManager naming + build the roleId -> Role reverse index used by the membership/offer handlers.
 */
export function handleRoleCreated(event: RoleCreatedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  let orgId = changetype<Bytes>(rm.organization);
  let roleId = event.params.roleId;
  let hatId = event.params.hatId;

  // getOrCreateRole also maintains HatLookup so bare-hatId Hats events resolve to this role.
  let role = getOrCreateRole(orgId, hatId, event);
  role.roleManager = event.address;
  role.roleManagerRoleId = roleId;
  role.isGroupMarker = false;
  // Identity roles are pickable user roles. HatCreatedWithEligibility usually set this already, but
  // registerExistingRole (adoption of a genesis hat) has no such event — set it here.
  role.isUserRole = true;
  if (event.params.name.length > 0) {
    role.name = event.params.name;
  }
  if (!event.params.metadataCID.equals(ZERO_HASH)) {
    role.metadataCID = event.params.metadataCID;
  }
  role.save();

  let ref = ManagedRoleRef.load(refId(event.address, roleId));
  if (ref == null) {
    ref = new ManagedRoleRef(refId(event.address, roleId));
    ref.roleManager = event.address;
    ref.organization = orgId;
    ref.roleId = roleId;
  }
  ref.hatId = hatId;
  ref.role = role.id;
  ref.isGroupMarker = false;
  ref.save();

  // roleCount increments (++l.roleCount) so the new roleId equals the live count.
  if (roleId.gt(rm.roleCount)) {
    rm.roleCount = roleId;
  }
  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * GroupCreated(groupId, markerHatId, name, metadataCID) — a role GROUP (Executives). The marker hat
 * was minted via createHatWithEligibility earlier in the same tx (createGroup) OR pre-exists
 * (registerExistingGroup). Either way HatCreatedWithEligibility — when it fired — appended the
 * markerHatId to Organization.roleHatIds and flagged its Role isUserRole=true. Markers must NOT
 * appear in role/election/vouching pickers, so this handler flips isGroupMarker on, isUserRole off,
 * and removes the markerHatId from Organization.roleHatIds.
 */
export function handleGroupCreated(event: GroupCreatedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  let orgId = changetype<Bytes>(rm.organization);
  let groupId = event.params.groupId;
  let markerHatId = event.params.markerHatId;

  let markerRole = getOrCreateRole(orgId, markerHatId, event);
  // Heuristic for adoption vs fresh: a fresh marker's Hat entity was created THIS block
  // (HatCreatedWithEligibility, same tx); an adopted (genesis) marker's Hat predates this block.
  let markerHat = markerRole.hat;
  let isExisting = false;
  if (markerHat !== null) {
    // markerRole.hat is the Hat entity id string; but we track adoption via createdAtBlock on the
    // Role entity, which is set when the Role was first observed.
    isExisting = markerRole.createdAtBlock.lt(event.block.number);
  }

  markerRole.isGroupMarker = true;
  markerRole.isUserRole = false;
  markerRole.roleManager = event.address;
  if (event.params.name.length > 0) {
    markerRole.name = event.params.name;
  }
  markerRole.save();

  // Remove the marker hat from the org's role-picker list (HatCreatedWithEligibility appended it).
  let org = Organization.load(orgId);
  if (org !== null) {
    let existing = org.roleHatIds;
    if (existing !== null && existing.length > 0) {
      let filtered = new Array<BigInt>(0);
      for (let i = 0; i < existing.length; i++) {
        if (!existing[i].equals(markerHatId)) {
          filtered.push(existing[i]);
        }
      }
      org.roleHatIds = filtered;
      org.lastUpdatedAt = event.block.timestamp;
      org.save();
    }
  }

  let group = RoleGroup.load(groupEntityId(orgId, groupId));
  if (group == null) {
    group = new RoleGroup(groupEntityId(orgId, groupId));
    group.roleManager = event.address;
    group.organization = orgId;
    group.groupId = groupId;
    group.markerHatId = markerHatId;
    group.createdAt = event.block.timestamp;
    group.createdAtBlock = event.block.number;
    group.transactionHash = event.transaction.hash;
  }
  group.markerHatId = markerHatId;
  group.markerRole = markerRole.id;
  group.isExisting = isExisting;
  if (event.params.name.length > 0) {
    group.name = event.params.name;
  }
  if (!event.params.metadataCID.equals(ZERO_HASH)) {
    group.metadataCID = event.params.metadataCID;
  }
  group.lastUpdatedAt = event.block.timestamp;
  group.save();

  if (groupId.gt(rm.groupCount)) {
    rm.groupCount = groupId;
  }
  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * RoleGroupMembershipChanged(roleId, groupId, added) — an identity role joined/left a group.
 * `isActive` flips rather than deleting the row so membership history survives.
 */
export function handleRoleGroupMembershipChanged(event: RoleGroupMembershipChangedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  let orgId = changetype<Bytes>(rm.organization);
  let roleId = event.params.roleId;
  let groupId = event.params.groupId;

  let membershipId = orgId.toHexString() + "-" + groupId.toString() + "-" + roleId.toString();
  let membership = RoleGroupMembership.load(membershipId);
  if (membership == null) {
    membership = new RoleGroupMembership(membershipId);
    membership.group = groupEntityId(orgId, groupId);
    membership.roleManager = event.address;
    membership.organization = orgId;
    membership.roleManagerRoleId = roleId;
    membership.addedAt = event.block.timestamp;
    // Resolve the member Role via the roleId -> hat/role index (RoleCreated ran first).
    let ref = ManagedRoleRef.load(refId(event.address, roleId));
    if (ref !== null) {
      membership.role = ref.role;
    }
  }
  membership.isActive = event.params.added;
  membership.updatedAt = event.block.timestamp;
  membership.transactionHash = event.transaction.hash;
  membership.save();

  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * RoleWiringApplied(id, hatId, isGroup) — a typed permission fan-out ran on a role/group hat. The
 * resulting per-module permission state is indexed from the module events themselves (HatPermission,
 * GlobalRolePermission) on the hat, so this is informational only. See PLAN.md §1.3.
 */
export function handleRoleWiringApplied(event: RoleWiringAppliedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * RoleOffered(roleId, user, hatId) — a grantRole to a NON-member recorded an offer (explicit EM
 * eligibility only, no mint). The user accepts via EligibilityModule.claimHats, surfaced as
 * HatClaimed on the identity hat (see eligibility-module.ts handleHatClaimed, which flips this row
 * to Accepted). Keyed orgId-hatId-user so that handler can resolve it without the RoleManager roleId.
 */
export function handleRoleOffered(event: RoleOfferedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  let orgId = changetype<Bytes>(rm.organization);
  let hatId = event.params.hatId;
  let user = event.params.user;

  let role = getOrCreateRole(orgId, hatId, event);

  let offerId = orgId.toHexString() + "-" + hatId.toString() + "-" + user.toHexString();
  let offer = RoleOffer.load(offerId);
  if (offer == null) {
    offer = new RoleOffer(offerId);
    offer.roleManager = event.address;
    offer.organization = orgId;
    offer.hatId = hatId;
    offer.user = user;
    offer.offeredAt = event.block.timestamp;
    offer.offeredAtBlock = event.block.number;
  }
  offer.roleManagerRoleId = event.params.roleId;
  offer.role = role.id;
  offer.userUsername = getUsernameForAddress(Address.fromBytes(user));
  offer.status = "Offered";
  offer.transactionHash = event.transaction.hash;
  offer.save();

  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * RoleGranted(roleId, user, minted) — an in-org grant that minted the identity (+ marker) hats
 * directly (no offer). RoleWearer rows are created by the Hats TransferSingle handler. If a prior
 * offer to this user existed, mark it Accepted for coherence.
 */
export function handleRoleGranted(event: RoleGrantedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  let orgId = changetype<Bytes>(rm.organization);
  let ref = ManagedRoleRef.load(refId(event.address, event.params.roleId));
  if (ref !== null) {
    let offerId = orgId.toHexString() + "-" + ref.hatId.toString() + "-" + event.params.user.toHexString();
    let offer = RoleOffer.load(offerId);
    if (offer !== null && offer.status != "Accepted") {
      offer.status = "Accepted";
      offer.acceptedAt = event.block.timestamp;
      offer.save();
    }
  }
  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * RoleRevoked(roleId, user, wasWearing) — an explicit eligibility clear (also cancels an unaccepted
 * offer). RoleWearer.isActive is driven off the Hats TransferSingle burn, so this is informational
 * at the RoleManager level.
 */
export function handleRoleRevoked(event: RoleRevokedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}

/**
 * BudgetSkipped(hatId) — createRole/createGroup could not set a per-hat paymaster budget (RoleManager
 * does not wear the operator hat). Informational; no budget state is tracked in the subgraph.
 */
export function handleBudgetSkipped(event: BudgetSkippedEvent): void {
  let rm = RoleManagerContract.load(event.address);
  if (rm == null) {
    return;
  }
  rm.lastUpdatedAt = event.block.timestamp;
  rm.save();
}
