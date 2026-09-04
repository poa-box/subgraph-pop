import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  handleCallerSet,
  handleBatchExecuted,
  handleCallExecuted,
  handleSwept,
  handleHatsSet,
  handleHatsRepointed,
  handleHatMinterAuthorized,
  handleHatsMinted,
  handlePaused,
  handleUnpaused,
  handleOwnershipTransferred,
  handleCallerChangeProposed,
  handleCallerChangeCancelled
} from "../src/executor";
import {
  createCallerSetEvent,
  createBatchExecutedEvent,
  createCallExecutedEvent,
  createSweptEvent,
  createHatsSetEvent,
  createHatsRepointedEvent,
  createHatMinterAuthorizedEvent,
  createHatsMintedEvent,
  createPausedEvent,
  createUnpausedEvent,
  createOwnershipTransferredEvent,
  createCallerChangeProposedEvent,
  createCallerChangeCancelledEvent
} from "./executor-utils";
import {
  Organization,
  ExecutorContract,
  HybridVotingContract,
  DirectDemocracyVotingContract,
  EligibilityModuleContract,
  ParticipationTokenContract,
  QuickJoinContract,
  EducationHubContract,
  PaymentManagerContract,
  TaskManager,
  ToggleModuleContract,
  Proposal,
  DDVProposal,
  BatchExecution
} from "../generated/schema";

/**
 * Helper function to create necessary entities for executor tests.
 * Creates an Organization and ExecutorContract entity.
 */
