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
  ToggleModuleContract
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
  hybridVoting.quorum = 0;
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
  ddv.quorum = 0;
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
