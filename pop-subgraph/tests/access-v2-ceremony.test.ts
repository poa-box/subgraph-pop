// CEREMONY-SHAPED INTEGRATION TESTS — replay the EXACT event sequence a real org migration emits.
//
// The shape is taken from script/accessv2/AccessV2MigrationBase.sol in the contracts repo:
//
//   PREDEPLOY tx (NOT indexed — cross-block-earlier than the template):
//     BeaconProxy(beacon, initialize(EMPTY genesis))  ->  MembershipAuthorityInitialized, PausedSet
//
//   SEED BATCH 1 (one governance tx):
//     registerOrgContract            -> ContractRegistered  (THE TEMPLATE IS CREATED HERE)
//     seedSubjects(admin)            -> SubjectCreated(topHat)
//     seedRules + seedMemberships    -> RuleSet(sticky) / TransferSingle mint / RoleGranted
//     seedSubjects(roles)            -> SubjectCreated x N
//     live-default adoption          -> SubjectDefaultSet
//     SUBJECT_RENAME + module perms  -> PermSet x N (+ ConfigLint)
//
//   SEED BATCH 2:
//     per-member seedRules+seedMemberships pairs, tighten (MaxMembersSet), BANS, vouch, email
//
//   CUTOVER BATCH (atomic, in order):
//     delta-seed -> router BIND -> setMembershipAuthority x8 -> targetTypes -> UNPAUSE ->
//     legacy toggle-off -> CutoverVerifier.verify
//
// NOTE the absence of emitUnportedBurns: the ceremony NEVER calls it (grep script/accessv2 — no
// caller), because runbook ruling R4 realizes "§6 burn-shaped events for unported wearers" as
// full-port + in-batch count verification instead. The mapping still HANDLES a burn-for-a-
// non-member (the call exists on the contract and an operator may use it out of band), and that
// path is tested below on its own — but it is not part of the replay.
//
// The assertions below are the entity graph the frontend reads afterwards.

import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  handleSubjectCreated,
  handleSubjectDefaultSet,
  handleMaxMembersSet,
  handleManagerConfigSet,
  handleRuleSet,
  handleRuleCleared,
  handleRoleGranted,
  handleRoleRemoved,
  handleAuthorityPausedSet,
  handleVouchConfigured,
  handleVoucherSeeded,
  handleVouchSeeded,
  handleEmailVerifiedSet,
  handlePermSet,
  handleConfigLint,
  handlePendingActionCreated,
  handlePendingActionFinalized,
  handleAuthorityTransferSingle
} from "../src/membership-authority";
import { handleAuthorityBound, handleAuthorityUnbound } from "../src/authority-router";
import { handleContractRegistered } from "../src/org-registry";
import { handleHatsTransferSingle, handleHatsStatusChanged } from "../src/hats";
import { createContractRegisteredEvent } from "./org-registry-utils";
import {
  createTransferSingleEvent as createHatsTransferSingleEvent,
  createHatStatusChangedEvent
} from "./hats-utils";
import {
  resetLogIndex,
  createSubjectCreatedEvent,
  createSubjectDefaultSetEvent,
  createMaxMembersSetEvent,
  createManagerConfigSetEvent,
  createRuleSetEvent,
  createRuleClearedEvent,
  createRoleGrantedEvent,
  createRoleRemovedEvent,
  createPausedSetEvent,
  createVouchConfiguredEvent,
  createVoucherSeededEvent,
  createVouchSeededEvent,
  createEmailVerifiedSetEvent,
  createPermSetEvent,
  createConfigLintEvent,
  createPendingActionCreatedEvent,
  createPendingActionFinalizedEvent,
  createTransferSingleEvent
} from "./membership-authority-utils";
import {
  createAuthorityBoundEvent,
  createAuthorityUnboundEvent
} from "./authority-router-utils";
import { Hat, HatLookup, Organization } from "../generated/schema";

const MEMBERSHIP_AUTHORITY_TYPE_ID = "0xdff254c0d9c318c4e70eac95af4c0c9189e13f9d51ae2cfe2c1c446c4775ddb8";

const ORG_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const AUTHORITY = "0x00000000000000000000000000000000000000aa";
const BEACON = "0x00000000000000000000000000000000000000bb";
const EXECUTOR = "0x00000000000000000000000000000000000000e1";
const CONTRACT_ID = "0x2222222222222222222222222222222222222222222222222222222222222222";
const ROUTER = "0x9591d1e139dcfbe0ba12d6477b85d1035a2417f1";
const HATS = "0x3bc1a0ad72417f2d411118085256fc53cbddd137";

