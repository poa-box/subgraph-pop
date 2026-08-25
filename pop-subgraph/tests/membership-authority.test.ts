import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  beforeEach
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  handleMembershipAuthorityInitialized,
  handleAuthorityPausedSet,
  handleSubjectCreated,
  handleSubjectRenamed,
  handleSubjectDefaultSet,
  handleMaxMembersSet,
  handleGroupCompositionChanged,
  handleManagerConfigSet,
  handleRuleSet,
  handleRuleCleared,
  handleRoleOffered,
  handleOfferWithdrawn,
  handleRoleGranted,
  handleRoleClaimed,
  handleRoleRemoved,
  handleRoleRenounced,
  handleMembershipReconciled,
  handlePendingActionCreated,
  handlePendingActionCancelled,
  handlePendingActionVoided,
  handleVouchConfigured,
  handleVouched,
  handleVouchRevoked,
  handleVouchSeeded,
  handleVoucherSeeded,
  handleVouchEpochReset,
  handleUserVouchesCleared,
  handleMaxDailyVouchesSet,
  handleEmailVerifiedSet,
  handlePermSet,
  handlePermCleared,
  handleConfigLint,
  handleAuthorityTransferSingle
} from "../src/membership-authority";
import { handleContractRegistered } from "../src/org-registry";
import { createContractRegisteredEvent } from "./org-registry-utils";
import {
  resetLogIndex,
  createMembershipAuthorityInitializedEvent,
  createPausedSetEvent,
  createSubjectCreatedEvent,
  createSubjectRenamedEvent,
  createSubjectDefaultSetEvent,
  createMaxMembersSetEvent,
  createGroupCompositionChangedEvent,
  createManagerConfigSetEvent,
  createRuleSetEvent,
  createRuleClearedEvent,
  createRoleOfferedEvent,
  createOfferWithdrawnEvent,
  createRoleGrantedEvent,
  createRoleClaimedEvent,
  createRoleRemovedEvent,
  createRoleRenouncedEvent,
  createMembershipReconciledEvent,
  createPendingActionCreatedEvent,
  createPendingActionCancelledEvent,
  createPendingActionVoidedEvent,
  createVouchConfiguredEvent,
  createVouchedEvent,
  createVouchRevokedEvent,
  createVouchSeededEvent,
  createVoucherSeededEvent,
  createVouchEpochResetEvent,
  createUserVouchesClearedEvent,
  createMaxDailyVouchesSetEvent,
  createEmailVerifiedSetEvent,
  createPermSetEvent,
  createPermClearedEvent,
  createConfigLintEvent,
  createTransferSingleEvent
} from "./membership-authority-utils";
import { Organization, SubjectMembership, Subject, ManagerConfig } from "../generated/schema";

// keccak256("MembershipAuthority") — must mirror ModuleTypes.MEMBERSHIP_AUTHORITY_ID.
const MEMBERSHIP_AUTHORITY_TYPE_ID = "0xdff254c0d9c318c4e70eac95af4c0c9189e13f9d51ae2cfe2c1c446c4775ddb8";

const ORG_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const AUTHORITY = "0x00000000000000000000000000000000000000aa";
const BEACON = "0x00000000000000000000000000000000000000bb";
const EXECUTOR = "0x00000000000000000000000000000000000000e1";
const CONTRACT_ID = "0x2222222222222222222222222222222222222222222222222222222222222222";

const ALICE = "0x0000000000000000000000000000000000000a11";
const BOB = "0x0000000000000000000000000000000000000b0b";
const CAROL = "0x0000000000000000000000000000000000000ca7";
const MANAGER = "0x0000000000000000000000000000000000000d09";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Access v2 perm keys: the fold tag is the TOP BYTE (0x00 bool-any, 0x01 OR-mask).
const DD_VOTE_KEY = "0x00aabbccddeeff00112233445566778899aabbccddeeff001122334455667788";
const TM_PERMS_KEY = "0x01aabbccddeeff00112233445566778899aabbccddeeff001122334455667788";
const PROJECT_CTX = "0x00000000000000000000000000000000000000000000000000000000000000ff";

function authority(): Address {
  return Address.fromString(AUTHORITY);
}

function orgId(): Bytes {
  return Bytes.fromHexString(ORG_ID);
}

function zeroHash(): Bytes {
  return Bytes.fromHexString(ZERO_HASH);
}

/** topHatId for domain 1077 (Hats.sol: `uint256(++lastTopHatId) << 224`). */
function topHatId(): BigInt {
  return BigInt.fromI32(2).pow(224).times(BigInt.fromI32(1077));
}

/** An ADOPTED legacy role hat under that top hat (>= 2^224, so the legacy namespace). */
function memberHatId(): BigInt {
  return topHatId().plus(BigInt.fromI32(2).pow(208));
}

function execHatId(): BigInt {
  return topHatId().plus(BigInt.fromI32(2).pow(208).times(BigInt.fromI32(2)));
}

