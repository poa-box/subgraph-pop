// Utility functions for subgraph event handlers
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  Account,
  User,
  HatPermission,
  ExecutorChange,
  PauseEvent,
  UserHatChange,
  Organization,
  Role,
  RoleWearer,
  Hat,
  HatLookup,
  ExecutorContract,
  EligibilityModuleContract,
} from "../generated/schema";

/**
 * Helper function to get username for an address from UniversalAccountRegistry
 * Returns null if the account doesn't exist or is deleted
 */
export function getUsernameForAddress(address: Address): string | null {
  let account = Account.load(address);
  if (account && !account.isDeleted) {
    return account.username;
  }
  return null;
}

/**
 * Create a User entity when someone officially joins an organization.
 *
 * ONLY call this from JOIN event handlers:
 * - handleQuickJoined / handleQuickJoinedByMaster
 * - handleQuickJoinedWithPasskey / handleQuickJoinedWithPasskeyByMaster
 * - handleHatClaimed
 *
 * Returns null for system contracts (Executor, EligibilityModule).
 *
 * @param joinMethod - How the user joined: "QuickJoin" | "QuickJoinWithPasskey" | "HatClaim"
 */
export function createUserOnJoin(
  orgId: Bytes,
  userAddress: Address,
  joinMethod: string,
  timestamp: BigInt,
  blockNumber: BigInt
): User | null {
  // Skip creating User entities for system contracts
  if (isSystemContract(orgId, userAddress)) {
    return null;
  }

  let userId = orgId.toHexString() + "-" + userAddress.toHexString();
  let user = User.load(userId);

  if (user == null) {
    user = new User(userId);
    user.organization = orgId;
    user.address = userAddress;
    user.participationTokenBalance = BigInt.fromI32(0);
    user.totalVotes = BigInt.fromI32(0);
    user.totalTasksCompleted = BigInt.fromI32(0);
    user.totalTasksCancelled = BigInt.fromI32(0);
    user.totalTasksLostToExpiry = BigInt.fromI32(0);
    user.totalModulesCompleted = BigInt.fromI32(0);
    user.totalClaimsAmount = BigInt.fromI32(0);
    user.totalPaymentsAmount = BigInt.fromI32(0);
    user.totalTokenRequestsAmount = BigInt.fromI32(0);
    user.firstSeenAt = timestamp;
    user.firstSeenAtBlock = blockNumber;
    user.currentHatIds = [];
    user.membershipStatus = "Active";
    user.joinMethod = joinMethod;
  }

  // Update last active timestamp
  user.lastActiveAt = timestamp;
  user.lastActiveAtBlock = blockNumber;

  // Link User to Account by address
  user.account = userAddress;

  user.save();
  return user;
}

/**
 * Load an existing User entity for activity tracking.
 *
 * ONLY call this from ACTIVITY event handlers (voting, tasks, payments, etc.)
 * Returns null if the user doesn't exist (hasn't joined yet) or is a system contract.
 *
 * This prevents creating phantom User entities for:
 * - Contract addresses (deployment helpers like HatsTreeSetup)
 * - Users who interact but haven't formally joined via QuickJoin or HatClaim
 */
export function loadExistingUser(
  orgId: Bytes,
  userAddress: Address,
  timestamp: BigInt,
  blockNumber: BigInt
): User | null {
  // Skip system contracts entirely
  if (isSystemContract(orgId, userAddress)) {
    return null;
  }

  let userId = orgId.toHexString() + "-" + userAddress.toHexString();
  let user = User.load(userId);

  if (user != null) {
    // Update activity timestamp for existing users
    user.lastActiveAt = timestamp;
    user.lastActiveAtBlock = blockNumber;
    user.save();
  }

  return user;
}

/**
 * @deprecated Use createUserOnJoin() for join handlers or loadExistingUser() for activity handlers.
 * This function is preserved for backward compatibility but delegates to loadExistingUser()
 * to prevent creating phantom User entities.
 */
