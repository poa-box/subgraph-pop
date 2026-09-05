// ACCESS V2 — MembershipAuthority mapping.
//
// One per-org authority replaces the EligibilityModule / ToggleModule / marker-hat stratum. This
// file indexes the FULL frozen event vocabulary (ACCESS-V2-INTERFACES.md) and maintains two
// contracts the rest of the stack depends on:
//
// 1. THE FOLD MIRROR. `SubjectMembership.eligible` is recomputed from indexed entity state on
//    every event that can move it, mirroring MembershipAuthorityLogic._eligibleRole EXACTLY:
//
//        explicit Ban   -> false            (supremacy: nothing overrides a ban)
//        explicit Grant -> true
//        emailVerified  -> true             (attestor arm — ZkEmailInvites)
//        vouch quorum   -> true             (attestor arm — quorum > 0 AND the wearer's epoch is
//                                            current AND count >= quorum)
//        else             subject default
//
//    Membership is `accepted && eligible`, never a third stored thing. Because the subgraph folds
//    on CONFIG events too (default flip, vouch reconfigure, epoch reset) it is AHEAD of the chain
//    across the §5 event-lag window, which is the point: the chain repairs those lapses lazily via
//    reconcile(), the UI must not wait for someone to pay for it.
//
// 2. ACCEPTED STATE COMES FROM TransferSingle, NOT the lifecycle events. _flipOn/_flipOff emit
//    exactly one TransferSingle per accepted transition and nothing else does (the sole exception
//    is emitUnportedBurns, which emits a burn for a NON-member and is handled explicitly), so
//    driving `accepted` off the token event can never double-count against RoleGranted/RoleClaimed/
//    RoleRemoved/RoleRenounced/MembershipReconciled — those supply PROVENANCE for the activity
//    feed only. The same TransferSingle is replayed through applyHatTransferAdd/Remove so
//    Role / RoleWearer / User / HatLookup keep the ids the static Hats dataSource writes
//    (entity-id continuity across the cutover).
//
// 3. NOTHING IS DERIVED FROM A VERB. Every rule deletion emits RuleCleared and every pending
//    consumption emits PendingActionFinalized (contract-side event law), so this file mirrors rule
//    and pending state from those two events alone — it never replicates the contract's conditional
//    `delete` branches, and never closes a pending because some lifecycle event happened to arrive.
//
// ZERO eth_calls: every field below comes from a log.

import { Address, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";
import {
  MembershipAuthorityInitialized as MembershipAuthorityInitializedEvent,
  PausedSet as PausedSetEvent,
  SubjectCreated as SubjectCreatedEvent,
  SubjectRenamed as SubjectRenamedEvent,
  SubjectDefaultSet as SubjectDefaultSetEvent,
  MaxMembersSet as MaxMembersSetEvent,
  GroupCompositionChanged as GroupCompositionChangedEvent,
  ManagerConfigSet as ManagerConfigSetEvent,
  RuleSet as RuleSetEvent,
  RuleCleared as RuleClearedEvent,
  RoleOffered as RoleOfferedEvent,
  OfferWithdrawn as OfferWithdrawnEvent,
  RoleGranted as RoleGrantedEvent,
  RoleClaimed as RoleClaimedEvent,
  RoleRemoved as RoleRemovedEvent,
  RoleRenounced as RoleRenouncedEvent,
  MembershipReconciled as MembershipReconciledEvent,
  PendingActionCreated as PendingActionCreatedEvent,
  PendingActionCancelled as PendingActionCancelledEvent,
  PendingActionVoided as PendingActionVoidedEvent,
  PendingActionFinalized as PendingActionFinalizedEvent,
  VouchConfigured as VouchConfiguredEvent,
  Vouched as VouchedEvent,
  VouchRevoked as VouchRevokedEvent,
  VouchSeeded as VouchSeededEvent,
  VoucherSeeded as VoucherSeededEvent,
  VouchEpochReset as VouchEpochResetEvent,
  UserVouchesCleared as UserVouchesClearedEvent,
  MaxDailyVouchesSet as MaxDailyVouchesSetEvent,
  EmailVerifiedSet as EmailVerifiedSetEvent,
  PermSet as PermSetEvent,
  PermCleared as PermClearedEvent,
  ConfigLint as ConfigLintEventEvent,
  TransferSingle as TransferSingleEvent
} from "../generated/templates/MembershipAuthority/MembershipAuthority";
import {
  MembershipAuthorityContract,
  Subject,
  SubjectMembership,
  SubjectMembershipEvent,
  AccessRule,
  SubjectVouchConfig,
  SubjectVouchRecord,
  EmailVerification,
  PermRow,
  GroupComposition,
  ManagerConfig,
  PendingAction,
  ConfigLintEvent,
  Organization,
  Role
} from "../generated/schema";
import {
  getOrCreateRole,
  getUsernameForAddress,
  loadExistingUser,
  applyHatTransferAdd,
  applyHatTransferRemove
} from "./utils";

// Manager capability bitmask (MembershipAuthorityLogic.CAP_GRANT / CAP_REMOVE).
const CAP_GRANT: i32 = 1;
const CAP_REMOVE: i32 = 2;

// NOTE: these are FUNCTIONS, not module-level constants, on purpose. A module-level initializer
// that calls a host import (BigInt.pow lands in numbers.bigInt.pow) is emitted into the wasm
// `_start`, which scripts/check-wasm-start.mjs rejects — that pattern once corrupted a production
// deploy.

/** 2^224 — the Hats namespace floor (AccessV2Ids.HATS_NAMESPACE_FLOOR). Subject ids at or above it
 *  are ADOPTED legacy hat ids; below it they are v2-native ids embedding the authority address. */
function hatsNamespaceFloor(): BigInt {
  return BigInt.fromI32(2).pow(224);
}

/** type(uint64).max — the SENTINEL the contract parks a wearer's vouch epoch at when governance
 *  clears their vouches; it can never equal a real subject epoch, so the count reads as 0 forever. */
function vouchEpochSentinel(): BigInt {
  return BigInt.fromI32(2).pow(64).minus(BigInt.fromI32(1));
}

// §3 perm-word packing constants (AccessV2PermKeys).
function existsBit(): BigInt {
  return BigInt.fromI32(2).pow(255);
}

function inheritGlobalBit(): BigInt {
  return BigInt.fromI32(2).pow(254);
}

function valueMask(): BigInt {
  return BigInt.fromI32(2).pow(254).minus(BigInt.fromI32(1));
}

const ZERO_ADDRESS: Bytes = Bytes.fromHexString("0x0000000000000000000000000000000000000000");
const ZERO_BYTES32: Bytes = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000000000000000000000000000"
);