/** A v2-NATIVE subject id: bits 64..223 hold the authority address, top 32 bits are zero. */
function nativeSubjectId(seq: i32): BigInt {
  return BigInt.fromI32(2).pow(64).plus(BigInt.fromI32(seq));
}

function membershipId(subject: BigInt, user: string): string {
  return subject.toString() + "-" + user;
}

/**
 * Create the Organization and register the authority through the REAL org-registry handler, so the
 * derived-init-config path (executor from the org, paused from the born-paused invariant) is what
 * every test below runs against.
 */
function setupOrgWithAuthority(): void {
  resetLogIndex();
  let org = new Organization(orgId());
  org.executorContract = Bytes.fromHexString(EXECUTOR);
  org.topHatId = topHatId();
  org.roleHatIds = [memberHatId(), execHatId()];
  org.deployedAt = BigInt.fromI32(1000);
  org.deployedAtBlock = BigInt.fromI32(100);
  org.save();

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
}

/** Role subject, deny-by-default, no cap. */
function createRoleSubject(subjectId: BigInt, name: string): void {
  handleSubjectCreated(
    createSubjectCreatedEvent(authority(), subjectId, 0, name, zeroHash(), 0)
  );
}

function createGroupSubject(subjectId: BigInt, name: string): void {
  handleSubjectCreated(
    createSubjectCreatedEvent(authority(), subjectId, 1, name, zeroHash(), 0)
  );
}

function mint(subjectId: BigInt, user: string): void {
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
}

function burn(subjectId: BigInt, user: string): void {
  handleAuthorityTransferSingle(
    createTransferSingleEvent(
      authority(),
      Address.fromString(EXECUTOR),
      Address.fromString(user),
      Address.fromString(ZERO_ADDRESS),
      subjectId,
      BigInt.fromI32(1)
    )
  );
}

function grantRule(subjectId: BigInt, user: string, delegable: boolean): void {
  handleRuleSet(
    createRuleSetEvent(authority(), subjectId, Address.fromString(user), 1, 0, delegable)
  );
}

function banRule(subjectId: BigInt, user: string): void {
  handleRuleSet(
    createRuleSetEvent(authority(), subjectId, Address.fromString(user), 2, 0, false)
  );
}

afterEach(() => {
  clearStore();
});

describe("MembershipAuthority — registration + derived init config", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
  });

  test("ContractRegistered wires the authority and DERIVES the predeploy init config", () => {
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "organization", ORG_ID);
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "executor", EXECUTOR);
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "orgIdHash", ORG_ID);
    // Born paused, and flagged as derived: the predeploy tx's init events are cross-block-earlier
    // than this template, so they can never be indexed.
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "paused", "true");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "initConfigDerived", "true");
    assert.fieldEquals("Organization", ORG_ID, "membershipAuthority", AUTHORITY);
  });

  test("a second ContractRegistered for the same proxy is idempotent", () => {
    handleSubjectCreated(
      createSubjectCreatedEvent(authority(), memberHatId(), 0, "Member", zeroHash(), 0)
    );
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
    // subjectCount survives — the entity was not recreated.
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "subjectCount", "1");
  });

  test("an indexed MembershipAuthorityInitialized overwrites the derived config", () => {
    handleMembershipAuthorityInitialized(
      createMembershipAuthorityInitializedEvent(
        authority(),
        Address.fromString(EXECUTOR),
        orgId(),
        true
      )
    );
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "initConfigDerived", "false");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "paused", "true");
  });

  test("PausedSet(false) records the unpause (the cutover opens user writes)", () => {
    handleAuthorityPausedSet(createPausedSetEvent(authority(), false));
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "paused", "false");
  });

  test("MaxDailyVouchesSet mirrors the global vouch rate limit", () => {
    handleMaxDailyVouchesSet(createMaxDailyVouchesSetEvent(authority(), 7));
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "maxDailyVouches", "7");
  });
});