function setupExecutorEntities(): void {
  // Create Organization entity
  let orgId = Bytes.fromHexString(
    "0x1111111111111111111111111111111111111111111111111111111111111111"
  );
  let organization = new Organization(orgId);
  organization.topHatId = BigInt.fromI32(1000);
  organization.roleHatIds = [BigInt.fromI32(1001), BigInt.fromI32(1002)];
  organization.deployedAt = BigInt.fromI32(1000);
  organization.deployedAtBlock = BigInt.fromI32(100);
  organization.transactionHash = Bytes.fromHexString("0xabcd");

  // Create ExecutorContract entity with the default mock event address
  let executorAddress = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
  let executor = new ExecutorContract(executorAddress);
  executor.organization = orgId;
  executor.owner = Address.zero();
  executor.allowedCaller = null;
  executor.hatsContract = Address.zero();
  executor.isPaused = false;
  executor.createdAt = BigInt.fromI32(1000);
  executor.createdAtBlock = BigInt.fromI32(100);

  // Create ToggleModuleContract entity
  let toggleModuleAddress = Address.fromString("0x000000000000000000000000000000000000000a");
  let toggleModule = new ToggleModuleContract(toggleModuleAddress);
  toggleModule.organization = orgId;
  toggleModule.admin = Address.zero();
  toggleModule.createdAt = BigInt.fromI32(1000);
  toggleModule.createdAtBlock = BigInt.fromI32(100);

  // Create TaskManager entity
  let taskManagerAddress = Address.fromString("0x0000000000000000000000000000000000000006");
  let taskManager = new TaskManager(taskManagerAddress);
  taskManager.organization = orgId;
  taskManager.creatorHatIds = [BigInt.fromI32(1002)]; // Non-member roles that can create projects
  taskManager.organizerHatIds = []; // populated by OrganizerHatAllowed events (v4)
  taskManager.createdAt = BigInt.fromI32(1000);
  taskManager.createdAtBlock = BigInt.fromI32(100);
  taskManager.transactionHash = Bytes.fromHexString("0xabcd");

  // Create HybridVotingContract entity
  let hybridVotingAddress = Address.fromString("0x0000000000000000000000000000000000000002");
  let hybridVoting = new HybridVotingContract(hybridVotingAddress);
  hybridVoting.organization = orgId;
  hybridVoting.executor = Address.zero();
  hybridVoting.thresholdPct = 0;
  hybridVoting.quorum = BigInt.fromI32(0);
  hybridVoting.hats = Address.zero();
  hybridVoting.classVersion = BigInt.fromI32(0);
  hybridVoting.createdAt = BigInt.fromI32(1000);
  hybridVoting.createdAtBlock = BigInt.fromI32(100);

  // Create DirectDemocracyVotingContract entity
  let ddvAddress = Address.fromString("0x0000000000000000000000000000000000000003");
  let ddv = new DirectDemocracyVotingContract(ddvAddress);
  ddv.organization = orgId;
  ddv.executor = Address.zero();
  ddv.thresholdPct = 0;
  ddv.quorum = BigInt.fromI32(0);
  ddv.hats = Address.zero();
  ddv.createdAt = BigInt.fromI32(1000);
  ddv.createdAtBlock = BigInt.fromI32(100);

  // Create EligibilityModuleContract entity
  let eligibilityModuleAddress = Address.fromString("0x0000000000000000000000000000000000000009");
  let eligibilityModule = new EligibilityModuleContract(eligibilityModuleAddress);
  eligibilityModule.organization = orgId;
  eligibilityModule.superAdmin = Address.zero();
  eligibilityModule.hatsContract = Address.zero();
  eligibilityModule.toggleModule = toggleModuleAddress;
  eligibilityModule.isPaused = false;
  eligibilityModule.createdAt = BigInt.fromI32(1000);
  eligibilityModule.createdAtBlock = BigInt.fromI32(100);

  // Create ParticipationTokenContract entity
  let participationTokenAddress = Address.fromString("0x0000000000000000000000000000000000000005");
  let participationToken = new ParticipationTokenContract(participationTokenAddress);
  participationToken.organization = orgId;
  participationToken.name = "Test Token";
  participationToken.symbol = "TEST";
  participationToken.totalSupply = BigInt.fromI32(0);
  participationToken.executor = Address.zero();
  participationToken.hatsContract = Address.zero();
  participationToken.createdAt = BigInt.fromI32(1000);
  participationToken.createdAtBlock = BigInt.fromI32(100);

  // Create QuickJoinContract entity
  let quickJoinAddress = Address.fromString("0x0000000000000000000000000000000000000004");
  let quickJoin = new QuickJoinContract(quickJoinAddress);
  quickJoin.organization = orgId;
  quickJoin.executor = Address.zero();
  quickJoin.hatsContract = Address.zero();
  quickJoin.accountRegistry = Address.zero();
  quickJoin.masterDeployAddress = Address.zero();
  quickJoin.memberHatIds = [];
  quickJoin.createdAt = BigInt.fromI32(1000);
  quickJoin.createdAtBlock = BigInt.fromI32(100);

  // Create EducationHubContract entity
  let educationHubAddress = Address.fromString("0x0000000000000000000000000000000000000007");
  let educationHub = new EducationHubContract(educationHubAddress);
  educationHub.organization = orgId;
  educationHub.token = Address.zero();
  educationHub.hatsContract = Address.zero();
  educationHub.executor = Address.zero();
  educationHub.isPaused = false;
  educationHub.nextModuleId = BigInt.fromI32(0);
  educationHub.createdAt = BigInt.fromI32(1000);
  educationHub.createdAtBlock = BigInt.fromI32(100);

  // Create PaymentManagerContract entity
  let paymentManagerAddress = Address.fromString("0x0000000000000000000000000000000000000008");
  let paymentManager = new PaymentManagerContract(paymentManagerAddress);
  paymentManager.organization = orgId;
  paymentManager.owner = Address.zero();
  paymentManager.revenueShareToken = Address.zero();
  paymentManager.distributionCounter = BigInt.fromI32(0);
  paymentManager.createdAt = BigInt.fromI32(1000);
  paymentManager.createdAtBlock = BigInt.fromI32(100);

  // Set the relationships
  organization.executorContract = executorAddress;
  organization.toggleModuleContract = toggleModuleAddress;
  organization.taskManager = taskManagerAddress;
  organization.hybridVoting = hybridVotingAddress;
  organization.directDemocracyVoting = ddvAddress;
  organization.eligibilityModule = eligibilityModuleAddress;
  organization.participationToken = participationTokenAddress;
  organization.quickJoin = quickJoinAddress;
  organization.educationHub = educationHubAddress;
  organization.paymentManager = paymentManagerAddress;

  // Save entities
  executor.save();
  toggleModule.save();
  taskManager.save();
  hybridVoting.save();
  ddv.save();
  eligibilityModule.save();
  participationToken.save();
  quickJoin.save();
  educationHub.save();
  paymentManager.save();
  organization.save();
}

