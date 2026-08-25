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
//     legacy toggle-off -> (unported burns) -> CutoverVerifier.verify
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
  handleAuthorityTransferSingle
} from "../src/membership-authority";
import { handleAuthorityBound } from "../src/authority-router";
import { handleContractRegistered } from "../src/org-registry";
import { handleHatsTransferSingle } from "../src/hats";
import { createContractRegisteredEvent } from "./org-registry-utils";
import { createTransferSingleEvent as createHatsTransferSingleEvent } from "./hats-utils";
import {
  resetLogIndex,
  createSubjectCreatedEvent,
  createSubjectDefaultSetEvent,
  createMaxMembersSetEvent,
  createManagerConfigSetEvent,
  createRuleSetEvent,
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
  createTransferSingleEvent
} from "./membership-authority-utils";
import { createAuthorityBoundEvent } from "./authority-router-utils";
import { Organization } from "../generated/schema";

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

/** The atomic cutover batch, in the contract's order. */
function runCutover(includeDelta: boolean, includeUnportedBurn: boolean): void {
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
  // 11. Legacy toggle-off, then burn-shaped events for wearers who were NOT ported, so the
  //     event-driven subgraph carries no permanent ghost.
  if (includeUnportedBurn) {
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
  }
}

afterEach(() => {
  clearStore();
});

describe("Access v2 — the migration ceremony end to end", () => {
  test("the seeded + cutover org resolves to the expected entity graph", () => {
    runSeedCeremony();
    runCutover(true, true);

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

  test("an UNPORTED legacy wearer's RoleWearer ghost is cleared by the cutover burn", () => {
    runSeedCeremony();

    // Mallory wears the legacy hat on chain today (indexed from the canonical Hats dataSource).
    // Toggle-off never burns the legacy token, so without the authority's burn-shaped event the
    // subgraph would carry her as an active wearer forever.
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

    runCutover(false, true);

    assert.fieldEquals("RoleWearer", malloryWearerId, "isActive", "false");
    // ...and the unported burn never touched the accepted counters.
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "3");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "acceptedMembershipCount", "5");
  });

  test("DELTA-SEED — a wearer who drifted in after the snapshot is ported inside the cutover", () => {
    runSeedCeremony();
    // Before the delta, Dave is unknown to the authority.
    assert.notInStore("SubjectMembership", membershipId(memberHatId(), DAVE));

    runCutover(true, false);

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
    runCutover(false, false);

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

    // finalize() after the delay: the delegable member-class grant is cleared, the token burns, and
    // RoleRemoved(delegated) is the only signal that the pending resolved.
    handleRuleSet(
      createRuleSetEvent(authority(), memberHatId(), Address.fromString(ALICE), 0, 0, false)
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