describe("MembershipAuthority — subjects", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
  });

  test("an ADOPTED legacy role subject keeps its id and links the existing Role + HatLookup", () => {
    createRoleSubject(memberHatId(), "Member");
    let id = memberHatId().toString();
    assert.fieldEquals("Subject", id, "kind", "Role");
    assert.fieldEquals("Subject", id, "name", "Member");
    assert.fieldEquals("Subject", id, "isLegacyAdopted", "true");
    assert.fieldEquals("Subject", id, "defaultAllow", "false");
    // CONTINUITY: the same Role id (orgId-hatId) and the same global HatLookup key the legacy
    // Hats / EligibilityModule sources write.
    assert.fieldEquals("Subject", id, "role", ORG_ID + "-" + id);
    assert.fieldEquals("Role", ORG_ID + "-" + id, "name", "Member");
    assert.fieldEquals("HatLookup", id, "organization", ORG_ID);
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "roleSubjectCount", "1");
  });

  test("a v2-NATIVE subject id is not flagged as legacy-adopted", () => {
    createRoleSubject(nativeSubjectId(1), "Treasurer");
    assert.fieldEquals("Subject", nativeSubjectId(1).toString(), "isLegacyAdopted", "false");
  });

  test("GROUPS ARE NOT TOKENS — a group subject gets no Role mirror", () => {
    createGroupSubject(nativeSubjectId(2), "Executives");
    let id = nativeSubjectId(2).toString();
    assert.fieldEquals("Subject", id, "kind", "Group");
    assert.assertNull(Subject.load(id)!.role);
    assert.notInStore("Role", ORG_ID + "-" + id);
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "groupSubjectCount", "1");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "roleSubjectCount", "0");
  });

  test("SubjectRenamed updates the subject and mirrors onto the continuity Role", () => {
    createRoleSubject(memberHatId(), "Member");
    handleSubjectRenamed(
      createSubjectRenamedEvent(authority(), memberHatId(), "Contributor", zeroHash(), "ipfs://img")
    );
    let id = memberHatId().toString();
    assert.fieldEquals("Subject", id, "name", "Contributor");
    assert.fieldEquals("Subject", id, "imageURI", "ipfs://img");
    assert.fieldEquals("Role", ORG_ID + "-" + id, "name", "Contributor");
    assert.fieldEquals("Role", ORG_ID + "-" + id, "image", "ipfs://img");
  });

  test("MaxMembersSet mirrors the role cap", () => {
    createRoleSubject(memberHatId(), "Member");
    handleMaxMembersSet(createMaxMembersSetEvent(authority(), memberHatId(), 16));
    assert.fieldEquals("Subject", memberHatId().toString(), "maxMembers", "16");
  });

  test("GroupCompositionChanged keeps removed rows with isActive=false", () => {
    createRoleSubject(memberHatId(), "Member");
    createGroupSubject(nativeSubjectId(2), "Executives");
    let compositionId = nativeSubjectId(2).toString() + "-" + memberHatId().toString();

    handleGroupCompositionChanged(
      createGroupCompositionChangedEvent(authority(), nativeSubjectId(2), memberHatId(), true)
    );
    assert.fieldEquals("GroupComposition", compositionId, "isActive", "true");

    handleGroupCompositionChanged(
      createGroupCompositionChangedEvent(authority(), nativeSubjectId(2), memberHatId(), false)
    );
    assert.fieldEquals("GroupComposition", compositionId, "isActive", "false");
  });

  test("ManagerConfigSet decodes the capability bitmask", () => {
    createRoleSubject(memberHatId(), "Member");
    createRoleSubject(execHatId(), "Executive");
    // caps = CAP_GRANT | CAP_REMOVE
    handleManagerConfigSet(
      createManagerConfigSetEvent(authority(), memberHatId(), execHatId(), 3, 172800)
    );
    let id = memberHatId().toString();
    assert.fieldEquals("ManagerConfig", id, "canGrant", "true");
    assert.fieldEquals("ManagerConfig", id, "canRemove", "true");
    assert.fieldEquals("ManagerConfig", id, "enabled", "true");
    assert.fieldEquals("ManagerConfig", id, "delaySecs", "172800");
    assert.fieldEquals("ManagerConfig", id, "managerSubject", execHatId().toString());
    assert.fieldEquals("Subject", id, "managerConfig", id);
  });

  test("ManagerConfigSet with CAP_REMOVE only, then cleared", () => {
    createRoleSubject(memberHatId(), "Member");
    createRoleSubject(execHatId(), "Executive");
    handleManagerConfigSet(
      createManagerConfigSetEvent(authority(), memberHatId(), execHatId(), 2, 0)
    );
    let id = memberHatId().toString();
    assert.fieldEquals("ManagerConfig", id, "canGrant", "false");
    assert.fieldEquals("ManagerConfig", id, "canRemove", "true");

    handleManagerConfigSet(
      createManagerConfigSetEvent(authority(), memberHatId(), BigInt.zero(), 0, 0)
    );
    assert.fieldEquals("ManagerConfig", id, "enabled", "false");
    assert.fieldEquals("ManagerConfig", id, "managerSubjectId", "0");
    // The delegation pointer itself is dropped, so no delegate resolves through it.
    assert.assertNull(ManagerConfig.load(id)!.managerSubject);
  });
});

