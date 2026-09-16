// Wave G retires legacy-only orgs in consumers, never by deleting their indexed history.
// Replay activity before and after the real registration/seed/bind sequence against stable ids.
import { assert, describe, test, clearStore, afterEach } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Organization, HybridVotingContract, TaskManager, EligibilityModuleContract, Hat } from "../generated/schema";
import { getOrCreateRole, linkHatToLookup } from "../src/utils";
import { handleHatsTransferSingle } from "../src/hats";
import { handleContractRegistered } from "../src/org-registry";
import { handleAuthorityBound, handleAuthorityUnbound } from "../src/authority-router";
import { handleSubjectCreated, handleSubjectDefaultSet, handleAuthorityTransferSingle, handleAuthorityPausedSet } from "../src/membership-authority";
import { handleNewProposal, handleVoteCast } from "../src/hybrid-voting";
import { handleProjectCreated, handleTaskCreated, handleTaskAssigned, handleTaskCompleted } from "../src/task-manager";
import { handleHatClaimed, handleHatMetadataUpdated } from "../src/eligibility-module";
import { createContractRegisteredEvent } from "./org-registry-utils";
import { createAuthorityBoundEvent, createAuthorityUnboundEvent } from "./authority-router-utils";
import { createTransferSingleEvent as legacyTransfer } from "./hats-utils";
import { createSubjectCreatedEvent, createSubjectDefaultSetEvent, createTransferSingleEvent, createPausedSetEvent } from "./membership-authority-utils";
import { createNewProposalEvent, createVoteCastEvent } from "./hybrid-voting-utils";
import { createProjectCreatedEvent, createTaskCreatedEvent, createTaskAssignedEvent, createTaskCompletedEvent } from "./task-manager-utils";
import { createHatClaimedEvent, createHatMetadataUpdatedEvent } from "./eligibility-module-utils";

const ORG = "0x1111111111111111111111111111111111111111111111111111111111111111";
const RETIRED = "0x2222222222222222222222222222222222222222222222222222222222222222";
const AUTHORITY = "0x00000000000000000000000000000000000000aa";
const EXECUTOR = "0x00000000000000000000000000000000000000bb";
const LEGACY = "0x00000000000000000000000000000000000000cc";
const VOTING = "0x00000000000000000000000000000000000000dd";
const TASKS = "0x00000000000000000000000000000000000000ee";
const ALICE = "0x0000000000000000000000000000000000000011";
const STRANGER = "0x0000000000000000000000000000000000000022";
const ROUTER = "0x0000000000000000000000000000000000000033";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const AUTHORITY_TYPE = "0xdff254c0d9c318c4e70eac95af4c0c9189e13f9d51ae2cfe2c1c446c4775ddb8";

function hatId(): BigInt { return BigInt.fromI32(2).pow(224).plus(BigInt.fromI32(2).pow(208)); }
function roleId(): string { return ORG + "-" + hatId().toString(); }
function userId(): string { return ORG + "-" + ALICE; }
function zeroHash(): Bytes { return Bytes.fromHexString(ZERO_HASH); }

function at(event: ethereum.Event, address: string, timestamp: i32, logIndex: i32 = 1000): void {
  event.address = Address.fromString(address);
  event.block.timestamp = BigInt.fromI32(timestamp);
  event.block.number = BigInt.fromI32(timestamp);
  event.logIndex = BigInt.fromI32(logIndex);
  event.transaction.from = Address.fromString(ALICE);
}