describe("Executor", () => {
  afterEach(() => {
    clearStore();
  });

  test("CallerSet creates CallerChange and updates ExecutorContract", () => {
    setupExecutorEntities();

    let caller = Address.fromString("0x0000000000000000000000000000000000000001");
    let event = createCallerSetEvent(caller);
    handleCallerSet(event);

    // Verify CallerChange entity was created
    assert.entityCount("CallerChange", 1);

    // Verify ExecutorContract was updated
    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "allowedCaller",
      "0x0000000000000000000000000000000000000001"
    );
  });

  test("CallerChangeProposed sets pendingCaller and effectiveAt on ExecutorContract", () => {
    setupExecutorEntities();

    let newCaller = Address.fromString("0x0000000000000000000000000000000000000055");
    let effectiveAt = BigInt.fromI32(2000);
    let event = createCallerChangeProposedEvent(newCaller, effectiveAt);
    handleCallerChangeProposed(event);

    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "pendingCaller",
      "0x0000000000000000000000000000000000000055"
    );
    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "callerChangeEffectiveAt",
      "2000"
    );
  });

  test("CallerChangeCancelled clears pendingCaller and effectiveAt", () => {
    setupExecutorEntities();

    // First propose a change
    let newCaller = Address.fromString("0x0000000000000000000000000000000000000055");
    let effectiveAt = BigInt.fromI32(2000);
    let proposeEvent = createCallerChangeProposedEvent(newCaller, effectiveAt);
    handleCallerChangeProposed(proposeEvent);

    // Then cancel it
    let cancelEvent = createCallerChangeCancelledEvent();
    cancelEvent.logIndex = BigInt.fromI32(2);
    handleCallerChangeCancelled(cancelEvent);

    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "pendingCaller",
      "null"
    );
    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "callerChangeEffectiveAt",
      "null"
    );
  });

  test("CallerSet clears pending caller change state", () => {
    setupExecutorEntities();

    // First propose a change
    let newCaller = Address.fromString("0x0000000000000000000000000000000000000055");
    let effectiveAt = BigInt.fromI32(2000);
    let proposeEvent = createCallerChangeProposedEvent(newCaller, effectiveAt);
    handleCallerChangeProposed(proposeEvent);

    // Then set the caller (completing the change)
    let setEvent = createCallerSetEvent(newCaller);
    setEvent.logIndex = BigInt.fromI32(2);
    handleCallerSet(setEvent);

    // pendingCaller should be cleared
    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "pendingCaller",
      "null"
    );
    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "callerChangeEffectiveAt",
      "null"
    );
    // But allowedCaller should be set
    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "allowedCaller",
      "0x0000000000000000000000000000000000000055"
    );
  });

  test("BatchExecuted creates BatchExecution entity", () => {
    setupExecutorEntities();

    let proposalId = BigInt.fromI32(1);
    let calls = BigInt.fromI32(3);
    let event = createBatchExecutedEvent(proposalId, calls);
    handleBatchExecuted(event);

    assert.entityCount("BatchExecution", 1);
  });

  // HybridVoting and DirectDemocracyVoting keep INDEPENDENT proposal counters, so both routinely
  // have a proposal with the same id. Executor.execute() reverts unless msg.sender ==
  // allowedCaller, so allowedCaller is what disambiguates them — matching on proposalId alone
  // attached every execution to both proposals.
  test("BatchExecuted attributes the proposal via allowedCaller, not proposalId alone", () => {
    setupExecutorEntities();

    let orgId = Bytes.fromHexString(
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );
    let hvAddress = Address.fromString("0x00000000000000000000000000000000000000b1");
    let ddvAddress = Address.fromString("0x00000000000000000000000000000000000000b2");
    let proposalId = BigInt.fromI32(0);

    // Both voting contracts exist on the org, and BOTH have a proposal 0.
    let org = Organization.load(orgId)!;
    org.hybridVoting = hvAddress;
    org.directDemocracyVoting = ddvAddress;
    org.save();

    let hvProposal = new Proposal(hvAddress.toHexString() + "-0");
    hvProposal.proposalId = proposalId;
    hvProposal.hybridVoting = hvAddress;
    hvProposal.creator = Address.zero();
    hvProposal.proposer = Address.zero();
    hvProposal.classesVersion = BigInt.fromI32(0);
    hvProposal.title = "hv";
    hvProposal.descriptionHash = Bytes.fromHexString("0xabcd");
    hvProposal.numOptions = 2;
    hvProposal.startTimestamp = BigInt.fromI32(1000);
    hvProposal.endTimestamp = BigInt.fromI32(2000);
    hvProposal.isHatRestricted = false;
    hvProposal.restrictedHatIds = [];
    hvProposal.status = "Active";
    hvProposal.wasExecuted = false;
    hvProposal.executionFailed = false;
    hvProposal.createdAtBlock = BigInt.fromI32(100);
    hvProposal.transactionHash = Bytes.fromHexString("0xabcd");
    hvProposal.save();

    let ddvProposal = new DDVProposal(ddvAddress.toHexString() + "-0");
    ddvProposal.proposalId = proposalId;
    ddvProposal.directDemocracyVoting = ddvAddress;
    ddvProposal.proposer = Address.zero();
    ddvProposal.title = "ddv";
    ddvProposal.descriptionHash = Bytes.fromHexString("0xabcd");
    ddvProposal.numOptions = 2;
    ddvProposal.startTimestamp = BigInt.fromI32(1000);
    ddvProposal.endTimestamp = BigInt.fromI32(2000);
    ddvProposal.isHatRestricted = false;
    ddvProposal.restrictedHatIds = [];
    ddvProposal.status = "Active";
    ddvProposal.executionFailed = false;
    ddvProposal.createdAtBlock = BigInt.fromI32(100);
    ddvProposal.transactionHash = Bytes.fromHexString("0xabcd");
    ddvProposal.save();

    // The executor's sole authorised governor is HybridVoting.
    let executor = ExecutorContract.load(
      Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a")
    )!;
    executor.allowedCaller = hvAddress;
    executor.save();

    let batchEvent = createBatchExecutedEvent(proposalId, BigInt.fromI32(1));
    handleBatchExecuted(batchEvent);

    let batchId = batchEvent.transaction.hash
      .concat(batchEvent.address)
      .concat(Bytes.fromByteArray(Bytes.fromBigInt(proposalId)));

    // Only the HybridVoting proposal is attached — NOT both.
    assert.fieldEquals(
      "BatchExecution",
      batchId.toHexString(),
      "hybridProposal",
      hvAddress.toHexString() + "-0"
    );
    let stored = BatchExecution.load(batchId)!;
    assert.assertTrue(stored.ddvProposal === null);
  });

  // The whole point of keying BatchExecution on (txHash, executor, proposalId) is that
  // handleCallExecuted can derive the SAME id — the old code guessed logIndex+1, which only ever
  // resolved for the final call of a batch. Without this assertion a swapped argument order or an
  // encoding change would leave BatchExecution.calls empty in production and every count-based
  // test would still pass.
  test("CallExecuted links to the BatchExecution for the same proposal", () => {
    setupExecutorEntities();

    let proposalId = BigInt.fromI32(7);

    // Two calls, then the trailing batch — the real emission order.
    let call0 = createCallExecutedEvent(
      proposalId,
      BigInt.fromI32(0),
      Address.fromString("0x0000000000000000000000000000000000000002"),
      BigInt.fromI32(1000)
    );
    handleCallExecuted(call0);

    let call1 = createCallExecutedEvent(
      proposalId,
      BigInt.fromI32(1),
      Address.fromString("0x0000000000000000000000000000000000000003"),
      BigInt.zero()
    );
    handleCallExecuted(call1);

    let batchEvent = createBatchExecutedEvent(proposalId, BigInt.fromI32(2));
    handleBatchExecuted(batchEvent);

    assert.entityCount("BatchExecution", 1);
    assert.entityCount("CallExecution", 2);

    // Both calls must point at the one batch, not just the last one.
    let batchId = batchEvent.transaction.hash
      .concat(batchEvent.address)
      .concat(Bytes.fromByteArray(Bytes.fromBigInt(proposalId)));

    let call0Id = call0.transaction.hash
      .concatI32(call0.logIndex.toI32())
      .concat(Bytes.fromByteArray(Bytes.fromBigInt(BigInt.fromI32(0))));
    let call1Id = call1.transaction.hash
      .concatI32(call1.logIndex.toI32())
      .concat(Bytes.fromByteArray(Bytes.fromBigInt(BigInt.fromI32(1))));

    assert.fieldEquals("CallExecution", call0Id.toHexString(), "batch", batchId.toHexString());
    assert.fieldEquals("CallExecution", call1Id.toHexString(), "batch", batchId.toHexString());
  });

  test("CallExecuted creates CallExecution entity", () => {
    setupExecutorEntities();

    let proposalId = BigInt.fromI32(1);
    let index = BigInt.fromI32(0);
    let target = Address.fromString("0x0000000000000000000000000000000000000002");
    let value = BigInt.fromI32(1000);
    let event = createCallExecutedEvent(proposalId, index, target, value);
    handleCallExecuted(event);

    assert.entityCount("CallExecution", 1);
  });

  test("Swept creates ExecutorSweep entity", () => {
    setupExecutorEntities();

    let to = Address.fromString("0x0000000000000000000000000000000000000001");
    let amount = BigInt.fromI32(1000000);
    let event = createSweptEvent(to, amount);
    handleSwept(event);

    assert.entityCount("ExecutorSweep", 1);
  });

  test("HatsSet updates ExecutorContract hatsContract", () => {
    setupExecutorEntities();

    let hats = Address.fromString("0x0000000000000000000000000000000000000099");
    let event = createHatsSetEvent(hats);
    handleHatsSet(event);

    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "hatsContract",
      "0x0000000000000000000000000000000000000099"
    );
  });

  test("HatsRepointed tracks the Access-v2 MembershipAuthority surface", () => {
    setupExecutorEntities();

    let authority = Address.fromString("0x00000000000000000000000000000000000000aa");
    handleHatsRepointed(createHatsRepointedEvent(authority));

    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "hatsContract",
      authority.toHexString()
    );
  });

  test("HatMinterAuthorized creates/updates HatMinterAuthorization", () => {
    setupExecutorEntities();

    let minter = Address.fromString("0x0000000000000000000000000000000000000001");

    // First authorization
    let event1 = createHatMinterAuthorizedEvent(minter, true);
    handleHatMinterAuthorized(event1);

    assert.entityCount("HatMinterAuthorization", 1);
    let authId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x0000000000000000000000000000000000000001";
    assert.fieldEquals("HatMinterAuthorization", authId, "authorized", "true");

    // Revoke authorization
    let event2 = createHatMinterAuthorizedEvent(minter, false);
    handleHatMinterAuthorized(event2);

    assert.entityCount("HatMinterAuthorization", 1);
    assert.fieldEquals("HatMinterAuthorization", authId, "authorized", "false");
  });

  test("HatsMinted creates HatsMintedEvent entity", () => {
    setupExecutorEntities();

    let user = Address.fromString("0x0000000000000000000000000000000000000001");
    let hatIds: BigInt[] = [BigInt.fromI32(100), BigInt.fromI32(200)];
    let event = createHatsMintedEvent(user, hatIds);
    handleHatsMinted(event);

    assert.entityCount("HatsMintedEvent", 1);
  });

  test("Paused updates ExecutorContract and creates PauseEvent", () => {
    setupExecutorEntities();

    let account = Address.fromString("0x0000000000000000000000000000000000000001");
    let event = createPausedEvent(account);
    handlePaused(event);

    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "isPaused",
      "true"
    );
    // Verify consolidated PauseEvent entity was created
    assert.entityCount("PauseEvent", 1);
  });

  test("Unpaused updates ExecutorContract and creates PauseEvent", () => {
    setupExecutorEntities();

    // First pause
    let pauseEvent = createPausedEvent(Address.fromString("0x0000000000000000000000000000000000000001"));
    handlePaused(pauseEvent);

    // Then unpause - need different logIndex to get unique entity ID (default is 1)
    let account = Address.fromString("0x0000000000000000000000000000000000000001");
    let unpauseEvent = createUnpausedEvent(account);
    unpauseEvent.logIndex = BigInt.fromI32(2);
    handleUnpaused(unpauseEvent);

    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "isPaused",
      "false"
    );
    // Verify consolidated PauseEvent entities were created (one for pause, one for unpause)
    assert.entityCount("PauseEvent", 2);
  });

  test("PauseEvent has correct fields for Executor contract type", () => {
    setupExecutorEntities();

    let account = Address.fromString("0x0000000000000000000000000000000000000001");
    let event = createPausedEvent(account);
    handlePaused(event);

    // PauseEvent uses txHash-logIndex as ID
    let pauseEventId = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
    assert.fieldEquals("PauseEvent", pauseEventId, "contractType", "Executor");
    assert.fieldEquals("PauseEvent", pauseEventId, "isPaused", "true");
    assert.fieldEquals("PauseEvent", pauseEventId, "account", "0x0000000000000000000000000000000000000001");
  });

  test("OwnershipTransferred updates ExecutorContract and creates ExecutorOwnershipTransfer", () => {
    setupExecutorEntities();

    let previousOwner = Address.fromString("0x0000000000000000000000000000000000000001");
    let newOwner = Address.fromString("0x0000000000000000000000000000000000000002");
    let event = createOwnershipTransferredEvent(previousOwner, newOwner);
    handleOwnershipTransferred(event);

    assert.fieldEquals(
      "ExecutorContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "owner",
      "0x0000000000000000000000000000000000000002"
    );
    assert.entityCount("ExecutorOwnershipTransfer", 1);
  });
});