describe("MembershipAuthority — THE FOLD MIRROR (one test per arm)", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
    createRoleSubject(memberHatId(), "Member");
  });

  test("arm 1 — explicit GRANT makes a non-accepted user CLAIMABLE, not a member", () => {
    grantRule(memberHatId(), ALICE, true);
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "eligible", "true");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "ExplicitGrant");
    assert.fieldEquals("SubjectMembership", id, "accepted", "false");
    assert.fieldEquals("SubjectMembership", id, "isMember", "false");
    assert.fieldEquals("SubjectMembership", id, "claimable", "true");
  });

  test("arm 2 — BAN SUPREMACY over an explicit grant", () => {
    grantRule(memberHatId(), ALICE, true);
    banRule(memberHatId(), ALICE);
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "ExplicitBan");
    assert.fieldEquals("SubjectMembership", id, "claimable", "false");
  });

  test("arm 2 — BAN SUPREMACY over the email attestor", () => {
    handleEmailVerifiedSet(
      createEmailVerifiedSetEvent(authority(), memberHatId(), Address.fromString(ALICE), true)
    );
    banRule(memberHatId(), ALICE);
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "emailVerified", "true");
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "ExplicitBan");
  });

  test("arm 2 — BAN SUPREMACY over a met vouch quorum", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "VouchQuorum");

    banRule(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "vouchMet", "true");
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "ExplicitBan");
  });

  test("arm 2 — BAN SUPREMACY over a default-ALLOW subject", () => {
    handleSubjectDefaultSet(createSubjectDefaultSetEvent(authority(), memberHatId(), true));
    banRule(memberHatId(), ALICE);
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "ExplicitBan");
  });

  test("arm 3 — the EMAIL attestor allows when no explicit rule is present", () => {
    handleEmailVerifiedSet(
      createEmailVerifiedSetEvent(authority(), memberHatId(), Address.fromString(ALICE), true)
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "eligible", "true");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "EmailVerified");
    assert.fieldEquals("EmailVerification", id, "verified", "true");
  });

  test("arm 3 — clearing the email flag drops eligibility back to deny", () => {
    handleEmailVerifiedSet(
      createEmailVerifiedSetEvent(authority(), memberHatId(), Address.fromString(ALICE), true)
    );
    handleEmailVerifiedSet(
      createEmailVerifiedSetEvent(authority(), memberHatId(), Address.fromString(ALICE), false)
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "None");
  });

  test("arm 4 — the VOUCH attestor allows only at/above quorum", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 2, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    let id = membershipId(memberHatId(), ALICE);
    // 1 of 2 — below quorum, so the arm abstains and the deny default stands.
    assert.fieldEquals("SubjectMembership", id, "vouchCount", "1");
    assert.fieldEquals("SubjectMembership", id, "vouchMet", "false");
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");

    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(CAROL)
      )
    );
    assert.fieldEquals("SubjectMembership", id, "vouchCount", "2");
    assert.fieldEquals("SubjectMembership", id, "vouchMet", "true");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "VouchQuorum");
  });

  test("arm 4 — a quorum of 0 means vouching is disabled, never satisfied", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 0, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "vouchCount", "1");
    assert.fieldEquals("SubjectMembership", id, "vouchMet", "false");
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");
  });

  test("arm 5 — the subject DEFAULT is the weakest arm", () => {
    handleSubjectDefaultSet(createSubjectDefaultSetEvent(authority(), memberHatId(), true));
    grantRule(memberHatId(), ALICE, true);
    handleRuleCleared(
      createRuleClearedEvent(authority(), memberHatId(), Address.fromString(ALICE))
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "ruleKind", "None");
    assert.fieldEquals("SubjectMembership", id, "eligible", "true");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "SubjectDefault");
  });

  test("arm 6 — no source at all resolves to None / ineligible", () => {
    handleRoleOffered(
      createRoleOfferedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(EXECUTOR),
        false
      )
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "None");
  });

  test("PRECEDENCE — an explicit GRANT outranks every attestor and the default", () => {
    handleSubjectDefaultSet(createSubjectDefaultSetEvent(authority(), memberHatId(), true));
    handleEmailVerifiedSet(
      createEmailVerifiedSetEvent(authority(), memberHatId(), Address.fromString(ALICE), true)
    );
    grantRule(memberHatId(), ALICE, true);
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), ALICE),
      "eligibilitySource",
      "ExplicitGrant"
    );
  });

  test("PRECEDENCE — email outranks vouch, vouch outranks the default", () => {
    handleSubjectDefaultSet(createSubjectDefaultSetEvent(authority(), memberHatId(), true));
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "VouchQuorum");

    handleEmailVerifiedSet(
      createEmailVerifiedSetEvent(authority(), memberHatId(), Address.fromString(ALICE), true)
    );
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "EmailVerified");
  });

  test("STICKY = governance-authored with delegable=false", () => {
    grantRule(memberHatId(), ALICE, false);
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("AccessRule", id, "author", "Governance");
    assert.fieldEquals("AccessRule", id, "sticky", "true");

    // A delegate-authored grant is never sticky.
    handleRuleSet(
      createRuleSetEvent(authority(), memberHatId(), Address.fromString(BOB), 1, 1, true)
    );
    assert.fieldEquals("AccessRule", membershipId(memberHatId(), BOB), "author", "Delegated");
    assert.fieldEquals("AccessRule", membershipId(memberHatId(), BOB), "sticky", "false");
  });

  test("RuleCleared records clearedAt and drops the row to kind None", () => {
    banRule(memberHatId(), ALICE);
    handleRuleCleared(
      createRuleClearedEvent(authority(), memberHatId(), Address.fromString(ALICE))
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("AccessRule", id, "kind", "None");
    assert.fieldEquals("SubjectMembership", id, "eligible", "false");
  });
});