function setupLegacy(): void {
  let org = new Organization(Bytes.fromHexString(ORG));
  org.executorContract = Address.fromString(EXECUTOR);
  org.eligibilityModule = Address.fromString(LEGACY);
  org.topHatId = BigInt.fromI32(2).pow(224);
  org.roleHatIds = [hatId()];
  org.deployedAt = BigInt.fromI32(10);
  org.deployedAtBlock = BigInt.fromI32(10);
  org.save();
  let retired = new Organization(Bytes.fromHexString(RETIRED));
  retired.deployedAt = BigInt.fromI32(10);
  retired.deployedAtBlock = BigInt.fromI32(10);
  retired.save();

  let voting = new HybridVotingContract(Address.fromString(VOTING));
  voting.organization = org.id;
  voting.executor = Address.fromString(EXECUTOR);
  voting.thresholdPct = 50;
  voting.quorum = BigInt.fromI32(1);
  voting.hats = Address.fromString(LEGACY);
  voting.classVersion = BigInt.fromI32(1);
  voting.createdAt = BigInt.fromI32(10);
  voting.createdAtBlock = BigInt.fromI32(10);
  voting.save();
  let tasks = new TaskManager(Address.fromString(TASKS));
  tasks.organization = org.id;
  tasks.creatorHatIds = [hatId()];
  tasks.organizerHatIds = [];
  tasks.createdAt = BigInt.fromI32(10);
  tasks.createdAtBlock = BigInt.fromI32(10);
  tasks.transactionHash = zeroHash();
  tasks.save();
  let legacy = new EligibilityModuleContract(Address.fromString(LEGACY));
  legacy.organization = org.id;
  legacy.superAdmin = Address.fromString(EXECUTOR);
  legacy.hatsContract = Address.fromString(LEGACY);
  legacy.toggleModule = Address.zero();
  legacy.isPaused = false;
  legacy.createdAt = BigInt.fromI32(10);
  legacy.createdAtBlock = BigInt.fromI32(10);
  legacy.save();

  let mint = legacyTransfer(Address.fromString(LEGACY), Address.fromString(EXECUTOR), Address.zero(), Address.fromString(ALICE), hatId(), BigInt.fromI32(1));
  at(mint, LEGACY, 20);
  getOrCreateRole(org.id, hatId(), mint, true, true);
  linkHatToLookup(hatId(), org.id, LEGACY + "-" + hatId().toString());
  handleHatsTransferSingle(mint);

  let hat = new Hat(LEGACY + "-" + hatId().toString());
  hat.hatId = hatId();
  hat.parentHatId = BigInt.fromI32(2).pow(224);
  hat.level = 1;
  hat.eligibilityModule = legacy.id;
  hat.creator = Address.fromString(EXECUTOR);
  hat.defaultEligible = true;
  hat.defaultStanding = true;
  hat.mintedCount = BigInt.fromI32(1);
  hat.active = true;
  hat.createdAt = BigInt.fromI32(10);
  hat.createdAtBlock = BigInt.fromI32(10);
  hat.transactionHash = zeroHash();
  hat.save();
}

function migrate(): void {
  let register = createContractRegisteredEvent(Bytes.fromHexString(RETIRED), Bytes.fromHexString(ORG), Bytes.fromHexString(AUTHORITY_TYPE), Address.fromString(AUTHORITY), Address.fromString(EXECUTOR), true, Address.fromString(EXECUTOR));
  at(register, LEGACY, 100);
  handleContractRegistered(register);
  assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "isRouterBound", "false");
  let subject = createSubjectCreatedEvent(Address.fromString(AUTHORITY), hatId(), 0, "Authority Member", zeroHash(), 0);
  at(subject, AUTHORITY, 101);
  handleSubjectCreated(subject);
  handleSubjectDefaultSet(createSubjectDefaultSetEvent(Address.fromString(AUTHORITY), hatId(), true));
  let mint = createTransferSingleEvent(Address.fromString(AUTHORITY), Address.fromString(EXECUTOR), Address.zero(), Address.fromString(ALICE), hatId(), BigInt.fromI32(1));
  at(mint, AUTHORITY, 102);
  handleAuthorityTransferSingle(mint);
  let bind = createAuthorityBoundEvent(Address.fromString(ROUTER), Bytes.fromHexString(ORG), BigInt.fromI32(1), Address.fromString(AUTHORITY));
  at(bind, ROUTER, 200);
  handleAuthorityBound(bind);
  handleAuthorityPausedSet(createPausedSetEvent(Address.fromString(AUTHORITY), false));
}

function activity(id: i32, timestamp: i32): void {
  let proposal = createNewProposalEvent(BigInt.fromI32(id), Bytes.fromUTF8("Historical proposal"), zeroHash(), 2, timestamp + 100, timestamp);
  at(proposal, VOTING, timestamp);
  handleNewProposal(proposal);
  let vote = createVoteCastEvent(BigInt.fromI32(id), Address.fromString(ALICE), [0], [100], [BigInt.fromI32(1)], timestamp);
  at(vote, VOTING, timestamp);
  handleVoteCast(vote);
  let project = createProjectCreatedEvent(zeroHash(), Bytes.fromUTF8("Historical project"), zeroHash(), BigInt.fromI32(100));
  at(project, TASKS, timestamp);
  if (id == 1) handleProjectCreated(project);
  let task = createTaskCreatedEvent(BigInt.fromI32(id), zeroHash(), BigInt.fromI32(5), Address.zero(), BigInt.fromI32(0), false, Bytes.fromUTF8("Historical task"));
  at(task, TASKS, timestamp);
  handleTaskCreated(task);
  let assigned = createTaskAssignedEvent(BigInt.fromI32(id), Address.fromString(ALICE), Address.fromString(ALICE));
  at(assigned, TASKS, timestamp);
  handleTaskAssigned(assigned);
  let complete = createTaskCompletedEvent(BigInt.fromI32(id), Address.fromString(ALICE));
  at(complete, TASKS, timestamp);
  handleTaskCompleted(complete);
}

function removeAuthorityMember(): void {
  let burn = createTransferSingleEvent(Address.fromString(AUTHORITY), Address.fromString(EXECUTOR), Address.fromString(ALICE), Address.zero(), hatId(), BigInt.fromI32(1));
  at(burn, AUTHORITY, 400, 2000);
  handleAuthorityTransferSingle(burn);
}