export function getOrCreateUser(
  orgId: Bytes,
  userAddress: Address,
  timestamp: BigInt,
  blockNumber: BigInt
): User | null {
  // Delegate to loadExistingUser for safety (don't create new users from activity handlers)
  return loadExistingUser(orgId, userAddress, timestamp, blockNumber);
}

/**
 * Create a consolidated HatPermission entity
 * Used by: HybridVoting, DirectDemocracyVoting, ParticipationToken, QuickJoin, EducationHub
 */
export function createHatPermission(
  contractAddress: Address,
  contractType: string,
  orgId: Bytes,
  hatId: BigInt,
  permissionRole: string,
  allowed: boolean,
  hatType: i32 | null,
  event: ethereum.Event
): HatPermission {
  let id =
    contractAddress.toHexString() +
    "-" +
    hatId.toString() +
    "-" +
    permissionRole;
  let permission = HatPermission.load(id);
  if (permission == null) {
    permission = new HatPermission(id);
    permission.contractAddress = contractAddress;
    permission.contractType = contractType;
    permission.organization = orgId;
    permission.hatId = hatId;
    permission.permissionRole = permissionRole;
  }

  // Get or create the Role entity and link it
  let role = getOrCreateRole(orgId, hatId, event);
  permission.role = role.id;

  permission.allowed = allowed;
  if (hatType !== null) {
    permission.hatType = hatType;
  }
  permission.setAt = event.block.timestamp;
  permission.setAtBlock = event.block.number;
  permission.transactionHash = event.transaction.hash;
  permission.save();
  return permission;
}

/**
 * Backfill HatPermission rows for hats read directly from a voting contract's
 * on-chain enumeration — HybridVoting.creatorHats() and
 * DirectDemocracyVoting.creatorHats()/votingHats().
 *
 * Why this is needed: both voting contracts seed these arrays inside
 * initialize() via HatManager.setHatInArray WITHOUT emitting a per-hat
 * HatSet/CreatorHatSet event — only the post-deploy setters emit. The
 * event-driven handlers therefore never see grants made AT DEPLOYMENT, so a
 * role that can create proposals/polls (or vote in polls) was rendered as "—"
 * in the org permissions matrix. Reading the authoritative on-chain set once,
 * at Initialized (after initialize() has run), closes that gap for both
 * already-deployed and future orgs.
 *
 * Idempotent with the event handlers by design: identical `address-hatId-role`
 * id scheme. If a row already exists we leave it untouched — an event carries
 * the authoritative `allowed` flag and a precise timestamp, and a deploy-time
 * read could only overwrite it with staler data. Conversely, any later
 * grant/revoke flows through handleHatSet / handleCreatorHatSet and overrides
 * what we seed here. hatType is intentionally left null: the array getters do
 * not carry it and no consumer keys off it (the matrix uses contractType +
 * permissionRole + allowed).
 */
export function backfillVotingHatPermissions(
  contractAddress: Address,
  contractType: string,
  orgId: Bytes,
  hatIds: Array<BigInt>,
  permissionRole: string,
  event: ethereum.Event
): void {
  for (let i = 0; i < hatIds.length; i++) {
    let hatId = hatIds[i];
    let id =
      contractAddress.toHexString() + "-" + hatId.toString() + "-" + permissionRole;

    // An event handler already recorded this grant authoritatively — keep it.
    if (HatPermission.load(id) != null) {
      continue;
    }

    let permission = new HatPermission(id);
    permission.contractAddress = contractAddress;
    permission.contractType = contractType;
    permission.organization = orgId;
    permission.hatId = hatId;
    permission.permissionRole = permissionRole;

    // Link to the Role entity (seeded from roleHatIds at OrgDeployed).
    let role = getOrCreateRole(orgId, hatId, event);
    permission.role = role.id;

    permission.allowed = true; // membership in the on-chain array == allowed
    permission.setAt = event.block.timestamp;
    permission.setAtBlock = event.block.number;
    permission.transactionHash = event.transaction.hash;
    permission.save();
  }
}