describe("MembershipAuthority — accepted mirror (TransferSingle)", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
    createRoleSubject(memberHatId(), "Member");
  });

  test("a mint flips accepted and, with an eligibility source, makes a MEMBER", () => {
    grantRule(memberHatId(), ALICE, true);
    mint(memberHatId(), ALICE);
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "accepted", "true");
    assert.fieldEquals("SubjectMembership", id, "isMember", "true");
    assert.fieldEquals("SubjectMembership", id, "claimable", "false");
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "1");
    assert.fieldEquals("Subject", memberHatId().toString(), "activeMemberCount", "1");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "acceptedMembershipCount", "1");
  });

  test("a mint while PAUSED is flagged as a backdated seed (on-chain acceptedAt = 1)", () => {
    grantRule(memberHatId(), ALICE, true);
    mint(memberHatId(), ALICE);
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), ALICE),
      "seededWhilePaused",
      "true"
    );

    handleAuthorityPausedSet(createPausedSetEvent(authority(), false));
    grantRule(memberHatId(), BOB, true);
    mint(memberHatId(), BOB);
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), BOB),
      "seededWhilePaused",
      "false"
    );
  });

  test("a repeated mint never double-counts", () => {
    grantRule(memberHatId(), ALICE, true);
    mint(memberHatId(), ALICE);
    mint(memberHatId(), ALICE);
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "1");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "acceptedMembershipCount", "1");
  });

  test("a burn clears acceptance and both counters", () => {
    grantRule(memberHatId(), ALICE, true);
    mint(memberHatId(), ALICE);
    burn(memberHatId(), ALICE);
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "accepted", "false");
    assert.fieldEquals("SubjectMembership", id, "isMember", "false");
    // The grant survives a plain burn, so the seat stays CLAIMABLE (the §2 reserved-seat state).
    assert.fieldEquals("SubjectMembership", id, "claimable", "true");
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "0");
    assert.fieldEquals("Subject", memberHatId().toString(), "activeMemberCount", "0");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "acceptedMembershipCount", "0");
  });

  test("an UNPORTED burn (emitUnportedBurns) never underflows the counters", () => {
    // The cutover emits a burn-shaped event for a legacy wearer who was never ported. That user has
    // no accepted row here, so nothing may be decremented.
    burn(memberHatId(), CAROL);
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "0");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "acceptedMembershipCount", "0");
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), CAROL),
      "accepted",
      "false"
    );
  });

  test("CONTINUITY — the mint writes the same RoleWearer / User / HatLookup ids as hats.ts", () => {
    grantRule(memberHatId(), ALICE, true);
    mint(memberHatId(), ALICE);
    let roleId = ORG_ID + "-" + memberHatId().toString();
    let roleWearerId = roleId + "-" + ALICE;
    assert.fieldEquals("RoleWearer", roleWearerId, "isActive", "true");
    assert.fieldEquals("RoleWearer", roleWearerId, "role", roleId);
    assert.fieldEquals("User", ORG_ID + "-" + ALICE, "membershipStatus", "Active");
    assert.fieldEquals("HatLookup", memberHatId().toString(), "role", roleId);
  });

  test("CONTINUITY — the burn deactivates that same RoleWearer", () => {
    grantRule(memberHatId(), ALICE, true);
    mint(memberHatId(), ALICE);
    burn(memberHatId(), ALICE);
    let roleWearerId = ORG_ID + "-" + memberHatId().toString() + "-" + ALICE;
    assert.fieldEquals("RoleWearer", roleWearerId, "isActive", "false");
  });

  test("the Executor's admin-subject membership creates no User or RoleWearer", () => {
    createRoleSubject(topHatId(), "Admin");
    grantRule(topHatId(), EXECUTOR, false);
    mint(topHatId(), EXECUTOR);
    // The membership row exists (the org needs it), but the system contract is never a User.
    assert.fieldEquals("SubjectMembership", membershipId(topHatId(), EXECUTOR), "isMember", "true");
    assert.notInStore("User", ORG_ID + "-" + EXECUTOR);
    assert.notInStore("RoleWearer", ORG_ID + "-" + topHatId().toString() + "-" + EXECUTOR);
  });

  test("a ban on an accepted member drops isMember before the burn lands", () => {
    grantRule(memberHatId(), ALICE, true);
    mint(memberHatId(), ALICE);
    // The contract writes the rule, THEN flips the token, THEN emits RoleRemoved.
    banRule(memberHatId(), ALICE);
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "accepted", "true");
    assert.fieldEquals("SubjectMembership", id, "isMember", "false");
    assert.fieldEquals("Subject", memberHatId().toString(), "activeMemberCount", "0");
    // memberCount still mirrors the contract's accepted count until the burn.
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "1");

    burn(memberHatId(), ALICE);
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "0");
  });
});