/*═══════════════════════════════ id helpers ═══════════════════════════════*/

/**
 * The Subject entity id is the subject id VERBATIM (decimal string) — the same keying `HatLookup`
 * uses — so a migrated org's adopted legacy hatId resolves to the same string it always did.
 */
function subjectEntityId(subjectId: BigInt): string {
  return subjectId.toString();
}

function membershipEntityId(subjectId: BigInt, user: Bytes): string {
  return subjectId.toString() + "-" + user.toHexString();
}

function voucherRecordId(subjectId: BigInt, user: Bytes, voucher: Bytes): string {
  return subjectId.toString() + "-" + user.toHexString() + "-" + voucher.toHexString();
}

function pendingEntityId(authority: Bytes, pendingId: BigInt): string {
  return authority.toHexString() + "-" + pendingId.toString();
}

function permRowId(subjectId: BigInt, permKey: Bytes, ctx: Bytes): string {
  return subjectId.toString() + "-" + permKey.toHexString() + "-" + ctx.toHexString();
}

function groupCompositionId(groupId: BigInt, roleId: BigInt): string {
  return groupId.toString() + "-" + roleId.toString();
}

/*═══════════════════════════════ loaders ═══════════════════════════════*/

function loadAuthority(address: Address): MembershipAuthorityContract | null {
  return MembershipAuthorityContract.load(address);
}

/**
 * Subjects are created by SubjectCreated, which always precedes any other subject-scoped event on
 * chain. If one is somehow missing (a template created mid-history), synthesize a minimal ROLE
 * subject rather than dropping the event — the alternative is silent data loss.
 */
function getOrCreateSubject(
  authority: MembershipAuthorityContract,
  subjectId: BigInt,
  event: ethereum.Event
): Subject {
  let id = subjectEntityId(subjectId);
  let subject = Subject.load(id);
  if (subject != null) {
    return subject;
  }
  subject = new Subject(id);
  subject.authority = authority.id;
  subject.organization = authority.organization;
  subject.subjectId = subjectId;
  subject.kind = "Role";
  subject.maxMembers = 0;
  subject.memberCount = 0;
  subject.activeMemberCount = 0;
  subject.acceptedUsers = [];
  subject.defaultAllow = false;
  subject.isLegacyAdopted = subjectId.ge(hatsNamespaceFloor());
  subject.createdAt = event.block.timestamp;
  subject.createdAtBlock = event.block.number;
  subject.lastUpdatedAt = event.block.timestamp;
  subject.transactionHash = event.transaction.hash;
  subject.save();

  authority.subjectCount = authority.subjectCount + 1;
  authority.roleSubjectCount = authority.roleSubjectCount + 1;
  authority.lastUpdatedAt = event.block.timestamp;
  authority.save();
  return subject;
}

function getOrCreateMembership(
  authority: MembershipAuthorityContract,
  subject: Subject,
  user: Bytes,
  event: ethereum.Event
): SubjectMembership {
  let id = membershipEntityId(subject.subjectId, user);
  let membership = SubjectMembership.load(id);
  if (membership != null) {
    return membership;
  }
  membership = new SubjectMembership(id);
  membership.subject = subject.id;
  membership.authority = authority.id;
  membership.organization = authority.organization;
  membership.user = user;
  membership.userUsername = getUsernameForAddress(Address.fromBytes(user));
  membership.accepted = false;
  membership.seededWhilePaused = false;
  membership.eligible = false;
  membership.eligibilitySource = "None";
  membership.isMember = false;
  membership.claimable = false;
  membership.ruleKind = "None";
  membership.emailVerified = false;
  membership.vouchCount = 0;
  membership.vouchEpoch = BigInt.zero();
  membership.vouchMet = false;
  membership.firstSeenAt = event.block.timestamp;
  membership.lastUpdatedAt = event.block.timestamp;
  membership.transactionHash = event.transaction.hash;
  membership.save();
  return membership;
}

/**
 * The membership row a (subject, user)-scoped CONFIG event should fold — or null for a GROUP.
 *
 * A group has no acceptance and no rule/email arm of its own: _memberOfGroup derives group
 * membership purely from the member ROLES, so a Ban or an email attestation written against a group
 * is inert on chain. Creating a folded row for it would publish an `eligible` verdict the contract
 * never consults (and refold()'s own contract is "no row is ever folded against a group").
 */
function membershipForRow(
  authority: MembershipAuthorityContract,
  subject: Subject,
  user: Bytes,
  event: ethereum.Event
): SubjectMembership | null {
  if (subject.kind == "Group") {
    return null;
  }
  return getOrCreateMembership(authority, subject, user, event);
}

/** Link the row to its User entity if that wallet has actually joined the org. */
function linkMembershipUser(membership: SubjectMembership, event: ethereum.Event): void {
  let user = loadExistingUser(
    changetype<Bytes>(membership.organization),
    Address.fromBytes(membership.user),
    event.block.timestamp,
    event.block.number
  );
  if (user) {
    membership.userEntity = user.id;
  }
}


/**
 * Adjust the authority's accepted-membership counter through a FRESH load. The counter is touched
 * from the same handler that may have just created a subject (which also writes the authority), so
 * reusing a stale in-memory copy would clobber that write.
 */
function bumpAcceptedMembershipCount(address: Address, delta: i32, timestamp: BigInt): void {
  let authority = MembershipAuthorityContract.load(address);
  if (authority == null) {
    return;
  }
  let next = authority.acceptedMembershipCount + delta;
  authority.acceptedMembershipCount = next > 0 ? next : 0;
  authority.lastUpdatedAt = timestamp;
  authority.save();
}

/*═══════════════════════════════ THE FOLD MIRROR ═══════════════════════════════*/

/**
 * Recompute `eligible` / `eligibilitySource` / `isMember` / `claimable` for one row, mirroring
 * MembershipAuthorityLogic._eligibleRole arm for arm and in the same ORDER, then keep
 * Subject.activeMemberCount in step with the isMember transitions.
 *
 * GROUP subjects have no acceptance of their own — a user is in a group iff they are an active
 * member of >= 1 member ROLE — so no row is ever folded against a group.
 */