/**
 * Create a consolidated ExecutorChange entity
 * Used by: DirectDemocracyVoting, QuickJoin, EducationHub
 */
export function createExecutorChange(
  contractAddress: Address,
  contractType: string,
  orgId: Bytes,
  newExecutor: Address,
  event: ethereum.Event
): ExecutorChange {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new ExecutorChange(id);
  change.contractAddress = contractAddress;
  change.contractType = contractType;
  change.organization = orgId;
  change.newExecutor = newExecutor;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
  return change;
}

/**
 * Create a consolidated PauseEvent entity
 * Used by: Executor, EducationHub
 */
export function createPauseEvent(
  contractAddress: Address,
  contractType: string,
  orgId: Bytes,
  isPaused: boolean,
  account: Address,
  event: ethereum.Event
): PauseEvent {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let pauseEvent = new PauseEvent(id);
  pauseEvent.contractAddress = contractAddress;
  pauseEvent.contractType = contractType;
  pauseEvent.organization = orgId;
  pauseEvent.isPaused = isPaused;
  pauseEvent.account = account;
  pauseEvent.eventAt = event.block.timestamp;
  pauseEvent.eventAtBlock = event.block.number;
  pauseEvent.transactionHash = event.transaction.hash;
  pauseEvent.save();
  return pauseEvent;
}

/**
 * Record a hat change for a user and update their currentHatIds
 */
export function recordUserHatChange(
  user: User,
  hatId: BigInt,
  added: boolean,
  event: ethereum.Event
): UserHatChange {
  // Include user.id AND hatId in the ID to ensure uniqueness when:
  // - Bulk events update multiple users (same hatId, different users)
  // - Single user receives multiple hats (same user, different hatIds)
  // UserHatChange is immutable, so duplicate IDs would cause "Failed to transact block operations"
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
    .concat(Bytes.fromUTF8(user.id))
    .concat(Bytes.fromByteArray(Bytes.fromBigInt(hatId)));
  let hatChange = new UserHatChange(id);
  hatChange.user = user.id;
  hatChange.hatId = hatId;
  hatChange.added = added;
  hatChange.changedAt = event.block.timestamp;
  hatChange.changedAtBlock = event.block.number;
  hatChange.transactionHash = event.transaction.hash;
  hatChange.save();

  // Update user's currentHatIds
  let currentHats = user.currentHatIds;
  if (added) {
    // Add hat if not already present
    let found = false;
    for (let i = 0; i < currentHats.length; i++) {
      if (currentHats[i].equals(hatId)) {
        found = true;
        break;
      }
    }
    if (!found) {
      currentHats.push(hatId);
      user.currentHatIds = currentHats;

      // Reactivate user if they were inactive and relink to org
      if (user.membershipStatus == "Inactive") {
        user.membershipStatus = "Active";
        // Restore organization link - extract orgId from user.id (format: orgId-userAddress)
        let parts = user.id.split("-");
        if (parts.length >= 1) {
          let orgId = Bytes.fromHexString(parts[0]);
          user.organization = orgId;
        }
      }
    }
  } else {
    // Remove hat if present
    let newHats: BigInt[] = [];
    for (let i = 0; i < currentHats.length; i++) {
      if (!currentHats[i].equals(hatId)) {
        newHats.push(currentHats[i]);
      }
    }
    user.currentHatIds = newHats;

    // If user has no more active hats, mark inactive and unlink from org
    if (newHats.length == 0) {
      user.membershipStatus = "Inactive";
      user.organization = null;
    }
  }

  user.save();
  return hatChange;
}

/**
 * Get the organization ID from a contract address by loading the related entity
 * and traversing to the organization
 */
export function getOrgIdFromContract(contractAddress: Address): Bytes | null {
  let org = Organization.load(contractAddress);
  if (org) {
    return org.id;
  }
  return null;
}