const ALICE = "0x0000000000000000000000000000000000000a11"; // executive + member
const BOB = "0x0000000000000000000000000000000000000b0b"; // vouched member
const CAROL = "0x0000000000000000000000000000000000000ca7"; // email-verified member
const DAVE = "0x0000000000000000000000000000000000000da7"; // DRIFT — joined after the snapshot
const MALLORY = "0x0000000000000000000000000000000000000ba4"; // banned + unported

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DD_VOTE_KEY = "0x00aabbccddeeff00112233445566778899aabbccddeeff001122334455667788";
const SUBJECT_RENAME_KEY = "0x00ffeeddccbbaa00112233445566778899aabbccddeeff001122334455667788";
const TOPHAT_DOMAIN = 1077;

function authority(): Address {
  return Address.fromString(AUTHORITY);
}

function orgId(): Bytes {
  return Bytes.fromHexString(ORG_ID);
}

function zeroHash(): Bytes {
  return Bytes.fromHexString(ZERO_HASH);
}

function topHatId(): BigInt {
  return BigInt.fromI32(2).pow(224).times(BigInt.fromI32(TOPHAT_DOMAIN));
}

function memberHatId(): BigInt {
  return topHatId().plus(BigInt.fromI32(2).pow(208));
}

function execHatId(): BigInt {
  return topHatId().plus(BigInt.fromI32(2).pow(208).times(BigInt.fromI32(2)));
}

function membershipId(subject: BigInt, user: string): string {
  return subject.toString() + "-" + user;
}

function seedPair(subjectId: BigInt, user: string, delegable: boolean): void {
  // The §6 SEED INVARIANT: every seeded membership carries its eligibility source in the SAME
  // slice — seedRules(Grant) always precedes seedMemberships for that member.
  handleRuleSet(
    createRuleSetEvent(authority(), subjectId, Address.fromString(user), 1, 0, delegable)
  );
  handleAuthorityTransferSingle(
    createTransferSingleEvent(
      authority(),
      Address.fromString(EXECUTOR),
      Address.fromString(ZERO_ADDRESS),
      Address.fromString(user),
      subjectId,
      BigInt.fromI32(1)
    )
  );
  handleRoleGranted(
    createRoleGrantedEvent(
      authority(),
      subjectId,
      Address.fromString(user),
      Address.fromString(EXECUTOR),
      false
    )
  );
}

/** Seed a member whose eligibility comes from an ATTESTOR, not an explicit rule. */
function seedAcceptOnly(subjectId: BigInt, user: string): void {
  handleAuthorityTransferSingle(
    createTransferSingleEvent(
      authority(),
      Address.fromString(EXECUTOR),
      Address.fromString(ZERO_ADDRESS),
      Address.fromString(user),
      subjectId,
      BigInt.fromI32(1)
    )
  );
  handleRoleGranted(
    createRoleGrantedEvent(
      authority(),
      subjectId,
      Address.fromString(user),
      Address.fromString(EXECUTOR),
      false
    )
  );
}