describe("MembershipAuthority — the §5 event-lag window (config-level refolds)", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
    createRoleSubject(memberHatId(), "Member");
  });

  test("flipping the subject default to DENY re-folds every accepted member immediately", () => {
    handleSubjectDefaultSet(createSubjectDefaultSetEvent(authority(), memberHatId(), true));
    mint(memberHatId(), ALICE);
    mint(memberHatId(), BOB);
    assert.fieldEquals("Subject", memberHatId().toString(), "activeMemberCount", "2");

    handleSubjectDefaultSet(createSubjectDefaultSetEvent(authority(), memberHatId(), false));
    // On chain these two stay accepted until reconcile() runs; the mirror closes the window.
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), ALICE), "isMember", "false");
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), BOB), "isMember", "false");
    assert.fieldEquals("Subject", memberHatId().toString(), "activeMemberCount", "0");
    assert.fieldEquals("Subject", memberHatId().toString(), "memberCount", "2");
  });

  test("a vouch EPOCH RESET (amnesty) strands every tally at once", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    mint(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), ALICE), "isMember", "true");

    handleVouchEpochReset(
      createVouchEpochResetEvent(authority(), memberHatId(), BigInt.fromI32(1))
    );
    assert.fieldEquals("SubjectVouchConfig", memberHatId().toString(), "epoch", "1");
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), ALICE), "vouchMet", "false");
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), ALICE), "isMember", "false");
  });

  test("re-vouching after an epoch reset restarts the tally at the new epoch", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    handleVouchEpochReset(
      createVouchEpochResetEvent(authority(), memberHatId(), BigInt.fromI32(1))
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(CAROL)
      )
    );
    let id = membershipId(memberHatId(), ALICE);
    // Not 2: the stale pre-reset tally is discarded, exactly as vouch() does on chain.
    assert.fieldEquals("SubjectMembership", id, "vouchCount", "1");
    assert.fieldEquals("SubjectMembership", id, "vouchEpoch", "1");
    assert.fieldEquals("SubjectMembership", id, "vouchMet", "true");
  });

  test("raising the quorum drops members who no longer reach it", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    mint(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), ALICE), "isMember", "true");

    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 3, execHatId())
    );
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), ALICE), "isMember", "false");
  });

  test("revoking a vouch below quorum drops the member", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    mint(memberHatId(), ALICE);
    handleVouchRevoked(
      createVouchRevokedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "vouchCount", "0");
    assert.fieldEquals("SubjectMembership", id, "isMember", "false");
    assert.fieldEquals(
      "SubjectVouchRecord",
      memberHatId().toString() + "-" + ALICE + "-" + BOB,
      "active",
      "false"
    );
  });

  test("UserVouchesCleared parks the wearer's epoch at the uint64 sentinel", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId())
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    mint(memberHatId(), ALICE);
    handleUserVouchesCleared(
      createUserVouchesClearedEvent(authority(), memberHatId(), Address.fromString(ALICE))
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "vouchCount", "0");
    assert.fieldEquals("SubjectMembership", id, "vouchEpoch", "18446744073709551615");
    assert.fieldEquals("SubjectMembership", id, "isMember", "false");
  });

  test("a vouch revoke can never underflow the mirrored count", () => {
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 1, execHatId())
    );
    handleVouchRevoked(
      createVouchRevokedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    assert.fieldEquals("SubjectMembership", membershipId(memberHatId(), ALICE), "vouchCount", "0");
  });
});

describe("MembershipAuthority — records-first vouch seeding", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
    createRoleSubject(memberHatId(), "Member");
    handleVouchConfigured(
      createVouchConfiguredEvent(authority(), memberHatId(), 2, execHatId())
    );
  });

  test("VoucherSeeded writes per-voucher records and VouchSeeded assigns the final count", () => {
    handleVoucherSeeded(
      createVoucherSeededEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    handleVoucherSeeded(
      createVoucherSeededEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(CAROL)
      )
    );
    handleVouchSeeded(
      createVouchSeededEvent(authority(), memberHatId(), Address.fromString(ALICE), 2)
    );

    assert.fieldEquals(
      "SubjectVouchRecord",
      memberHatId().toString() + "-" + ALICE + "-" + BOB,
      "seeded",
      "true"
    );
    assert.fieldEquals(
      "SubjectVouchRecord",
      memberHatId().toString() + "-" + ALICE + "-" + CAROL,
      "active",
      "true"
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "vouchCount", "2");
    assert.fieldEquals("SubjectMembership", id, "vouchMet", "true");
    assert.fieldEquals("SubjectMembership", id, "eligibilitySource", "VouchQuorum");
  });

  test("a seeded record that is later revoked decrements below quorum (revokable, not a ghost)", () => {
    handleVoucherSeeded(
      createVoucherSeededEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    handleVouchSeeded(
      createVouchSeededEvent(authority(), memberHatId(), Address.fromString(ALICE), 2)
    );
    handleVouchRevoked(
      createVouchRevokedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    let id = membershipId(memberHatId(), ALICE);
    assert.fieldEquals("SubjectMembership", id, "vouchCount", "1");
    assert.fieldEquals("SubjectMembership", id, "vouchMet", "false");
  });

  test("a live vouch on top of a seeded record keeps one row and flips seeded off", () => {
    handleVoucherSeeded(
      createVoucherSeededEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    handleVouched(
      createVouchedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(BOB)
      )
    );
    assert.fieldEquals(
      "SubjectVouchRecord",
      memberHatId().toString() + "-" + ALICE + "-" + BOB,
      "seeded",
      "false"
    );
    assert.entityCount("SubjectVouchRecord", 1);
  });
});