/**
 * Get or create a Role entity for a given organization and hat ID
 * Roles aggregate permissions and wearers for a hat within an organization
 * @param setIsUserRole - If true, explicitly sets isUserRole field. If false, determines from org.roleHatIds.
 * @param isUserRoleValue - The value to set for isUserRole when setIsUserRole is true.
 */
export function getOrCreateRole(
  orgId: Bytes,
  hatId: BigInt,
  event: ethereum.Event,
  isUserRoleValue: boolean = false,
  setIsUserRole: boolean = false
): Role {
  let roleId = orgId.toHexString() + "-" + hatId.toString();
  let role = Role.load(roleId);

  if (role == null) {
    role = new Role(roleId);
    role.organization = orgId;
    role.hatId = hatId;
    role.createdAt = event.block.timestamp;
    role.createdAtBlock = event.block.number;
    role.transactionHash = event.transaction.hash;

    // Set isUserRole based on parameters or determine from org.roleHatIds
    if (setIsUserRole) {
      role.isUserRole = isUserRoleValue;
    } else {
      // Try to determine from organization's roleHatIds
      let org = Organization.load(orgId);
      if (org) {
        let roleHatIds = org.roleHatIds;
        if (roleHatIds) {
          let found = false;
          for (let i = 0; i < roleHatIds.length; i++) {
            if (roleHatIds[i].equals(hatId)) {
              found = true;
              break;
            }
          }
          role.isUserRole = found;
        }
      }
    }
    role.save();
  } else if (setIsUserRole && role.isUserRole != isUserRoleValue) {
    // Update existing role if we explicitly want to set a different value
    role.isUserRole = isUserRoleValue;
    role.save();
  }

  // Maintain HatLookup so the Hats Protocol TransferSingle handler can resolve
  // a bare hatId back to its org+role context. Idempotent: existing entries
  // are updated only if the role pointer drifts.
  let lookupId = hatId.toString();
  let lookup = HatLookup.load(lookupId);
  if (lookup == null) {
    lookup = new HatLookup(lookupId);
    lookup.hatId = hatId;
    lookup.organization = orgId;
    lookup.role = roleId;
    lookup.save();
  } else if (lookup.role != roleId) {
    // Hat was previously seen under a different org's lookup — that should
    // not happen since hat IDs are globally unique. Log via no-op (subgraph
    // mappings can't `throw`); prefer existing entry.
  }

  return role as Role;
}

/**
 * Ensure HatLookup.hat points at the given Hat entity. Called from the
 * eligibility-module Hat creation sites so that Hats.HatStatusChanged can
 * mark the hat active/inactive without the eligibility module having to
 * fire a corresponding event.
 *
 * If HatLookup hasn't been created yet (no Role yet), we create a minimal
 * lookup pointing at hat-only. The role link will be filled in once
 * getOrCreateRole runs for this hatId.
 */
export function linkHatToLookup(
  hatId: BigInt,
  orgId: Bytes,
  hatEntityId: string
): void {
  let lookupId = hatId.toString();
  let lookup = HatLookup.load(lookupId);
  if (lookup == null) {
    lookup = new HatLookup(lookupId);
    lookup.hatId = hatId;
    lookup.organization = orgId;
    // Role pointer required by schema. Populate with the canonical role id
    // for this org+hat — getOrCreateRole will create the Role entity itself
    // when a wearer is first observed; the dangling reference is fine in
    // graph-node (entity refs aren't enforced as foreign keys).
    lookup.role = orgId.toHexString() + "-" + hatId.toString();
  }
  lookup.hat = hatEntityId;
  lookup.save();
}

/**
 * Apply a Hats Protocol token-state mint to (orgId, wearer, hatId).
 *
 * Treats this as the source of truth for "the wearer holds the hat token":
 *   - Adds hatId to User.currentHatIds (creates the User entity if missing,
 *     using joinMethod="HatTransfer" to flag the unusual entry path).
 *   - Reactivates the User if they had been marked Inactive.
 *   - Upserts a RoleWearer with isActive = true.
 *
 * Idempotent: re-applying for an already-held hat is a no-op.
 */