function refold(subject: Subject, membership: SubjectMembership, event: ethereum.Event): void {
  let wasMember = membership.isMember;

  let eligible = false;
  let source = "None";

  if (membership.ruleKind == "Ban") {
    // BAN SUPREMACY — nothing below is consulted.
    eligible = false;
    source = "ExplicitBan";
  } else if (membership.ruleKind == "Grant") {
    eligible = true;
    source = "ExplicitGrant";
  } else if (membership.emailVerified) {
    eligible = true;
    source = "EmailVerified";
  } else if (membership.vouchMet) {
    eligible = true;
    source = "VouchQuorum";
  } else if (subject.defaultAllow) {
    eligible = true;
    source = "SubjectDefault";
  }

  membership.eligible = eligible;
  membership.eligibilitySource = source;
  membership.isMember = membership.accepted && eligible;
  membership.claimable = !membership.accepted && eligible;
  membership.lastUpdatedAt = event.block.timestamp;
  membership.save();

  if (membership.isMember != wasMember) {
    subject.activeMemberCount = membership.isMember
      ? subject.activeMemberCount + 1
      : subject.activeMemberCount - 1;
    if (subject.activeMemberCount < 0) {
      subject.activeMemberCount = 0;
    }
    subject.lastUpdatedAt = event.block.timestamp;
    subject.save();
  }
}

/**
 * Recompute `vouchMet` from the row's mirrored count/epoch against the subject's live config,
 * mirroring _vouchMet: quorum must be non-zero, the wearer's epoch must equal the CURRENT subject
 * epoch (a stale epoch reads as zero vouches), and the count must reach the quorum.
 */
function recomputeVouchMet(subject: Subject, membership: SubjectMembership): void {
  let cfgId = subject.vouchConfig;
  if (cfgId === null) {
    membership.vouchMet = false;
    return;
  }
  let cfg = SubjectVouchConfig.load(changetype<string>(cfgId));
  if (cfg == null || cfg.quorum == 0) {
    membership.vouchMet = false;
    return;
  }
  let effective = membership.vouchEpoch.equals(cfg.epoch) ? membership.vouchCount : 0;
  membership.vouchMet = effective >= cfg.quorum;
}

/**
 * Re-fold every ACCEPTED row of a subject after a SUBJECT-LEVEL config change (default flip, vouch
 * reconfigure, epoch reset). Bounded by memberCount; `Subject.acceptedUsers` exists precisely so
 * this loop needs no derived-field iteration.
 *
 * Non-accepted rows are deliberately NOT swept: their `claimable` flag is best-effort and refreshes
 * on their next event (and for a default-ALLOW subject the claimable set is "everyone", which no
 * entity set could enumerate anyway).
 */
function refoldAcceptedMembers(subject: Subject, event: ethereum.Event): void {
  let users = subject.acceptedUsers;
  for (let i = 0; i < users.length; i++) {
    let membership = SubjectMembership.load(membershipEntityId(subject.subjectId, users[i]));
    if (membership == null) {
      continue;
    }
    recomputeVouchMet(subject, membership);
    refold(subject, membership, event);
  }
}

function addAcceptedUser(subject: Subject, user: Bytes): void {
  let users = subject.acceptedUsers;
  for (let i = 0; i < users.length; i++) {
    if (users[i].equals(user)) {
      return;
    }
  }
  users.push(user);
  subject.acceptedUsers = users;
}

function removeAcceptedUser(subject: Subject, user: Bytes): void {
  let users = subject.acceptedUsers;
  let next: Bytes[] = [];
  for (let i = 0; i < users.length; i++) {
    if (!users[i].equals(user)) {
      next.push(users[i]);
    }
  }
  subject.acceptedUsers = next;
}

/*═══════════════════════════════ activity feed ═══════════════════════════════*/

function recordMembershipEvent(
  event: ethereum.Event,
  authority: MembershipAuthorityContract,
  subject: Subject,
  membership: SubjectMembership,
  action: string,
  actor: Bytes | null,
  delegated: boolean,
  banned: boolean,
  hasBanned: boolean
): SubjectMembershipEvent {
  let row = new SubjectMembershipEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  row.action = action;
  row.authority = authority.id;
  row.organization = authority.organization;
  row.subject = subject.id;
  row.subjectId = subject.subjectId;
  row.membership = membership.id;
  row.user = membership.user;
  row.userUsername = membership.userUsername;
  row.userEntity = membership.userEntity;
  if (hasBanned) {
    row.banned = banned;
  }
  if (actor !== null) {
    let actorBytes = changetype<Bytes>(actor);
    row.actor = actorBytes;
    row.actorUsername = getUsernameForAddress(Address.fromBytes(actorBytes));
  }
  row.delegated = delegated;
  row.timestamp = event.block.timestamp;
  row.block = event.block.number;
  row.transactionHash = event.transaction.hash;
  row.save();
  return row;
}

/*═══════════════════════════════ authority lifecycle ═══════════════════════════════*/

/**
 * MembershipAuthorityInitialized — normally NOT indexed for a MIGRATED org: the proxy is
 * predeployed and atomically initialized one or more blocks before the governance batch that
 * registers it, and this template only exists from that registration onwards (org-registry.ts
 * derives executor/paused for that case). It IS indexed when the authority is registered and
 * initialized in the same transaction (the new-org deploy path), and then it overwrites the
 * derived values with observed truth.
 */
export function handleMembershipAuthorityInitialized(
  event: MembershipAuthorityInitializedEvent
): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    // Registration has not been indexed yet. Only create the entity when the Organization it
    // claims exists, so the required `organization` link is never dangling.
    let org = Organization.load(event.params.orgId);
    if (org == null) {
      return;
    }
    authority = new MembershipAuthorityContract(event.address);
    authority.organization = org.id;
    authority.maxDailyVouches = 0;
    authority.subjectCount = 0;
    authority.roleSubjectCount = 0;
    authority.groupSubjectCount = 0;
    authority.acceptedMembershipCount = 0;
    authority.isRouterBound = false;
    authority.registeredAt = event.block.timestamp;
    authority.registeredAtBlock = event.block.number;
    authority.transactionHash = event.transaction.hash;
    org.membershipAuthority = event.address;
    org.lastUpdatedAt = event.block.timestamp;
    org.save();
  }
  authority.executor = event.params.executor;
  authority.orgIdHash = event.params.orgId;
  authority.paused = event.params.paused;
  authority.initConfigDerived = false;
  authority.lastUpdatedAt = event.block.timestamp;
  authority.save();
}