describe("MembershipAuthority — the lifecycle feed (seven disjoint verbs)", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
    createRoleSubject(memberHatId(), "Member");
  });

  test("RoleOffered records the offer with actor + delegation provenance", () => {
    handleRoleOffered(
      createRoleOfferedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(MANAGER),
        true
      )
    );
    assert.entityCount("SubjectMembershipEvent", 1);
    let rows = SubjectMembership.load(membershipId(memberHatId(), ALICE));
    assert.assertNotNull(rows);
  });

  test("each verb renders VERBATIM — Offered / OfferWithdrawn / Granted / Claimed", () => {
    handleRoleOffered(
      createRoleOfferedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(EXECUTOR),
        false
      )
    );
    handleOfferWithdrawn(
      createOfferWithdrawnEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(EXECUTOR)
      )
    );
    handleRoleGranted(
      createRoleGrantedEvent(
        authority(),
        memberHatId(),
        Address.fromString(BOB),
        Address.fromString(EXECUTOR),
        false
      )
    );
    handleRoleClaimed(
      createRoleClaimedEvent(authority(), memberHatId(), Address.fromString(CAROL))
    );
    assert.entityCount("SubjectMembershipEvent", 4);
  });

  test("RoleRemoved carries the banned flag; RoleRenounced and Reconciled do not", () => {
    handleRoleRemoved(
      createRoleRemovedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        true,
        Address.fromString(EXECUTOR),
        false
      )
    );
    handleRoleRenounced(
      createRoleRenouncedEvent(authority(), memberHatId(), Address.fromString(BOB))
    );
    handleMembershipReconciled(
      createMembershipReconciledEvent(authority(), memberHatId(), Address.fromString(CAROL))
    );
    assert.entityCount("SubjectMembershipEvent", 3);
  });
});

describe("MembershipAuthority — pending actions (the review window)", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
    createRoleSubject(memberHatId(), "Member");
  });

  test("PendingActionCreated opens the window and points the membership at it", () => {
    handlePendingActionCreated(
      createPendingActionCreatedEvent(
        authority(),
        BigInt.fromI32(1),
        memberHatId(),
        Address.fromString(ALICE),
        0,
        Address.fromString(MANAGER),
        BigInt.fromI32(2000)
      )
    );
    let pendingId = AUTHORITY + "-1";
    assert.fieldEquals("PendingAction", pendingId, "status", "Pending");
    assert.fieldEquals("PendingAction", pendingId, "action", "Grant");
    assert.fieldEquals("PendingAction", pendingId, "activatesAt", "2000");
    assert.fieldEquals("PendingAction", pendingId, "actor", MANAGER);
    assert.fieldEquals(
      "SubjectMembership",
      membershipId(memberHatId(), ALICE),
      "pendingAction",
      pendingId
    );
  });

  test("PendingActionCancelled closes it and records who cancelled", () => {
    handlePendingActionCreated(
      createPendingActionCreatedEvent(
        authority(),
        BigInt.fromI32(1),
        memberHatId(),
        Address.fromString(ALICE),
        2,
        Address.fromString(MANAGER),
        BigInt.fromI32(2000)
      )
    );
    handlePendingActionCancelled(
      createPendingActionCancelledEvent(authority(), BigInt.fromI32(1), Address.fromString(EXECUTOR))
    );
    assert.fieldEquals("PendingAction", AUTHORITY + "-1", "status", "Cancelled");
    assert.fieldEquals("PendingAction", AUTHORITY + "-1", "cancelledBy", EXECUTOR);
    assert.assertNull(
      SubjectMembership.load(membershipId(memberHatId(), ALICE))!.pendingAction
    );
  });

  test("PendingActionVoided marks a governance-superseded action", () => {
    handlePendingActionCreated(
      createPendingActionCreatedEvent(
        authority(),
        BigInt.fromI32(2),
        memberHatId(),
        Address.fromString(ALICE),
        2,
        Address.fromString(MANAGER),
        BigInt.fromI32(2000)
      )
    );
    handlePendingActionVoided(createPendingActionVoidedEvent(authority(), BigInt.fromI32(2)));
    assert.fieldEquals("PendingAction", AUTHORITY + "-2", "status", "Voided");
  });

  test("FINALIZE is DERIVED — a delegated RoleGranted closes the pending", () => {
    // finalize() emits no PendingAction event; the lifecycle event it produces is the only signal.
    handlePendingActionCreated(
      createPendingActionCreatedEvent(
        authority(),
        BigInt.fromI32(3),
        memberHatId(),
        Address.fromString(ALICE),
        0,
        Address.fromString(MANAGER),
        BigInt.fromI32(2000)
      )
    );
    grantRule(memberHatId(), ALICE, true);
    mint(memberHatId(), ALICE);
    handleRoleGranted(
      createRoleGrantedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        Address.fromString(MANAGER),
        true
      )
    );
    assert.fieldEquals("PendingAction", AUTHORITY + "-3", "status", "Finalized");
    assert.assertNull(
      SubjectMembership.load(membershipId(memberHatId(), ALICE))!.pendingAction
    );
  });

  test("an OFFER pending is finalized by the target's own claim", () => {
    handlePendingActionCreated(
      createPendingActionCreatedEvent(
        authority(),
        BigInt.fromI32(4),
        memberHatId(),
        Address.fromString(ALICE),
        1,
        Address.fromString(MANAGER),
        BigInt.fromI32(2000)
      )
    );
    assert.fieldEquals("PendingAction", AUTHORITY + "-4", "action", "Offer");
    handleRoleClaimed(
      createRoleClaimedEvent(authority(), memberHatId(), Address.fromString(ALICE))
    );
    assert.fieldEquals("PendingAction", AUTHORITY + "-4", "status", "Finalized");
  });

  test("a delegated REMOVE finalizes through RoleRemoved", () => {
    handlePendingActionCreated(
      createPendingActionCreatedEvent(
        authority(),
        BigInt.fromI32(5),
        memberHatId(),
        Address.fromString(ALICE),
        2,
        Address.fromString(MANAGER),
        BigInt.fromI32(2000)
      )
    );
    handleRoleRemoved(
      createRoleRemovedEvent(
        authority(),
        memberHatId(),
        Address.fromString(ALICE),
        false,
        Address.fromString(MANAGER),
        true
      )
    );
    assert.fieldEquals("PendingAction", AUTHORITY + "-5", "status", "Finalized");
  });
});