export function applyHatTransferAdd(
  orgId: Bytes,
  wearer: Address,
  hatId: BigInt,
  event: ethereum.Event
): void {
  if (isSystemContract(orgId, wearer)) {
    return;
  }
  let userId = orgId.toHexString() + "-" + wearer.toHexString();
  let user = User.load(userId);
  if (user == null) {
    // First time we have seen this wallet for this org — they joined by
    // having a hat directly minted/transferred onto them (governance grant,
    // direct mint, etc.) rather than via QuickJoin/HatClaim.
    user = new User(userId);
    user.organization = orgId;
    user.address = wearer;
    user.participationTokenBalance = BigInt.fromI32(0);
    user.totalVotes = BigInt.fromI32(0);
    user.totalTasksCompleted = BigInt.fromI32(0);
    user.totalTasksCancelled = BigInt.fromI32(0);
    user.totalTasksLostToExpiry = BigInt.fromI32(0);
    user.totalModulesCompleted = BigInt.fromI32(0);
    user.totalClaimsAmount = BigInt.fromI32(0);
    user.totalPaymentsAmount = BigInt.fromI32(0);
    user.totalTokenRequestsAmount = BigInt.fromI32(0);
    user.firstSeenAt = event.block.timestamp;
    user.firstSeenAtBlock = event.block.number;
    user.currentHatIds = [];
    user.membershipStatus = "Active";
    user.joinMethod = "HatTransfer";
    user.account = wearer;
  }

  user.lastActiveAt = event.block.timestamp;
  user.lastActiveAtBlock = event.block.number;

  // Add hat if not already present
  let currentHats = user.currentHatIds;
  let found = false;
  for (let i = 0; i < currentHats.length; i++) {
    if (currentHats[i].equals(hatId)) {
      found = true;
      break;
    }
  }
  if (!found) {
    currentHats.push(hatId);
    user.currentHatIds = currentHats;
    if (user.membershipStatus == "Inactive") {
      user.membershipStatus = "Active";
      user.organization = orgId;
    }
    recordHatChangeLog(user, hatId, true, event);
  }
  user.save();

  // Sync RoleWearer (only when a Role exists — system hats may not have one)
  let roleId = orgId.toHexString() + "-" + hatId.toString();
  let role = Role.load(roleId);
  if (role != null && shouldCreateRoleWearer(orgId, hatId, wearer)) {
    let rwId = roleId + "-" + wearer.toHexString();
    let rw = RoleWearer.load(rwId);
    if (rw == null) {
      rw = new RoleWearer(rwId);
      rw.role = roleId;
      rw.user = user.id;
      rw.wearer = wearer;
      rw.wearerUsername = getUsernameForAddress(wearer);
      rw.addedAt = event.block.timestamp;
      rw.addedAtBlock = event.block.number;
      rw.transactionHash = event.transaction.hash;
    }
    rw.isActive = true;
    rw.removedAt = null;
    rw.save();
  }
}

/**
 * Apply a Hats Protocol token-state burn / transfer-out for (orgId, wearer, hatId).
 *
 * Removes hatId from User.currentHatIds and marks the corresponding RoleWearer
 * inactive. If the user holds no other hats afterward, they are marked Inactive
 * and unlinked from the org (matching the prior recordUserHatChange behavior).
 *
 * Idempotent: removing an already-absent hat is a no-op.
 */