/** Predeploy + seed batch 1 + seed batch 2, i.e. everything before the cutover proposal. */
function runSeedCeremony(): void {
  resetLogIndex();

  let org = new Organization(orgId());
  org.executorContract = Bytes.fromHexString(EXECUTOR);
  org.topHatId = topHatId();
  org.roleHatIds = [memberHatId(), execHatId()];
  org.deployedAt = BigInt.fromI32(1000);
  org.deployedAtBlock = BigInt.fromI32(100);
  org.save();

  /*── SEED BATCH 1 ──────────────────────────────────────────────────────────────*/
  // (0) registerOrgContract — the template is created here. Everything after this indexes.
  handleContractRegistered(
    createContractRegisteredEvent(
      Bytes.fromHexString(CONTRACT_ID),
      orgId(),
      Bytes.fromHexString(MEMBERSHIP_AUTHORITY_TYPE_ID),
      authority(),
      Address.fromString(BEACON),
      true,
      Address.fromString(EXECUTOR)
    )
  );

  // (1) ADMIN subject + membership LEAD the batch (the lock-out guard): the Executor is the sole
  //     member and its grant is STICKY so no delegate can ever clear it.
  handleSubjectCreated(
    createSubjectCreatedEvent(authority(), topHatId(), 0, "Admin", zeroHash(), 0)
  );
  seedPair(topHatId(), EXECUTOR, false);

  // (2) Role subjects (uncapped during seeding, tightened in batch 2).
  handleSubjectCreated(
    createSubjectCreatedEvent(authority(), memberHatId(), 0, "Member", zeroHash(), 0)
  );
  handleSubjectCreated(
    createSubjectCreatedEvent(authority(), execHatId(), 0, "Executive", zeroHash(), 0)
  );

  // (3) LIVE-DEFAULT adoption: the member role is open TODAY on chain, so it is seeded open.
  //     The Executive role stays deny-by-default (a titled role is never permissionlessly claimable).
  handleSubjectDefaultSet(createSubjectDefaultSetEvent(authority(), memberHatId(), true));

  // (4) SUBJECT_RENAME seeded from live metadataAdmin wearership (the Executive role).
  handlePermSet(
    createPermSetEvent(
      authority(),
      execHatId(),
      Bytes.fromHexString(SUBJECT_RENAME_KEY),
      zeroHash(),
      BigInt.fromI32(2).pow(255).plus(BigInt.fromI32(1))
    )
  );

  // (5) Module perms from the audited inventory. A default-ALLOW subject holding real power is a
  //     documented LINT, not an error — the contract emits it alongside the write.
  handlePermSet(
    createPermSetEvent(
      authority(),
      memberHatId(),
      Bytes.fromHexString(DD_VOTE_KEY),
      zeroHash(),
      BigInt.fromI32(2).pow(255).plus(BigInt.fromI32(1))
    )
  );
  handleConfigLint(createConfigLintEvent(authority(), memberHatId(), 3));

  /*── SEED BATCH 2 ──────────────────────────────────────────────────────────────*/
  // Memberships: Alice is an Executive AND a member; Bob and Carol are attestor-held members.
  seedPair(execHatId(), ALICE, false); // officer class -> STICKY
  seedPair(memberHatId(), ALICE, true); // member class -> delegable

  // Tighten the officer cap after the memberships land.
  handleMaxMembersSet(createMaxMembersSetEvent(authority(), execHatId(), 4));

  // Execs manage Members (CAP_GRANT | CAP_REMOVE) behind a 2-day review window.
  handleManagerConfigSet(
    createManagerConfigSetEvent(authority(), memberHatId(), execHatId(), 3, 172800)
  );

  // BANS carried from the legacy wearerRules.
  handleRuleSet(
    createRuleSetEvent(authority(), memberHatId(), Address.fromString(MALLORY), 2, 0, false)
  );

  // VOUCH port (records-first): Bob is held by a met quorum, not by an explicit grant.
  handleVouchConfigured(createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId()));
  handleVoucherSeeded(
    createVoucherSeededEvent(
      authority(),
      memberHatId(),
      Address.fromString(BOB),
      Address.fromString(ALICE)
    )
  );
  handleVouchSeeded(
    createVouchSeededEvent(authority(), memberHatId(), Address.fromString(BOB), 1)
  );
  seedAcceptOnly(memberHatId(), BOB);

  // EMAIL port (Test6 zk-email): Carol is held by the email attestor.
  handleEmailVerifiedSet(
    createEmailVerifiedSetEvent(authority(), memberHatId(), Address.fromString(CAROL), true)
  );
  seedAcceptOnly(memberHatId(), CAROL);
}

/**
 * The atomic cutover batch, in _buildCutoverBatch's order (AccessV2MigrationBase.sol:1421):
 * delta-seed slices -> bindAuthority -> setMembershipAuthority x7 + Executor -> setTargetTypesBatch
 * -> setPaused(false) -> batchSetHatStatus(off) -> CutoverVerifier.verify.
 *
 * There is NO emitUnportedBurns call — the whole script tree contains no caller. Runbook ruling R4
 * replaced "§6 burn-shaped events for unported wearers" with full-port + in-batch count
 * verification, so the batch emits no burn at all.
 */