describe("MembershipAuthority — permission table + lints", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
    createRoleSubject(memberHatId(), "Member");
  });

  test("PermSet decodes the EXISTS / INHERIT_GLOBAL / VALUE packing and the fold tag", () => {
    // word = EXISTS_BIT | INHERIT_GLOBAL_BIT | 5
    let word = BigInt.fromI32(2)
      .pow(255)
      .plus(BigInt.fromI32(2).pow(254))
      .plus(BigInt.fromI32(5));
    handlePermSet(
      createPermSetEvent(
        authority(),
        memberHatId(),
        Bytes.fromHexString(TM_PERMS_KEY),
        Bytes.fromHexString(PROJECT_CTX),
        word
      )
    );
    let id = memberHatId().toString() + "-" + TM_PERMS_KEY + "-" + PROJECT_CTX;
    assert.fieldEquals("PermRow", id, "exists", "true");
    assert.fieldEquals("PermRow", id, "inheritGlobal", "true");
    assert.fieldEquals("PermRow", id, "value", "5");
    assert.fieldEquals("PermRow", id, "foldTag", "1"); // OR-mask
    assert.fieldEquals("PermRow", id, "isGlobalCtx", "false");
  });

  test("a GLOBAL-ctx bool-any key is tagged 0 and flagged global", () => {
    let word = BigInt.fromI32(2).pow(255).plus(BigInt.fromI32(1));
    handlePermSet(
      createPermSetEvent(
        authority(),
        memberHatId(),
        Bytes.fromHexString(DD_VOTE_KEY),
        Bytes.fromHexString(ZERO_HASH),
        word
      )
    );
    let id = memberHatId().toString() + "-" + DD_VOTE_KEY + "-" + ZERO_HASH;
    assert.fieldEquals("PermRow", id, "foldTag", "0");
    assert.fieldEquals("PermRow", id, "isGlobalCtx", "true");
    assert.fieldEquals("PermRow", id, "inheritGlobal", "false");
  });

  test("PermCleared zeroes the row and stamps clearedAt", () => {
    let word = BigInt.fromI32(2).pow(255).plus(BigInt.fromI32(1));
    handlePermSet(
      createPermSetEvent(
        authority(),
        memberHatId(),
        Bytes.fromHexString(DD_VOTE_KEY),
        Bytes.fromHexString(ZERO_HASH),
        word
      )
    );
    handlePermCleared(
      createPermClearedEvent(
        authority(),
        memberHatId(),
        Bytes.fromHexString(DD_VOTE_KEY),
        Bytes.fromHexString(ZERO_HASH)
      )
    );
    let id = memberHatId().toString() + "-" + DD_VOTE_KEY + "-" + ZERO_HASH;
    assert.fieldEquals("PermRow", id, "exists", "false");
    assert.fieldEquals("PermRow", id, "word", "0");
  });

  test("PermCleared on an unknown row is a no-op (the contract still emits it)", () => {
    handlePermCleared(
      createPermClearedEvent(
        authority(),
        memberHatId(),
        Bytes.fromHexString(DD_VOTE_KEY),
        Bytes.fromHexString(ZERO_HASH)
      )
    );
    assert.entityCount("PermRow", 0);
  });

  test("ConfigLint maps every known code and degrades unknown ones to Unknown", () => {
    handleConfigLint(createConfigLintEvent(authority(), memberHatId(), 1));
    handleConfigLint(createConfigLintEvent(authority(), memberHatId(), 5));
    handleConfigLint(createConfigLintEvent(authority(), memberHatId(), 99));
    assert.entityCount("ConfigLintEvent", 3);
  });
});
