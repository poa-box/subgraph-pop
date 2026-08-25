// Mock-event factories for the Access-v2 MembershipAuthority template.
//
// Every factory takes the authority address first (the template is per-org, so event.address is
// what every handler keys on) and bumps a shared log index, because several entities in this
// family are IMMUTABLE and keyed by (txHash, logIndex) — reusing newMockEvent's fixed default
// would silently collapse rows that a real ceremony emits separately.

import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  MembershipAuthorityInitialized,
  PausedSet,
  SubjectCreated,
  SubjectRenamed,
  SubjectDefaultSet,
  MaxMembersSet,
  GroupCompositionChanged,
  ManagerConfigSet,
  RuleSet,
  RuleCleared,
  RoleOffered,
  OfferWithdrawn,
  RoleGranted,
  RoleClaimed,
  RoleRemoved,
  RoleRenounced,
  MembershipReconciled,
  PendingActionCreated,
  PendingActionCancelled,
  PendingActionVoided,
  PendingActionFinalized,
  VouchConfigured,
  Vouched,
  VouchRevoked,
  VouchSeeded,
  VoucherSeeded,
  VouchEpochReset,
  UserVouchesCleared,
  MaxDailyVouchesSet,
  EmailVerifiedSet,
  PermSet,
  PermCleared,
  ConfigLint,
  TransferSingle
} from "../generated/templates/MembershipAuthority/MembershipAuthority";

let nextLogIndex: i32 = 1;

export function resetLogIndex(): void {
  nextLogIndex = 1;
}

function base(authority: Address): ethereum.Event {
  let event = newMockEvent();
  event.address = authority;
  event.logIndex = BigInt.fromI32(nextLogIndex);
  nextLogIndex = nextLogIndex + 1;
  event.parameters = new Array();
  return event;
}

function u256(value: BigInt): ethereum.Value {
  return ethereum.Value.fromUnsignedBigInt(value);
}

function addr(value: Address): ethereum.Value {
  return ethereum.Value.fromAddress(value);
}

function boolValue(value: boolean): ethereum.Value {
  return ethereum.Value.fromBoolean(value);
}

export function createMembershipAuthorityInitializedEvent(
  authority: Address,
  executor: Address,
  orgId: Bytes,
  paused: boolean
): MembershipAuthorityInitialized {
  let event = changetype<MembershipAuthorityInitialized>(base(authority));
  event.parameters.push(new ethereum.EventParam("executor", addr(executor)));
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(new ethereum.EventParam("paused", boolValue(paused)));
  return event;
}

export function createPausedSetEvent(authority: Address, paused: boolean): PausedSet {
  let event = changetype<PausedSet>(base(authority));
  event.parameters.push(new ethereum.EventParam("paused", boolValue(paused)));
  return event;
}

export function createSubjectCreatedEvent(
  authority: Address,
  subjectId: BigInt,
  kind: i32,
  name: string,
  metadataCID: Bytes,
  maxMembers: i32
): SubjectCreated {
  let event = changetype<SubjectCreated>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("kind", u256(BigInt.fromI32(kind))));
  event.parameters.push(new ethereum.EventParam("name", ethereum.Value.fromString(name)));
  event.parameters.push(
    new ethereum.EventParam("metadataCID", ethereum.Value.fromFixedBytes(metadataCID))
  );
  event.parameters.push(new ethereum.EventParam("maxMembers", u256(BigInt.fromI32(maxMembers))));
  return event;
}

export function createSubjectRenamedEvent(
  authority: Address,
  subjectId: BigInt,
  name: string,
  metadataCID: Bytes,
  imageURI: string
): SubjectRenamed {
  let event = changetype<SubjectRenamed>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("name", ethereum.Value.fromString(name)));
  event.parameters.push(
    new ethereum.EventParam("metadataCID", ethereum.Value.fromFixedBytes(metadataCID))
  );
  event.parameters.push(new ethereum.EventParam("imageURI", ethereum.Value.fromString(imageURI)));
  return event;
}

export function createSubjectDefaultSetEvent(
  authority: Address,
  subjectId: BigInt,
  allow: boolean
): SubjectDefaultSet {
  let event = changetype<SubjectDefaultSet>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("allow", boolValue(allow)));
  return event;
}

export function createMaxMembersSetEvent(
  authority: Address,
  subjectId: BigInt,
  maxMembers: i32
): MaxMembersSet {
  let event = changetype<MaxMembersSet>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("maxMembers", u256(BigInt.fromI32(maxMembers))));
  return event;
}