/** PausedSet — pause gates non-executor WRITES only; reads (and this mirror) stay live. */
export function handleAuthorityPausedSet(event: PausedSetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  authority.paused = event.params.paused;
  authority.lastUpdatedAt = event.block.timestamp;
  authority.save();
}

/*═══════════════════════════════ subjects ═══════════════════════════════*/

export function handleSubjectCreated(event: SubjectCreatedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subjectId = event.params.subjectId;
  let id = subjectEntityId(subjectId);
  let isGroup = event.params.kind == 1;

  let subject = Subject.load(id);
  let isNew = subject == null;
  if (subject == null) {
    subject = new Subject(id);
    subject.authority = authority.id;
    subject.organization = authority.organization;
    subject.subjectId = subjectId;
    subject.memberCount = 0;
    subject.activeMemberCount = 0;
    subject.acceptedUsers = [];
    subject.defaultAllow = false;
    subject.createdAt = event.block.timestamp;
    subject.createdAtBlock = event.block.number;
  }
  subject.kind = isGroup ? "Group" : "Role";
  subject.name = event.params.name;
  // Kyoto's genesis SubjectCreated events intentionally carry bytes32(0) and no image URI; the
  // deployer's later RolesCreated summary carries the configured metadata/image. Dynamic-source
  // replay can run SubjectCreated after that summary, so never erase richer deployment metadata
  // with the seed event's zero placeholder.
  if (!event.params.metadataCID.equals(ZERO_BYTES32) || subject.metadataCID === null) {
    subject.metadataCID = event.params.metadataCID;
  }
  subject.maxMembers = event.params.maxMembers.toI32();
  subject.isLegacyAdopted = subjectId.ge(hatsNamespaceFloor());
  subject.lastUpdatedAt = event.block.timestamp;
  subject.transactionHash = event.transaction.hash;

  // CONTINUITY: a ROLE subject mirrors onto the org's Role entity (id orgId-subjectId) and the
  // global HatLookup, exactly as the legacy sources key them — an adopted legacy hatId therefore
  // resolves to the SAME Role the frontend already queries, and RoleWearer rows written by the
  // authority's TransferSingle mirror land on it. GROUPS ARE NOT TOKENS and get no Role: a group
  // has no acceptance and no ERC-1155 supply, and surfacing one as a role would pollute every role
  // picker (the v1 marker-hat mistake).
  if (!isGroup) {
    let orgId = changetype<Bytes>(authority.organization);
    let role = getOrCreateRole(orgId, subjectId, event);
    role.name = event.params.name;
    if (!event.params.metadataCID.equals(ZERO_BYTES32)) {
      role.metadataCID = event.params.metadataCID;
    }
    if (subject.imageURI === null && role.image !== null) {
      subject.imageURI = role.image;
    }
    if (
      event.params.metadataCID.equals(ZERO_BYTES32) &&
      subject.metadataCID !== null &&
      role.metadataCID === null
    ) {
      role.metadataCID = subject.metadataCID;
    }
    role.save();
    subject.role = role.id;
  }
  subject.save();

  if (isNew) {
    authority.subjectCount = authority.subjectCount + 1;
    if (isGroup) {
      authority.groupSubjectCount = authority.groupSubjectCount + 1;
    } else {
      authority.roleSubjectCount = authority.roleSubjectCount + 1;
    }
    authority.lastUpdatedAt = event.block.timestamp;
    authority.save();
  }
}

export function handleSubjectRenamed(event: SubjectRenamedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  subject.name = event.params.name;
  subject.metadataCID = event.params.metadataCID;
  subject.imageURI = event.params.imageURI;
  subject.lastUpdatedAt = event.block.timestamp;
  subject.save();

  // Keep the continuity Role in step so existing role queries render the new name.
  let roleId = subject.role;
  if (roleId !== null) {
    let role = Role.load(changetype<string>(roleId));
    if (role != null) {
      role.name = event.params.name;
      role.image = event.params.imageURI;
      // bytes32(0) is an explicit metadata clear, not "no update". Mirror it verbatim so the
      // continuity Role cannot retain a stale CID after the canonical Subject has cleared it.
      role.metadataCID = event.params.metadataCID;
      role.save();
    }
  }
}

/**
 * SubjectDefaultSet — the WEAKEST fold arm, and the one the contract does NOT re-evaluate members
 * against (§5 event-lag window). The mirror re-folds every accepted row immediately.
 */
export function handleSubjectDefaultSet(event: SubjectDefaultSetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  subject.defaultAllow = event.params.allow;
  subject.lastUpdatedAt = event.block.timestamp;
  subject.save();
  refoldAcceptedMembers(subject, event);
}

export function handleMaxMembersSet(event: MaxMembersSetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  subject.maxMembers = event.params.maxMembers.toI32();
  subject.lastUpdatedAt = event.block.timestamp;
  subject.save();
}

/**
 * GroupCompositionChanged — group membership is PURE DERIVATION (a user is in the group iff they
 * are an active member of >= 1 active member role). Rows are retained with isActive = false on
 * removal so the composition history stays queryable.
 */
export function handleGroupCompositionChanged(event: GroupCompositionChangedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let group = getOrCreateSubject(authority, event.params.groupId, event);
  let role = getOrCreateSubject(authority, event.params.roleId, event);

  let id = groupCompositionId(event.params.groupId, event.params.roleId);
  let row = GroupComposition.load(id);
  if (row == null) {
    row = new GroupComposition(id);
    row.group = group.id;
    row.role = role.id;
    row.authority = authority.id;
    row.organization = authority.organization;
    row.groupSubjectId = event.params.groupId;
    row.roleSubjectId = event.params.roleId;
    row.addedAt = event.block.timestamp;
    row.addedAtBlock = event.block.number;
  } else if (event.params.added) {
    row.addedAt = event.block.timestamp;
    row.addedAtBlock = event.block.number;
  }
  row.isActive = event.params.added;
  row.updatedAt = event.block.timestamp;
  row.transactionHash = event.transaction.hash;
  row.save();
}