export function applyHatTransferRemove(
  orgId: Bytes,
  wearer: Address,
  hatId: BigInt,
  event: ethereum.Event
): void {
  if (isSystemContract(orgId, wearer)) {
    return;
  }
  let userId = orgId.toHexString() + "-" + wearer.toHexString();
  let user = User.load(userId);
  if (user != null) {
    let currentHats = user.currentHatIds;
    let newHats: BigInt[] = [];
    let removed = false;
    for (let i = 0; i < currentHats.length; i++) {
      if (currentHats[i].equals(hatId)) {
        removed = true;
      } else {
        newHats.push(currentHats[i]);
      }
    }
    if (removed) {
      user.currentHatIds = newHats;
      if (newHats.length == 0) {
        user.membershipStatus = "Inactive";
        user.organization = null;
      }
      recordHatChangeLog(user, hatId, false, event);
      user.save();
    }
  }

  let roleId = orgId.toHexString() + "-" + hatId.toString();
  let rwId = roleId + "-" + wearer.toHexString();
  let rw = RoleWearer.load(rwId);
  if (rw != null && rw.isActive) {
    rw.isActive = false;
    rw.removedAt = event.block.timestamp;
    rw.save();
  }
}

/**
 * Internal: record a UserHatChange entry without touching User.currentHatIds
 * (caller is responsible for that). Mirrors the immutable-id rules used by
 * recordUserHatChange so dual-callers don't collide.
 */
function recordHatChangeLog(
  user: User,
  hatId: BigInt,
  added: boolean,
  event: ethereum.Event
): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
    .concat(Bytes.fromUTF8(user.id))
    .concat(Bytes.fromByteArray(Bytes.fromBigInt(hatId)));
  let change = new UserHatChange(id);
  change.user = user.id;
  change.hatId = hatId;
  change.added = added;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

/**
 * Link a Hat entity to its corresponding Role entity
 * Called when a Hat is created via HatCreatedWithEligibility
 * Also sets isUserRole based on whether the hat is in org.roleHatIds
 */
export function linkHatToRole(
  orgId: Bytes,
  hatId: BigInt,
  hatEntityId: string,
  event: ethereum.Event
): Role {
  // Determine if this is a user role by checking roleHatIds
  let isUserRole: boolean = false;
  let org = Organization.load(orgId);
  if (org) {
    let roleHatIds = org.roleHatIds;
    if (roleHatIds) {
      for (let i = 0; i < roleHatIds.length; i++) {
        if (roleHatIds[i].equals(hatId)) {
          isUserRole = true;
          break;
        }
      }
    }
  }

  let role = getOrCreateRole(orgId, hatId, event, isUserRole, true); // setIsUserRole = true
  role.hat = hatEntityId;
  role.save();
  return role;
}

/**
 * Get or create a RoleWearer entity for a user wearing a role
 * Returns null if the wearer is a system contract
 */
export function getOrCreateRoleWearer(
  orgId: Bytes,
  hatId: BigInt,
  wearerAddress: Address,
  event: ethereum.Event
): RoleWearer | null {
  let roleWearerId =
    orgId.toHexString() +
    "-" +
    hatId.toString() +
    "-" +
    wearerAddress.toHexString();
  let roleWearer = RoleWearer.load(roleWearerId);

  if (roleWearer == null) {
    // Ensure Role exists
    let role = getOrCreateRole(orgId, hatId, event);

    // Load existing User (will return null for system contracts or non-members)
    // Users are created by JOIN handlers (QuickJoin, HatClaim), not here
    let user = loadExistingUser(
      orgId,
      wearerAddress,
      event.block.timestamp,
      event.block.number
    );

    // Skip creating RoleWearer if user doesn't exist (not a member)
    if (!user) {
      return null;
    }

    roleWearer = new RoleWearer(roleWearerId);
    roleWearer.role = role.id;
    roleWearer.user = user.id;
    roleWearer.wearer = wearerAddress;
    roleWearer.wearerUsername = getUsernameForAddress(wearerAddress);
    roleWearer.addedAt = event.block.timestamp;
    roleWearer.addedAtBlock = event.block.number;
    roleWearer.isActive = true;
    roleWearer.transactionHash = event.transaction.hash;
    roleWearer.save();
  }

  return roleWearer as RoleWearer;
}

/**
 * Update a RoleWearer's active status (for when hats are removed)
 */