export function createGroupCompositionChangedEvent(
  authority: Address,
  groupId: BigInt,
  roleId: BigInt,
  added: boolean
): GroupCompositionChanged {
  let event = changetype<GroupCompositionChanged>(base(authority));
  event.parameters.push(new ethereum.EventParam("groupId", u256(groupId)));
  event.parameters.push(new ethereum.EventParam("roleId", u256(roleId)));
  event.parameters.push(new ethereum.EventParam("added", boolValue(added)));
  return event;
}

export function createManagerConfigSetEvent(
  authority: Address,
  subjectId: BigInt,
  managerSubject: BigInt,
  caps: i32,
  delaySecs: i32
): ManagerConfigSet {
  let event = changetype<ManagerConfigSet>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("managerSubject", u256(managerSubject)));
  event.parameters.push(new ethereum.EventParam("caps", u256(BigInt.fromI32(caps))));
  event.parameters.push(new ethereum.EventParam("delaySecs", u256(BigInt.fromI32(delaySecs))));
  return event;
}

export function createRuleSetEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  kind: i32,
  author: i32,
  delegable: boolean
): RuleSet {
  let event = changetype<RuleSet>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("kind", u256(BigInt.fromI32(kind))));
  event.parameters.push(new ethereum.EventParam("author", u256(BigInt.fromI32(author))));
  event.parameters.push(new ethereum.EventParam("delegable", boolValue(delegable)));
  return event;
}

export function createRuleClearedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address
): RuleCleared {
  let event = changetype<RuleCleared>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  return event;
}

export function createRoleOfferedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  actor: Address,
  delegated: boolean
): RoleOffered {
  let event = changetype<RoleOffered>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("actor", addr(actor)));
  event.parameters.push(new ethereum.EventParam("delegated", boolValue(delegated)));
  return event;
}

export function createOfferWithdrawnEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  actor: Address
): OfferWithdrawn {
  let event = changetype<OfferWithdrawn>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("actor", addr(actor)));
  return event;
}

export function createRoleGrantedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  actor: Address,
  delegated: boolean
): RoleGranted {
  let event = changetype<RoleGranted>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("actor", addr(actor)));
  event.parameters.push(new ethereum.EventParam("delegated", boolValue(delegated)));
  return event;
}

export function createRoleClaimedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address
): RoleClaimed {
  let event = changetype<RoleClaimed>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  return event;
}

export function createRoleRemovedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  banned: boolean,
  actor: Address,
  delegated: boolean
): RoleRemoved {
  let event = changetype<RoleRemoved>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("banned", boolValue(banned)));
  event.parameters.push(new ethereum.EventParam("actor", addr(actor)));
  event.parameters.push(new ethereum.EventParam("delegated", boolValue(delegated)));
  return event;
}

export function createRoleRenouncedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address
): RoleRenounced {
  let event = changetype<RoleRenounced>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  return event;
}

export function createMembershipReconciledEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address
): MembershipReconciled {
  let event = changetype<MembershipReconciled>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  return event;
}

export function createPendingActionCreatedEvent(
  authority: Address,
  pendingId: BigInt,
  subjectId: BigInt,
  user: Address,
  action: i32,
  actor: Address,
  activatesAt: BigInt
): PendingActionCreated {
  let event = changetype<PendingActionCreated>(base(authority));
  event.parameters.push(new ethereum.EventParam("pendingId", u256(pendingId)));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("action", u256(BigInt.fromI32(action))));
  event.parameters.push(new ethereum.EventParam("actor", addr(actor)));
  event.parameters.push(new ethereum.EventParam("activatesAt", u256(activatesAt)));
  return event;
}

export function createPendingActionCancelledEvent(
  authority: Address,
  pendingId: BigInt,
  by: Address
): PendingActionCancelled {
  let event = changetype<PendingActionCancelled>(base(authority));
  event.parameters.push(new ethereum.EventParam("pendingId", u256(pendingId)));
  event.parameters.push(new ethereum.EventParam("by", addr(by)));
  return event;
}

export function createPendingActionVoidedEvent(
  authority: Address,
  pendingId: BigInt
): PendingActionVoided {
  let event = changetype<PendingActionVoided>(base(authority));
  event.parameters.push(new ethereum.EventParam("pendingId", u256(pendingId)));
  return event;
}