export function handleManagerConfigSet(event: ManagerConfigSetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let managerSubjectId = event.params.managerSubject;
  let enabled = !managerSubjectId.isZero();

  let id = subject.id;
  let cfg = ManagerConfig.load(id);
  if (cfg == null) {
    cfg = new ManagerConfig(id);
    cfg.subject = subject.id;
    cfg.authority = authority.id;
    cfg.organization = authority.organization;
    cfg.setAt = event.block.timestamp;
  }
  cfg.managerSubjectId = managerSubjectId;
  if (enabled) {
    let managerSubject = getOrCreateSubject(authority, managerSubjectId, event);
    cfg.managerSubject = managerSubject.id;
  } else {
    cfg.managerSubject = null;
  }
  let caps = event.params.caps;
  cfg.caps = caps;
  cfg.canGrant = (caps & CAP_GRANT) != 0;
  cfg.canRemove = (caps & CAP_REMOVE) != 0;
  cfg.delaySecs = BigInt.fromI32(event.params.delaySecs.toI32());
  cfg.enabled = enabled;
  cfg.lastUpdatedAt = event.block.timestamp;
  cfg.transactionHash = event.transaction.hash;
  cfg.save();

  subject.managerConfig = cfg.id;
  subject.lastUpdatedAt = event.block.timestamp;
  subject.save();
}

/*═══════════════════════════════ rules (the strongest fold arm) ═══════════════════════════════*/

function ruleKindName(kind: i32): string {
  if (kind == 1) {
    return "Grant";
  }
  if (kind == 2) {
    return "Ban";
  }
  return "None";
}

export function handleRuleSet(event: RuleSetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  // setRule accepts a GROUP subject (only an exists check), but _memberOfGroup ignores a group's
  // own rule/email state entirely — group membership is derived from the member ROLES. So the rule
  // row is recorded (the slot really exists on chain) while NO membership row is created or folded
  // for it: a folded group row would contradict the derived semantics consumers are told to use.
  let membership = membershipForRow(authority, subject, event.params.user, event);

  let kind = ruleKindName(event.params.kind);
  let author = event.params.author == 1 ? "Delegated" : "Governance";
  let delegable = event.params.delegable;

  let id = membershipEntityId(subject.subjectId, event.params.user);
  let rule = AccessRule.load(id);
  if (rule == null) {
    rule = new AccessRule(id);
    rule.subject = subject.id;
    rule.authority = authority.id;
    rule.organization = authority.organization;
    rule.user = event.params.user;
    rule.setAt = event.block.timestamp;
    rule.setAtBlock = event.block.number;
  }
  if (membership === null) {
    rule.membership = null;
  } else {
    rule.membership = membership.id;
  }
  rule.kind = kind;
  rule.author = author;
  rule.delegable = delegable;
  // STICKY has exactly one meaning: a governance GRANT authored by governance with delegable=false.
  // It survives renounce and no delegate may clear or overwrite it. setRule(RuleKind.None) deletes
  // the slot on chain but still emits RuleSet(kind=0, author=0, delegable=false) — computing sticky
  // from author/delegable alone badged that empty slot as a live sticky rule.
  rule.sticky = kind == "Grant" && author == "Governance" && !delegable;
  rule.clearedAt = null;
  // Best-effort provenance: RuleSet carries no managerSubject, and a manager resolved through a
  // CONTAINING GROUP is not event-visible, so only the subject's own delegation is attributable.
  if (author == "Delegated") {
    let cfg = ManagerConfig.load(subject.id);
    rule.managerSubject = cfg != null ? cfg.managerSubject : null;
  } else {
    rule.managerSubject = null;
  }
  rule.lastUpdatedAt = event.block.timestamp;
  rule.transactionHash = event.transaction.hash;
  rule.save();

  if (membership !== null) {
    membership.rule = rule.id;
    membership.ruleKind = kind;
    linkMembershipUser(membership, event);
    membership.save();
    refold(subject, membership, event);
  }
}

/**
 * RuleCleared — the ONE signal for a deleted rule slot, and it is exhaustive. The contract emits it
 * at EVERY durable deletion and at no other time:
 *
 *   clearRule                      RuleCleared
 *   setRule(kind=None)             RuleSet(None)                        (handled above)
 *   renounce (delegable/delegated) RuleCleared -> TransferSingle burn -> RoleRenounced
 *   _softRemove (remove/finalize)  RuleCleared -> TransferSingle burn -> RoleRemoved(banned=false)
 *   withdrawOffer                  RuleCleared -> OfferWithdrawn [-> PendingActionVoided]
 *   cancel(Offer pending)          RuleCleared -> PendingActionCancelled
 *   delegatedUnremove              RuleCleared [-> PendingActionVoided]
 *   unremove                       RuleCleared ONLY when a Ban was really deleted
 *
 * The soft-remove revert path (RemovalIneffective) restores the slot and emits nothing, and a
 * renounce that leaves a STICKY governance grant standing emits nothing either — so this handler is
 * exact in both directions and the lifecycle handlers must NOT replicate any conditional delete.
 */
export function handleRuleCleared(event: RuleClearedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = membershipForRow(authority, subject, event.params.user, event);

  let rule = AccessRule.load(membershipEntityId(subject.subjectId, event.params.user));
  if (rule != null) {
    rule.kind = "None";
    rule.delegable = false;
    rule.sticky = false;
    rule.managerSubject = null;
    rule.clearedAt = event.block.timestamp;
    rule.lastUpdatedAt = event.block.timestamp;
    rule.transactionHash = event.transaction.hash;
    rule.save();
  }
  if (membership !== null) {
    membership.ruleKind = "None";
    membership.save();
    refold(subject, membership, event);
  }
}

/*═══════════════════════════════ lifecycle feed ═══════════════════════════════*/

export function handleRoleOffered(event: RoleOfferedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  linkMembershipUser(membership, event);
  membership.save();
  recordMembershipEvent(
    event,
    authority,
    subject,
    membership,
    "Offered",
    event.params.actor,
    event.params.delegated,
    false,
    false
  );
}

export function handleOfferWithdrawn(event: OfferWithdrawnEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  recordMembershipEvent(
    event,
    authority,
    subject,
    membership,
    "OfferWithdrawn",
    event.params.actor,
    false,
    false,
    false
  );
}

/** RoleGranted is reserved for ORG-set acceptance (a direct grant / seed to an in-org member). */
export function handleRoleGranted(event: RoleGrantedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  linkMembershipUser(membership, event);
  membership.save();
  recordMembershipEvent(
    event,
    authority,
    subject,
    membership,
    "Granted",
    event.params.actor,
    event.params.delegated,
    false,
    false
  );
}