afterEach(() => { clearStore(); });

describe("Wave G historical continuity", () => {
  test("V1 proposals, votes, projects, tasks and joined users survive migration and later removal", () => {
    setupLegacy();
    activity(1, 30);
    migrate();
    activity(2, 300);
    removeAuthorityMember();

    assert.entityCount("Organization", 2); // even the retired org is retained; consumers filter it
    let retired = Organization.load(Bytes.fromHexString(RETIRED))!;
    assert.assertTrue(retired.membershipAuthority === null);
    assert.fieldEquals("Organization", ORG, "membershipAuthority", AUTHORITY);
    assert.fieldEquals("Organization", ORG, "deployedAt", "10");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "isRouterBound", "true");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "cutoverAt", "200");
    assert.entityCount("User", 1);
    assert.fieldEquals("User", userId(), "firstSeenAt", "20");
    assert.fieldEquals("User", userId(), "joinMethod", "HatTransfer");
    assert.fieldEquals("User", userId(), "organization", ORG);
    assert.fieldEquals("User", userId(), "membershipStatus", "Inactive");
    assert.fieldEquals("User", userId(), "totalVotes", "2");
    assert.fieldEquals("User", userId(), "totalTasksCompleted", "2");
    assert.entityCount("Project", 1);
    assert.entityCount("Proposal", 2);
    assert.entityCount("Vote", 2);
    assert.entityCount("Task", 2);
    assert.fieldEquals("Proposal", VOTING + "-1", "creatorUser", userId());
    assert.fieldEquals("Proposal", VOTING + "-1", "createdAtBlock", "30");
    assert.fieldEquals("Vote", VOTING + "-1-" + ALICE, "voterUser", userId());
    assert.fieldEquals("Task", TASKS + "-1", "assigneeUser", userId());
    assert.fieldEquals("Task", TASKS + "-1", "completerUser", userId());
    assert.fieldEquals("Task", TASKS + "-1", "status", "Completed");
    assert.fieldEquals("Task", TASKS + "-1", "createdAt", "30");
    assert.fieldEquals("RoleWearer", roleId() + "-" + ALICE, "addedAt", "20");
    assert.fieldEquals("RoleWearer", roleId() + "-" + ALICE, "isActive", "false");
  });

  test("late legacy claims retain event history without reviving authority-removed or unknown users", () => {
    setupLegacy();
    migrate();
    removeAuthorityMember();
    let claim = createHatClaimedEvent(hatId(), Address.fromString(ALICE));
    at(claim, LEGACY, 500, 3000);
    handleHatClaimed(claim);
    let unknownClaim = createHatClaimedEvent(hatId(), Address.fromString(STRANGER));
    at(unknownClaim, LEGACY, 500, 3001);
    handleHatClaimed(unknownClaim);
    assert.entityCount("HatClaimEvent", 2);
    assert.entityCount("User", 1);
    assert.fieldEquals("User", userId(), "currentHatIds", "[]");
    assert.fieldEquals("User", userId(), "membershipStatus", "Inactive");
    assert.fieldEquals("RoleWearer", roleId() + "-" + ALICE, "isActive", "false");
    assert.notInStore("RoleWearer", roleId() + "-" + STRANGER);
    assert.fieldEquals("SubjectMembership", hatId().toString() + "-" + ALICE, "accepted", "false");
  });

  test("legacy metadata remains indexed but cannot replace an authority-owned Role; rollback restores legacy writes", () => {
    setupLegacy();
    let before = createHatMetadataUpdatedEvent(hatId(), "Legacy name", zeroHash());
    at(before, LEGACY, 50, 4000);
    handleHatMetadataUpdated(before);
    assert.fieldEquals("Role", roleId(), "name", "Legacy name");
    migrate();
    let after = createHatMetadataUpdatedEvent(hatId(), "Late legacy name", zeroHash());
    at(after, LEGACY, 500, 4001);
    handleHatMetadataUpdated(after);
    assert.fieldEquals("Role", roleId(), "name", "Authority Member");
    assert.fieldEquals("Hat", LEGACY + "-" + hatId().toString(), "name", "Late legacy name");
    assert.entityCount("HatMetadataUpdateEvent", 2);
    handleAuthorityUnbound(createAuthorityUnboundEvent(Address.fromString(ROUTER), Bytes.fromHexString(ORG), BigInt.fromI32(1), Address.fromString(AUTHORITY)));
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "isRouterBound", "false");
    let rollback = createHatMetadataUpdatedEvent(hatId(), "Rollback name", zeroHash());
    at(rollback, LEGACY, 600, 4002);
    handleHatMetadataUpdated(rollback);
    assert.fieldEquals("Role", roleId(), "name", "Rollback name");
    assert.entityCount("HatMetadataUpdateEvent", 3);
  });
});