export function createPendingActionFinalizedEvent(
  authority: Address,
  pendingId: BigInt
): PendingActionFinalized {
  let event = changetype<PendingActionFinalized>(base(authority));
  event.parameters.push(new ethereum.EventParam("pendingId", u256(pendingId)));
  return event;
}

export function createVouchConfiguredEvent(
  authority: Address,
  subjectId: BigInt,
  quorum: i32,
  voucherSubject: BigInt
): VouchConfigured {
  let event = changetype<VouchConfigured>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("quorum", u256(BigInt.fromI32(quorum))));
  event.parameters.push(new ethereum.EventParam("voucherSubject", u256(voucherSubject)));
  return event;
}

export function createVouchedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  voucher: Address
): Vouched {
  let event = changetype<Vouched>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("voucher", addr(voucher)));
  return event;
}

export function createVouchRevokedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  voucher: Address
): VouchRevoked {
  let event = changetype<VouchRevoked>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("voucher", addr(voucher)));
  return event;
}

export function createVouchSeededEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  count: i32
): VouchSeeded {
  let event = changetype<VouchSeeded>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("count", u256(BigInt.fromI32(count))));
  return event;
}

export function createVoucherSeededEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  voucher: Address
): VoucherSeeded {
  let event = changetype<VoucherSeeded>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("voucher", addr(voucher)));
  return event;
}

export function createVouchEpochResetEvent(
  authority: Address,
  subjectId: BigInt,
  newEpoch: BigInt
): VouchEpochReset {
  let event = changetype<VouchEpochReset>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("newEpoch", u256(newEpoch)));
  return event;
}

export function createUserVouchesClearedEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address
): UserVouchesCleared {
  let event = changetype<UserVouchesCleared>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  return event;
}

export function createMaxDailyVouchesSetEvent(
  authority: Address,
  maxDailyVouches: i32
): MaxDailyVouchesSet {
  let event = changetype<MaxDailyVouchesSet>(base(authority));
  event.parameters.push(
    new ethereum.EventParam("maxDailyVouches", u256(BigInt.fromI32(maxDailyVouches)))
  );
  return event;
}

export function createEmailVerifiedSetEvent(
  authority: Address,
  subjectId: BigInt,
  user: Address,
  verified: boolean
): EmailVerifiedSet {
  let event = changetype<EmailVerifiedSet>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("user", addr(user)));
  event.parameters.push(new ethereum.EventParam("verified", boolValue(verified)));
  return event;
}

export function createPermSetEvent(
  authority: Address,
  subjectId: BigInt,
  permKey: Bytes,
  ctx: Bytes,
  word: BigInt
): PermSet {
  let event = changetype<PermSet>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("permKey", ethereum.Value.fromFixedBytes(permKey)));
  event.parameters.push(new ethereum.EventParam("ctx", ethereum.Value.fromFixedBytes(ctx)));
  event.parameters.push(new ethereum.EventParam("word", u256(word)));
  return event;
}

export function createPermClearedEvent(
  authority: Address,
  subjectId: BigInt,
  permKey: Bytes,
  ctx: Bytes
): PermCleared {
  let event = changetype<PermCleared>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("permKey", ethereum.Value.fromFixedBytes(permKey)));
  event.parameters.push(new ethereum.EventParam("ctx", ethereum.Value.fromFixedBytes(ctx)));
  return event;
}

export function createConfigLintEvent(
  authority: Address,
  subjectId: BigInt,
  lintCode: i32
): ConfigLint {
  let event = changetype<ConfigLint>(base(authority));
  event.parameters.push(new ethereum.EventParam("subjectId", u256(subjectId)));
  event.parameters.push(new ethereum.EventParam("lintCode", u256(BigInt.fromI32(lintCode))));
  return event;
}

export function createTransferSingleEvent(
  authority: Address,
  operator: Address,
  from: Address,
  to: Address,
  id: BigInt,
  value: BigInt
): TransferSingle {
  let event = changetype<TransferSingle>(base(authority));
  event.parameters.push(new ethereum.EventParam("operator", addr(operator)));
  event.parameters.push(new ethereum.EventParam("from", addr(from)));
  event.parameters.push(new ethereum.EventParam("to", addr(to)));
  event.parameters.push(new ethereum.EventParam("id", u256(id)));
  event.parameters.push(new ethereum.EventParam("value", u256(value)));
  return event;
}