/** RoleClaimed — the USER acted (self-claim on an open role, or accepting an offer). */
export function handleRoleClaimed(event: RoleClaimedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  linkMembershipUser(membership, event);
  membership.save();
  recordMembershipEvent(
    event,
    authority,
    subject,
    membership,
    "Claimed",
    event.params.user,
    false,
    false,
    false
  );
  // A claim consuming an OFFER pending closes it through PendingActionFinalized, which the contract
  // emits in the same call — never derived from this verb (claim() leaves Grant/Remove pendings OPEN).
}

export function handleRoleRemoved(event: RoleRemovedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  recordMembershipEvent(
    event,
    authority,
    subject,
    membership,
    "Removed",
    event.params.actor,
    event.params.delegated,
    event.params.banned,
    true
  );
}

/** RoleRenounced renders self-exit truthfully — "Alice left", never "Alice was removed". */
export function handleRoleRenounced(event: RoleRenouncedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  recordMembershipEvent(
    event,
    authority,
    subject,
    membership,
    "Renounced",
    event.params.user,
    false,
    false,
    false
  );
}

/** MembershipReconciled is an automatic attestor/default LAPSE repair — never an org decision. */
export function handleMembershipReconciled(event: MembershipReconciledEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  recordMembershipEvent(
    event,
    authority,
    subject,
    membership,
    "Reconciled",
    null,
    false,
    false,
    false
  );
}

/*═══════════════════════════════ pending actions (the review window) ═══════════════════════════════*/

function pendingKindName(action: i32): string {
  if (action == 1) {
    return "Offer";
  }
  if (action == 2) {
    return "Remove";
  }
  return "Grant";
}

export function handlePendingActionCreated(event: PendingActionCreatedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);

  let id = pendingEntityId(event.address, event.params.pendingId);
  let pending = new PendingAction(id);
  pending.authority = authority.id;
  pending.organization = authority.organization;
  pending.subject = subject.id;
  pending.membership = membership.id;
  pending.pendingId = event.params.pendingId;
  pending.action = pendingKindName(event.params.action);
  pending.user = event.params.user;
  pending.actor = event.params.actor;
  pending.actorUsername = getUsernameForAddress(event.params.actor);
  pending.activatesAt = event.params.activatesAt;
  pending.status = "Pending";
  pending.createdAt = event.block.timestamp;
  pending.createdAtBlock = event.block.number;
  pending.transactionHash = event.transaction.hash;
  pending.save();

  // Mirror the contract's pendingOf[subject][user] so a later lifecycle event can close it in O(1).
  membership.pendingAction = pending.id;
  membership.save();
}

export function handlePendingActionCancelled(event: PendingActionCancelledEvent): void {
  closePending(event.address, event.params.pendingId, "Cancelled", event.params.by, event);
}

/** Voided = superseded by a governance rule write on the same (subject, user). */
export function handlePendingActionVoided(event: PendingActionVoidedEvent): void {
  closePending(event.address, event.params.pendingId, "Voided", null, event);
}

/**
 * Finalized = CONSUMED by its completing verb. The contract emits this at BOTH consumption sites —
 * claim() consuming an Offer pending and finalize() applying a Grant/Remove — so closure is read
 * from a log, never derived from a lifecycle verb.
 *
 * Deriving it was wrong in both directions: claim() consumes ONLY Offer pendings, so a self-claim
 * over an open delegated Grant/Remove pending used to close a row the chain kept open (the UI then
 * hid a pending that later removed the user), and mintHat emits RoleGranted while consuming nothing.
 * The pendingId is carried by the event, so EXACTLY the closed pending is closed here.
 */
export function handlePendingActionFinalized(event: PendingActionFinalizedEvent): void {
  closePending(event.address, event.params.pendingId, "Finalized", null, event);
}

function closePending(
  authorityAddress: Address,
  pendingId: BigInt,
  status: string,
  by: Bytes | null,
  event: ethereum.Event
): void {
  let pending = PendingAction.load(pendingEntityId(authorityAddress, pendingId));
  if (pending == null) {
    return;
  }
  pending.status = status;
  pending.resolvedAt = event.block.timestamp;
  if (by !== null) {
    pending.cancelledBy = changetype<Bytes>(by);
  }
  pending.save();

  let membership = SubjectMembership.load(pending.membership);
  if (membership != null && membership.pendingAction == pending.id) {
    membership.pendingAction = null;
    membership.save();
  }
}

/*═══════════════════════════════ vouching (attestor arm) ═══════════════════════════════*/

function getOrCreateVouchConfig(
  authority: MembershipAuthorityContract,
  subject: Subject,
  event: ethereum.Event
): SubjectVouchConfig {
  let cfg = SubjectVouchConfig.load(subject.id);
  if (cfg != null) {
    return cfg;
  }
  cfg = new SubjectVouchConfig(subject.id);
  cfg.subject = subject.id;
  cfg.authority = authority.id;
  cfg.organization = authority.organization;
  cfg.quorum = 0;
  cfg.voucherSubjectId = BigInt.zero();
  cfg.epoch = BigInt.zero();
  cfg.configuredAt = event.block.timestamp;
  cfg.lastUpdatedAt = event.block.timestamp;
  cfg.transactionHash = event.transaction.hash;
  cfg.save();

  subject.vouchConfig = cfg.id;
  subject.save();
  return cfg;
}

export function handleVouchConfigured(event: VouchConfiguredEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let cfg = getOrCreateVouchConfig(authority, subject, event);
  cfg.quorum = event.params.quorum.toI32();
  cfg.voucherSubjectId = event.params.voucherSubject;
  if (!event.params.voucherSubject.isZero()) {
    let voucherSubject = getOrCreateSubject(authority, event.params.voucherSubject, event);
    cfg.voucherSubject = voucherSubject.id;
  } else {
    cfg.voucherSubject = null;
  }
  cfg.lastUpdatedAt = event.block.timestamp;
  cfg.transactionHash = event.transaction.hash;
  cfg.save();

  // A quorum change moves the vouch arm for every wearer at once — another event-lag window the
  // chain repairs lazily and the mirror closes immediately.
  refoldAcceptedMembers(subject, event);
}