function runCutover(includeDelta: boolean): void {
  // 0. DELTA-SEED — legacy wearers who joined between the snapshot and the vote.
  if (includeDelta) {
    seedPair(memberHatId(), DAVE, true);
  }
  // 1. Router BIND — BEFORE toggle-off, so adopted ids flip to authority-native atomically.
  handleAuthorityBound(
    createAuthorityBoundEvent(
      Address.fromString(ROUTER),
      orgId(),
      BigInt.fromI32(TOPHAT_DOMAIN),
      authority()
    )
  );
  // 2-9. setMembershipAuthority x8 + targetTypes — no authority events.
  // 10. UNPAUSE.
  handleAuthorityPausedSet(createPausedSetEvent(authority(), false));
  // 11. Legacy toggle-off — a ToggleModule-local write; Hats emits nothing and no token is burned
  //     (rollback DEPENDS on the legacy balances surviving, §6 ROLLBACK).
  // 12. CutoverVerifier.verify — a require()-only call, no events.
}

afterEach(() => {
  clearStore();
});

describe("Access v2 — the migration ceremony end to end", () => {
  test("the seeded + cutover org resolves to the expected entity graph", () => {
    runSeedCeremony();
    runCutover(true);

    // ---- the authority itself ----
    assert.fieldEquals("Organization", ORG_ID, "membershipAuthority", AUTHORITY);
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "executor", EXECUTOR);
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "paused", "false");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "isRouterBound", "true");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "roleSubjectCount", "3");
    // Admin(1) + Alice x2 + Bob + Carol + Dave = 6 accepted memberships.
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "acceptedMembershipCount", "6");

    // ---- ENTITY-ID CONTINUITY: adopted ids keep their Role / HatLookup keys ----
    assert.fieldEquals("Subject", memberHatId().toString(), "isLegacyAdopted", "true");
    assert.fieldEquals(
      "Subject",
      memberHatId().toString(),
      "role",
      ORG_ID + "-" + memberHatId().toString()
    );
    assert.fieldEquals("HatLookup", memberHatId().toString(), "organization", ORG_ID);
    assert.fieldEquals("Role", ORG_ID + "-" + execHatId().toString(), "name", "Executive");

    // ---- memberships: accepted AND eligible, each held by the source it was seeded with ----
    let aliceExec = membershipId(execHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", aliceExec, "isMember", "true");
    assert.fieldEquals("SubjectMembership", aliceExec, "eligibilitySource", "ExplicitGrant");
    // Officer-class seeds are STICKY: no delegate may clear them, and they survive renounce.
    assert.fieldEquals("AccessRule", aliceExec, "sticky", "true");
    // Member-class seeds are delegable, which is what keeps "Execs manage Members" alive.
    assert.fieldEquals("AccessRule", membershipId(memberHatId(), ALICE), "sticky", "false");

    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), BOB), "isMember", "true");
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), BOB),
      "eligibilitySource",
      "VouchQuorum"
    );
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), CAROL), "isMember", "true");
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), CAROL),
      "eligibilitySource",
      "EmailVerified"
    );

    // Every seeded member is accepted AND eligible — the §6 SEED INVARIANT, asserted per row.
    assert.fieldEquals("SubjectMembership", membershipId(topHatId(), EXECUTOR), "isMember", "true");
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), DAVE), "isMember", "true");

    // ---- seeds landed while PAUSED, so their on-chain acceptedAt is backdated to 1 ----
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), ALICE),
      "seededWhilePaused",
      "true"
    );

    // ---- the ban: eligible=false, never a member, and no ghost RoleWearer ----
    let mallory = membershipId(memberHatId(), MALLORY);
    assert.fieldEquals("SubjectMembership", mallory, "eligibilitySource", "ExplicitBan");
    assert.fieldEquals("SubjectMembership", mallory, "isMember", "false");
    assert.fieldEquals("SubjectMembership", mallory, "accepted", "false");

    // ---- counts the CutoverVerifier also asserts on chain ----
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "4"); // Alice Bob Carol Dave
    assert.fieldEquals("Subject", memberHatId().toString(), "activeMemberCount", "4");
    assert.fieldEquals("Subject", execHatId().toString(), "memberCount", "1");
    assert.fieldEquals("Subject", execHatId().toString(), "maxMembers", "4");

    // ---- vouch records + perm rows + lints ----
    assert.fieldEquals(
      "SubjectVouchRecord",
      memberHatId().toString() + "-" + BOB + "-" + ALICE,
      "seeded",
      "true"
    );
    assert.fieldEquals("SubjectVouchConfig", memberHatId().toString(), "quorum", "1");
    assert.fieldEquals(
      "PermRow",
      memberHatId().toString() + "-" + DD_VOTE_KEY + "-" + ZERO_HASH,
      "exists",
      "true"
    );
    assert.fieldEquals(
      "PermRow",
      execHatId().toString() + "-" + SUBJECT_RENAME_KEY + "-" + ZERO_HASH,
      "exists",
      "true"
    );
    assert.entityCount("ConfigLintEvent", 1);

    // ---- the delegation config the review-window UI reads ----
    assert.fieldEquals("ManagerConfig", memberHatId().toString(), "canGrant", "true");
    assert.fieldEquals("ManagerConfig", memberHatId().toString(), "delaySecs", "172800");

    // ---- the router binding ----
    assert.fieldEquals(
      "RouterBinding",
      ROUTER + "-" + TOPHAT_DOMAIN.toString(),
      "authority",
      AUTHORITY
    );
  });

  test("the REAL cutover emits no burn — an unported legacy wearer stays an active RoleWearer", () => {
    runSeedCeremony();

    // Mallory wears the legacy hat on chain today (indexed from the canonical Hats dataSource) but
    // is ported as a DENY rule, never as a member. Toggle-off is ToggleModule-local and burns no
    // token, and the batch calls no emitUnportedBurns (runbook R4: full-port + in-batch count
    // verification instead), so NOTHING in the ceremony clears her legacy wearer row.
    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(EXECUTOR),
        Address.fromString(ZERO_ADDRESS),
        Address.fromString(MALLORY),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );
    let malloryWearerId = ORG_ID + "-" + memberHatId().toString() + "-" + MALLORY;
    assert.fieldEquals("RoleWearer", malloryWearerId, "isActive", "true");

    runCutover(false);

    // The DIVERGENCE, asserted rather than papered over: the authority says not-a-member while the
    // legacy wearer row stays active. Consumers of a bound org must read SubjectMembership, not
    // RoleWearer (Wave-E doc §7 open item).
    assert.fieldEquals("RoleWearer", malloryWearerId, "isActive", "true");
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), MALLORY),
      "isMember",
      "false"
    );
  });

  test("an out-of-band emitUnportedBurns burn clears the ghost WITHOUT touching the counters", () => {
    // Not part of the ceremony (see above) — but the selector exists and an operator may call it,
    // so the burn-for-a-non-member path stays covered: it must clear the legacy RoleWearer and
    // decrement nothing (the user has no accepted row).
    runSeedCeremony();
    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(EXECUTOR),
        Address.fromString(ZERO_ADDRESS),
        Address.fromString(MALLORY),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );
    runCutover(false);

    handleAuthorityTransferSingle(
      createTransferSingleEvent(
        authority(),
        Address.fromString(EXECUTOR),
        Address.fromString(MALLORY),
        Address.fromString(ZERO_ADDRESS),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );

    let malloryWearerId = ORG_ID + "-" + memberHatId().toString() + "-" + MALLORY;
    assert.fieldEquals("RoleWearer", malloryWearerId, "isActive", "false");
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "3");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "acceptedMembershipCount", "5");
  });

  test("DELTA-SEED — a wearer who drifted in after the snapshot is ported inside the cutover", () => {
    runSeedCeremony();
    // Before the delta, Dave is unknown to the authority.
    assert.notInStore("SubjectMembership", membershipId(memberHatId(), DAVE));

    runCutover(true);

    let dave = membershipId(memberHatId(), DAVE);
    assert.fieldEquals("SubjectMembership", dave, "accepted", "true");
    assert.fieldEquals("SubjectMembership", dave, "isMember", "true");
    assert.fieldEquals("SubjectMembership", dave, "eligibilitySource", "ExplicitGrant");
    // The delta lands BEFORE the unpause, so it is still a backdated seed.
    assert.fieldEquals("SubjectMembership", dave, "seededWhilePaused", "true");
    assert.fieldEquals("RoleWearer", ORG_ID + "-" + memberHatId().toString() + "-" + DAVE, "isActive", "true");
  });

  test("PENDING-ACTION LIFECYCLE — an Exec removes a Member through the review window", () => {
    runSeedCeremony();
    runCutover(false);

    // delegatedRemove(memberHat, Alice) by an Executive: the pending opens, nothing changes yet.
    handlePendingActionCreated(
      createPendingActionCreatedEvent(
        authority(),
        BigInt.fromI32(1),
        memberHatId(),
        Address.fromString(ALICE),
        2,
        Address.fromString(ALICE),
        BigInt.fromI32(172800)
      )
    );
    let pendingId = AUTHORITY + "-1";
    let alice = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("PendingAction", pendingId, "status", "Pending");
    assert.fieldEquals("PendingAction", pendingId, "action", "Remove");
    assert.fieldEquals("SubjectMembership", alice, "pendingAction", pendingId);
    assert.fieldEquals("SubjectMembership", alice, "isMember", "true");

    // finalize() after the delay, in the contract's emission order: PendingActionFinalized (the
    // pending is consumed), then _softRemove's RuleCleared, then the burn, then RoleRemoved.
    handlePendingActionFinalized(
      createPendingActionFinalizedEvent(authority(), BigInt.fromI32(1))
    );
    handleRuleCleared(
      createRuleClearedEvent(authority(), memberHatId(), Address.fromString(ALICE))
    );
    handleAuthorityTransferSingle(
      createTransferSingleEvent(
        authority(),
        Address.fromString(ALICE),
        Address.fromString(ALICE),
        Address.fromString(ZERO_ADDRESS),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );
    handleRoleRemoved(
      createRoleRemovedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        false,
        Address.fromString(ALICE),
        true
      )
    );

    assert.fieldEquals("PendingAction", pendingId, "status", "Finalized");
    assert.fieldEquals("SubjectMembership", alice, "accepted", "false");
    // The member subject is default-ALLOW, so Alice remains CLAIMABLE — she was removed, not banned.
    assert.fieldEquals("SubjectMembership", alice, "claimable", "true");
    assert.fieldEquals("SubjectMembership", alice, "eligibilitySource", "SubjectDefault");
    // Her Executive seat is untouched: a delegate can never reach a sticky officer grant.
    assert.fieldEquals("SubjectMembership", membershipId(execHatId(), ALICE), "isMember", "true");
  });
});