export function updateRoleWearerStatus(
  orgId: Bytes,
  hatId: BigInt,
  wearerAddress: Address,
  isActive: boolean,
  event: ethereum.Event
): RoleWearer | null {
  let roleWearerId =
    orgId.toHexString() +
    "-" +
    hatId.toString() +
    "-" +
    wearerAddress.toHexString();
  let roleWearer = RoleWearer.load(roleWearerId);

  if (roleWearer != null) {
    roleWearer.isActive = isActive;
    if (!isActive) {
      roleWearer.removedAt = event.block.timestamp;
    }
    roleWearer.save();
  }

  return roleWearer;
}

/**
 * Link a WearerEligibility entity to its RoleWearer
 */
export function linkWearerEligibilityToRoleWearer(
  orgId: Bytes,
  hatId: BigInt,
  wearerAddress: Address,
  wearerEligibilityId: string
): void {
  let roleWearerId =
    orgId.toHexString() +
    "-" +
    hatId.toString() +
    "-" +
    wearerAddress.toHexString();
  let roleWearer = RoleWearer.load(roleWearerId);

  if (roleWearer != null) {
    roleWearer.wearerEligibility = wearerEligibilityId;
    roleWearer.save();
  }
}

/**
 * Check if an address is a system contract for an organization.
 * System contracts (Executor, EligibilityModule) should not be indexed as RoleWearers.
 */
export function isSystemContract(orgId: Bytes, address: Address): boolean {
  let org = Organization.load(orgId);
  if (!org) return false;

  // Convert incoming address to hex for reliable comparison
  let addressHex = address.toHexString();

  // Check if address is the Executor contract
  let executorContractRef = org.executorContract;
  if (executorContractRef) {
    // Direct hex comparison - executorContractRef IS the executor address
    if (executorContractRef.toHexString() == addressHex) return true;
  }

  // Check if address is the EligibilityModule contract
  let eligibilityModuleRef = org.eligibilityModule;
  if (eligibilityModuleRef) {
    // Direct hex comparison - eligibilityModuleRef IS the eligibility module address
    if (eligibilityModuleRef.toHexString() == addressHex) return true;
  }

  return false;
}

/**
 * Check if a hat ID is a user-facing role hat (not a system hat).
 * System hats include: Top Hat (worn by Executor), Eligibility Admin Hat (worn by EligibilityModule).
 * User-facing hats are those in the Organization.roleHatIds array.
 */
export function isUserFacingRoleHat(orgId: Bytes, hatId: BigInt): boolean {
  let org = Organization.load(orgId);
  if (!org) return false;

  // Top Hat is a system hat - never create RoleWearer for it
  let topHatId = org.topHatId;
  if (topHatId && topHatId.equals(hatId)) return false;

  // Check if hat is in roleHatIds (explicitly user-facing)
  let roleHatIds = org.roleHatIds;
  if (roleHatIds) {
    for (let i = 0; i < roleHatIds.length; i++) {
      if (roleHatIds[i].equals(hatId)) return true;
    }
  }

  // Check for eligibility admin hat
  let eligibilityModuleRef = org.eligibilityModule;
  if (eligibilityModuleRef) {
    let eligibility = EligibilityModuleContract.load(eligibilityModuleRef);
    if (eligibility) {
      let adminHat = eligibility.eligibilityModuleAdminHat;
      if (adminHat && adminHat.equals(hatId)) return false;
    }
  }

  // For dynamic hats not in roleHatIds, allow them (future expansion)
  return true;
}

/**
 * Combined check for RoleWearer creation eligibility.
 * Returns true if a RoleWearer should be created for this hat and address combination.
 */
export function shouldCreateRoleWearer(
  orgId: Bytes,
  hatId: BigInt,
  wearerAddress: Address
): boolean {
  // Skip if recipient is a system contract
  if (isSystemContract(orgId, wearerAddress)) return false;

  // Skip if hat is not user-facing
  if (!isUserFacingRoleHat(orgId, hatId)) return false;

  return true;
}