export function handleVouched(event: VouchedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  let cfg = getOrCreateVouchConfig(authority, subject, event);

  // Mirror vouch(): a wearer whose epoch is stale starts a fresh tally at the CURRENT epoch.
  if (!membership.vouchEpoch.equals(cfg.epoch)) {
    membership.vouchCount = 0;
    membership.vouchEpoch = cfg.epoch;
  }
  membership.vouchCount = membership.vouchCount + 1;

  let recordId = voucherRecordId(event.params.subjectId, event.params.user, event.params.voucher);
  let record = SubjectVouchRecord.load(recordId);
  if (record == null) {
    record = new SubjectVouchRecord(recordId);
    record.membership = membership.id;
    record.subject = subject.id;
    record.authority = authority.id;
    record.organization = authority.organization;
    record.user = event.params.user;
    record.voucher = event.params.voucher;
    record.voucherUsername = getUsernameForAddress(event.params.voucher);
    record.vouchedAt = event.block.timestamp;
    record.vouchedAtBlock = event.block.number;
    record.seeded = false;
  } else {
    record.vouchedAt = event.block.timestamp;
    record.vouchedAtBlock = event.block.number;
    record.seeded = false;
  }
  record.config = cfg.id;
  record.active = true;
  record.epoch = cfg.epoch;
  record.revokedAt = null;
  record.transactionHash = event.transaction.hash;
  record.save();

  recomputeVouchMet(subject, membership);
  membership.save();
  refold(subject, membership, event);
}

export function handleVouchRevoked(event: VouchRevokedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);

  if (membership.vouchCount > 0) {
    membership.vouchCount = membership.vouchCount - 1;
  }
  let record = SubjectVouchRecord.load(
    voucherRecordId(event.params.subjectId, event.params.user, event.params.voucher)
  );
  if (record != null) {
    record.active = false;
    record.revokedAt = event.block.timestamp;
    record.save();
  }
  recomputeVouchMet(subject, membership);
  membership.save();
  refold(subject, membership, event);
}

/**
 * VouchSeeded carries the wearer's FINAL accumulated live count for the current epoch (the
 * records-first seed sums prior live records with this call's writes), so it is assigned, not
 * added. It is emitted AFTER the VoucherSeeded rows of the same call.
 */
export function handleVouchSeeded(event: VouchSeededEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  let cfg = getOrCreateVouchConfig(authority, subject, event);

  membership.vouchCount = event.params.count.toI32();
  membership.vouchEpoch = cfg.epoch;
  recomputeVouchMet(subject, membership);
  membership.save();
  refold(subject, membership, event);
}

export function handleVoucherSeeded(event: VoucherSeededEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  let cfg = getOrCreateVouchConfig(authority, subject, event);

  let recordId = voucherRecordId(event.params.subjectId, event.params.user, event.params.voucher);
  let record = SubjectVouchRecord.load(recordId);
  if (record == null) {
    record = new SubjectVouchRecord(recordId);
    record.membership = membership.id;
    record.subject = subject.id;
    record.authority = authority.id;
    record.organization = authority.organization;
    record.user = event.params.user;
    record.voucher = event.params.voucher;
    record.voucherUsername = getUsernameForAddress(event.params.voucher);
    record.vouchedAt = event.block.timestamp;
    record.vouchedAtBlock = event.block.number;
  }
  record.config = cfg.id;
  record.active = true;
  record.seeded = true;
  record.epoch = cfg.epoch;
  record.revokedAt = null;
  record.transactionHash = event.transaction.hash;
  record.save();
}

/**
 * VouchEpochReset (amnesty) — every wearer's tally is stranded at once. This is the config-level
 * lapse the spec calls out as the ONLY event-lag window: on chain those members stay accepted
 * until reconcile() runs, in the mirror they lose the vouch arm immediately.
 */
export function handleVouchEpochReset(event: VouchEpochResetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let cfg = getOrCreateVouchConfig(authority, subject, event);
  cfg.epoch = event.params.newEpoch;
  cfg.lastUpdatedAt = event.block.timestamp;
  cfg.save();
  refoldAcceptedMembers(subject, event);
}

/**
 * UserVouchesCleared — governance strands ONE wearer's vouches permanently (the contract bumps a
 * per-user generation). Mirrored by parking the row's epoch at the uint64 SENTINEL, which can never
 * equal a real subject epoch.
 *
 * The per-voucher RECORDS are swept too. The generation bump strands them exactly as an epoch reset
 * strands a tally — but with the record's own `epoch` still matching the config, so unlike the
 * epoch-reset case a consumer CANNOT detect the staleness by comparison. Left alone they render as
 * live vouchers whose revokeVouch reverts HasNotVouched. The list is bounded by the wearer's
 * voucher count (a handful).
 */
export function handleUserVouchesCleared(event: UserVouchesClearedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let membership = getOrCreateMembership(authority, subject, event.params.user, event);
  membership.vouchCount = 0;
  membership.vouchEpoch = vouchEpochSentinel();
  membership.vouchMet = false;
  membership.save();

  let records = membership.vouches.load();
  for (let i = 0; i < records.length; i++) {
    let record = records[i];
    if (!record.active) {
      continue;
    }
    record.active = false;
    record.revokedAt = event.block.timestamp;
    record.save();
  }

  refold(subject, membership, event);
}

export function handleMaxDailyVouchesSet(event: MaxDailyVouchesSetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  authority.maxDailyVouches = event.params.maxDailyVouches.toI32();
  authority.lastUpdatedAt = event.block.timestamp;
  authority.save();
}

/*═══════════════════════════════ email attestor ═══════════════════════════════*/

export function handleEmailVerifiedSet(event: EmailVerifiedSetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  // setEmailVerified checks nothing about the subject, so a GROUP id can be attested — and is inert
  // on chain (the email arm is only read for ROLE subjects). Record the attestation, fold nothing.
  let membership = membershipForRow(authority, subject, event.params.user, event);

  let id = membershipEntityId(subject.subjectId, event.params.user);
  let verification = EmailVerification.load(id);
  if (verification == null) {
    verification = new EmailVerification(id);
    verification.subject = subject.id;
    verification.authority = authority.id;
    verification.organization = authority.organization;
    verification.user = event.params.user;
    verification.verifiedAt = event.block.timestamp;
  }
  if (membership === null) {
    verification.membership = null;
  } else {
    verification.membership = membership.id;
  }
  verification.verified = event.params.verified;
  if (event.params.verified) {
    verification.verifiedAt = event.block.timestamp;
  }
  verification.lastUpdatedAt = event.block.timestamp;
  verification.transactionHash = event.transaction.hash;
  verification.save();

  if (membership !== null) {
    membership.emailVerified = event.params.verified;
    membership.save();
    refold(subject, membership, event);
  }
}