/*
 * POST-CUTOVER OVERLAP — the static Hats dataSource and the authority template write the SAME
 * RoleWearer / User / Hat rows for ADOPTED ids. The legacy tokens are never burned at cutover
 * (rollback depends on it) and the toggle-off is ToggleModule-local, so a direct legacy interaction
 * remains possible forever; the guard in hats.ts must hand those ids over to the authority — and
 * hand them BACK before the bind and after an unbind.
 */
describe("Access v2 — post-cutover overlap with the canonical Hats dataSource", () => {
  test("BEFORE the bind the legacy source still owns the id (seed window: legacy Hats is the truth)", () => {
    runSeedCeremony(); // subjects exist, but no AuthorityBound yet

    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(EXECUTOR),
        Address.fromString(ZERO_ADDRESS),
        Address.fromString(MALLORY),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );
    let wearerId = ORG_ID + "-" + memberHatId().toString() + "-" + MALLORY;
    assert.fieldEquals("RoleWearer", wearerId, "isActive", "true");

    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(MALLORY),
        Address.fromString(MALLORY),
        Address.fromString(ZERO_ADDRESS),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );
    assert.fieldEquals("RoleWearer", wearerId, "isActive", "false");
  });

  test("a post-cutover legacy renounceHat can no longer deactivate an authority-held member", () => {
    runSeedCeremony();
    runCutover(false);

    let aliceWearerId = ORG_ID + "-" + memberHatId().toString() + "-" + ALICE;
    assert.fieldEquals("RoleWearer", aliceWearerId, "isActive", "true");

    // Alice calls Hats.renounceHat(adoptedId) directly — Hats burns the legacy token and emits.
    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(ALICE),
        Address.fromString(ALICE),
        Address.fromString(ZERO_ADDRESS),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );

    // The authority saw nothing, so the two continuous families must not disagree.
    assert.fieldEquals("RoleWearer", aliceWearerId, "isActive", "true");
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), ALICE), "isMember", "true");
  });

  test("a post-cutover legacy MINT creates no phantom wearer for an adopted id", () => {
    runSeedCeremony();
    runCutover(false);

    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(EXECUTOR),
        Address.fromString(ZERO_ADDRESS),
        Address.fromString(MALLORY),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );
    // MALLORY is BANNED on the authority: a legacy mint must not resurrect her as a wearer.
    assert.notInStore("RoleWearer", ORG_ID + "-" + memberHatId().toString() + "-" + MALLORY);
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), MALLORY),
      "isMember",
      "false"
    );
  });

  test("a checkHatStatus poke after the cutover cannot flip Hat.active under the wearers", () => {
    runSeedCeremony();

    // The legacy Hat entity as the EligibilityModule wrote it, linked through HatLookup.
    let hat = new Hat(EXECUTOR + "-" + memberHatId().toString());
    hat.hatId = memberHatId();
    hat.parentHatId = topHatId();
    hat.level = 1;
    hat.eligibilityModule = Address.fromString(EXECUTOR);
    hat.creator = Address.fromString(EXECUTOR);
    hat.defaultEligible = true;
    hat.defaultStanding = true;
    hat.mintedCount = BigInt.fromI32(1);
    hat.active = true;
    hat.createdAt = BigInt.fromI32(1000);
    hat.createdAtBlock = BigInt.fromI32(100);
    hat.transactionHash = Bytes.fromHexString(ZERO_HASH);
    hat.save();
    let lookup = HatLookup.load(memberHatId().toString())!;
    lookup.hat = hat.id;
    lookup.save();

    // Pre-cutover the poke is real news and must land.
    handleHatsStatusChanged(
      createHatStatusChangedEvent(Address.fromString(HATS), memberHatId(), false)
    );
    assert.fieldEquals("Hat", hat.id, "active", "false");
    hat.active = true;
    hat.save();

    runCutover(false);

    // Post-cutover the toggle-off is EXPECTED and permissionlessly pokeable; applying it would make
    // every migrated wearer read as not-wearing under the "AND with Hat.active" convention.
    handleHatsStatusChanged(
      createHatStatusChangedEvent(Address.fromString(HATS), memberHatId(), false)
    );
    assert.fieldEquals("Hat", hat.id, "active", "true");
  });

  test("an UNBIND rollback hands the id back to the legacy source", () => {
    runSeedCeremony();
    runCutover(false);

    handleAuthorityUnbound(
      createAuthorityUnboundEvent(
        Address.fromString(ROUTER),
        orgId(),
        BigInt.fromI32(TOPHAT_DOMAIN),
        authority()
      )
    );

    let aliceWearerId = ORG_ID + "-" + memberHatId().toString() + "-" + ALICE;
    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(ALICE),
        Address.fromString(ALICE),
        Address.fromString(ZERO_ADDRESS),
        memberHatId(),
        BigInt.fromI32(1)
      )
    );
    assert.fieldEquals("RoleWearer", aliceWearerId, "isActive", "false");
  });

  test("a NON-adopted hat of the same org is untouched by the guard", () => {
    runSeedCeremony();
    runCutover(false);

    // A hat that exists in the org's Hats tree but was never seeded as a subject: no Subject row,
    // so the legacy source stays its only writer.
    let strayHatId = topHatId().plus(BigInt.fromI32(2).pow(208).times(BigInt.fromI32(7)));
    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(EXECUTOR),
        Address.fromString(ZERO_ADDRESS),
        Address.fromString(DAVE),
        strayHatId,
        BigInt.fromI32(1)
      )
    );
    // No HatLookup for an unseen hat, so nothing is written at all...
    assert.notInStore("User", ORG_ID + "-" + DAVE);

    // ...but once the org registers it, the legacy path runs normally even on a BOUND org: the
    // guard is per-id (Subject-exists AND bound), never per-domain.
    let lookup = new HatLookup(strayHatId.toString());
    lookup.hatId = strayHatId;
    lookup.organization = orgId();
    lookup.role = ORG_ID + "-" + strayHatId.toString();
    lookup.save();
    handleHatsTransferSingle(
      createHatsTransferSingleEvent(
        Address.fromString(HATS),
        Address.fromString(EXECUTOR),
        Address.fromString(ZERO_ADDRESS),
        Address.fromString(DAVE),
        strayHatId,
        BigInt.fromI32(1)
      )
    );
    assert.fieldEquals("User", ORG_ID + "-" + DAVE, "joinMethod", "HatTransfer");
    assert.fieldEquals("User", ORG_ID + "-" + DAVE, "membershipStatus", "Active");
  });
});