/*═══════════════════════════════ permission table ═══════════════════════════════*/

export function handlePermSet(event: PermSetEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let subject = getOrCreateSubject(authority, event.params.subjectId, event);
  let id = permRowId(event.params.subjectId, event.params.permKey, event.params.ctx);

  let row = PermRow.load(id);
  if (row == null) {
    row = new PermRow(id);
    row.subject = subject.id;
    row.authority = authority.id;
    row.organization = authority.organization;
    row.permKey = event.params.permKey;
    row.ctx = event.params.ctx;
    row.isGlobalCtx = event.params.ctx.equals(ZERO_BYTES32);
    // The FOLD TAG is the TOP BYTE of the key: 0x00 bool-any, 0x01 OR-mask, 0x02 reserved MAX.
    row.foldTag = event.params.permKey.length > 0 ? event.params.permKey[0] : 0;
    row.setAt = event.block.timestamp;
  }
  let word = event.params.word;
  row.word = word;
  row.exists = word.bitAnd(existsBit()).gt(BigInt.zero());
  row.inheritGlobal = word.bitAnd(inheritGlobalBit()).gt(BigInt.zero());
  row.value = word.bitAnd(valueMask());
  row.clearedAt = null;
  row.lastUpdatedAt = event.block.timestamp;
  row.transactionHash = event.transaction.hash;
  row.save();
}

export function handlePermCleared(event: PermClearedEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let row = PermRow.load(permRowId(event.params.subjectId, event.params.permKey, event.params.ctx));
  if (row == null) {
    // clearPerm on an absent row still emits PermCleared; nothing to record.
    return;
  }
  row.word = BigInt.zero();
  row.exists = false;
  row.inheritGlobal = false;
  row.value = BigInt.zero();
  row.clearedAt = event.block.timestamp;
  row.lastUpdatedAt = event.block.timestamp;
  row.transactionHash = event.transaction.hash;
  row.save();
}

/*═══════════════════════════════ config lints ═══════════════════════════════*/

function lintCodeName(code: i32): string {
  if (code == 1) {
    return "QuorumNoOp";
  }
  if (code == 2) {
    return "VouchWithMaxMembers";
  }
  if (code == 3) {
    return "DefaultAllowStrongPerms";
  }
  if (code == 4) {
    return "GroupFanout";
  }
  if (code == 5) {
    return "SelfVoucher";
  }
  if (code == 0) {
    return "None";
  }
  return "Unknown";
}

export function handleConfigLint(event: ConfigLintEventEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  let row = new ConfigLintEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  row.authority = authority.id;
  row.organization = authority.organization;
  row.subjectId = event.params.subjectId;
  let subject = Subject.load(subjectEntityId(event.params.subjectId));
  if (subject != null) {
    row.subject = subject.id;
  }
  row.lintCode = event.params.lintCode;
  row.code = lintCodeName(event.params.lintCode);
  row.emittedAt = event.block.timestamp;
  row.emittedAtBlock = event.block.number;
  row.transactionHash = event.transaction.hash;
  row.save();
}

/*═══════════════════════════════ ERC-1155 accepted mirror ═══════════════════════════════*/

/**
 * The authority's TransferSingle is the ACCEPTED-FLIP feed: `_flipOn` mints, `_flipOff` burns, and
 * every lifecycle verb that moves acceptance goes through one of them. This handler therefore owns
 * `accepted` / `acceptedAt` / memberCount, while the lifecycle handlers own provenance only — no
 * double counting is possible.
 *
 * ONE deliberate exception: `emitUnportedBurns` fires a burn for a legacy wearer who was NEVER
 * ported (a drift victim or a deliberate drop) so the event-driven subgraph carries no permanent
 * ghost. Those users have no accepted row here, so the burn must NOT decrement any counter — it
 * only clears the legacy RoleWearer through the continuity mirror.
 */
export function handleAuthorityTransferSingle(event: TransferSingleEvent): void {
  let authority = loadAuthority(event.address);
  if (authority == null) {
    return;
  }
  if (event.params.value.isZero()) {
    return;
  }
  let isMint = event.params.from.equals(ZERO_ADDRESS);
  let isBurn = event.params.to.equals(ZERO_ADDRESS);
  if (isMint == isBurn) {
    // The authority never transfers between wearers (subjects are soulbound); 0->0 is undefined.
    log.warning("[MembershipAuthority] non-mint/burn TransferSingle from {} to {} tx {}", [
      event.params.from.toHexString(),
      event.params.to.toHexString(),
      event.transaction.hash.toHexString()
    ]);
    return;
  }

  let subjectId = event.params.id;
  let subject = getOrCreateSubject(authority, subjectId, event);
  let orgId = changetype<Bytes>(authority.organization);
  let wearer = isMint ? event.params.to : event.params.from;
  let membership = getOrCreateMembership(authority, subject, wearer, event);

  if (isMint) {
    if (!membership.accepted) {
      membership.accepted = true;
      membership.acceptedAt = event.block.timestamp;
      // Seeds applied while the authority is PAUSED are backdated on-chain to acceptedAt = 1 so
      // in-flight proposals stay votable. The event carries no timestamp, so flag the row instead
      // of inventing one.
      membership.seededWhilePaused = authority.paused;
      linkMembershipUser(membership, event);
      membership.save();

      subject.memberCount = subject.memberCount + 1;
      addAcceptedUser(subject, wearer);
      subject.lastUpdatedAt = event.block.timestamp;
      subject.save();

      bumpAcceptedMembershipCount(event.address, 1, event.block.timestamp);
    }
    refold(subject, membership, event);
    // CONTINUITY: same helper, same entity ids as the static Hats dataSource.
    applyHatTransferAdd(orgId, Address.fromBytes(wearer), subjectId, event);
    // The User entity may have been created by the line above; link it now.
    linkMembershipUser(membership, event);
    membership.save();
    return;
  }

  if (membership.accepted) {
    membership.accepted = false;
    membership.acceptedAt = null;
    membership.seededWhilePaused = false;
    membership.save();

    subject.memberCount = subject.memberCount > 0 ? subject.memberCount - 1 : 0;
    removeAcceptedUser(subject, wearer);
    subject.lastUpdatedAt = event.block.timestamp;
    subject.save();

    bumpAcceptedMembershipCount(event.address, -1, event.block.timestamp);
  }
  refold(subject, membership, event);
  applyHatTransferRemove(orgId, Address.fromBytes(wearer), subjectId, event);
}
