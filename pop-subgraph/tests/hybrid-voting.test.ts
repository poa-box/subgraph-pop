import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  handleInitialized,
  handleExecutorUpdated,
  handleThresholdPctSet,
  handleQuorumSet,
  handleHatSet,
  handleHatToggled,
  handleNewProposal,
  handleNewHatProposal,
  handleVoteCast,
  handleWinner,
  handleProposalExecuted,
  handleClassesReplaced
} from "../src/hybrid-voting";
import {
  createInitializedEvent,
  createExecutorUpdatedEvent,
  createThresholdPctSetEvent,
  createQuorumSetEvent,
  createHatSetEvent,
  createHatToggledEvent,
  createNewProposalEvent,
  createNewHatProposalEvent,
  createVoteCastEvent,
  createWinnerEvent,
  createProposalExecutedEvent,
  createClassesReplacedEvent
} from "./hybrid-voting-utils";
import { Organization, HybridVotingContract, HybridVotingThresholdChange, TaskManager, DirectDemocracyVotingContract, EligibilityModuleContract, ParticipationTokenContract, QuickJoinContract, EducationHubContract, PaymentManagerContract, ExecutorContract, ToggleModuleContract, VotingClass, VotingClassChange } from "../generated/schema";

/**
 * Helper function to create necessary entities for hybrid voting tests.
 * Creates an Organization, TaskManager, and HybridVotingContract entity.
 */
function setupHybridVotingContract(contractAddress: Address): void {
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

  // Create ExecutorContract entity
  let executorAddress = Address.fromString("0x0000000000000000000000000000000000000001");
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

  // Create TaskManager entity (required by Organization schema)
  let taskManagerAddress = Address.fromString("0x0000000000000000000000000000000000000006");
  let taskManager = new TaskManager(taskManagerAddress);
  taskManager.organization = orgId;
  taskManager.creatorHatIds = [BigInt.fromI32(1002)]; // Non-member roles that can create projects
  taskManager.organizerHatIds = []; // populated by OrganizerHatAllowed events (v4)
  taskManager.createdAt = BigInt.fromI32(1000);
  taskManager.createdAtBlock = BigInt.fromI32(100);
  taskManager.transactionHash = Bytes.fromHexString("0xabcd");

  // Create HybridVotingContract entity
  let hybridVoting = new HybridVotingContract(contractAddress);
  hybridVoting.organization = orgId;
  hybridVoting.executor = Address.zero();
  hybridVoting.thresholdPct = 0;
  hybridVoting.quorum = 0;
  hybridVoting.hats = Address.zero();
  hybridVoting.classVersion = BigInt.fromI32(0);
  hybridVoting.createdAt = BigInt.fromI32(1000);
  hybridVoting.createdAtBlock = BigInt.fromI32(100);

  // Create DirectDemocracyVotingContract entity (required by Organization schema)
  let ddvAddress = Address.fromString("0x0000000000000000000000000000000000000003");
  let ddv = new DirectDemocracyVotingContract(ddvAddress);
  ddv.organization = orgId;
  ddv.executor = Address.zero();
  ddv.thresholdPct = 0;
  ddv.quorum = 0;
  ddv.hats = Address.zero();
  ddv.createdAt = BigInt.fromI32(1000);
  ddv.createdAtBlock = BigInt.fromI32(100);

  // Create EligibilityModuleContract entity (required by Organization schema)
  let eligibilityModuleAddress = Address.fromString("0x0000000000000000000000000000000000000009");
  let eligibilityModule = new EligibilityModuleContract(eligibilityModuleAddress);
  eligibilityModule.organization = orgId;
  eligibilityModule.superAdmin = Address.zero();
  eligibilityModule.hatsContract = Address.zero();
  eligibilityModule.toggleModule = Address.fromString("0x000000000000000000000000000000000000000a");
  eligibilityModule.isPaused = false;
  eligibilityModule.createdAt = BigInt.fromI32(1000);
  eligibilityModule.createdAtBlock = BigInt.fromI32(100);

  // Create ParticipationTokenContract entity (required by Organization schema)
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

  // Create QuickJoinContract entity (required by Organization schema)
  let quickJoinAddress = Address.fromString("0x0000000000000000000000000000000000000004");
  let quickJoin = new QuickJoinContract(quickJoinAddress);
  quickJoin.organization = orgId;
  quickJoin.executor = Address.zero();
  quickJoin.hatsContract = Address.zero();
  quickJoin.accountRegistry = Address.zero();
  quickJoin.masterDeployAddress = Address.zero();
  quickJoin.createdAt = BigInt.fromI32(1000);
  quickJoin.createdAtBlock = BigInt.fromI32(100);

  // Create EducationHubContract entity (required by Organization schema)
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

  // Create PaymentManagerContract entity (required by Organization schema)
  let paymentManagerAddress = Address.fromString("0x0000000000000000000000000000000000000008");
  let paymentManager = new PaymentManagerContract(paymentManagerAddress);
  paymentManager.organization = orgId;
  paymentManager.owner = Address.zero();
  paymentManager.revenueShareToken = Address.zero();
  paymentManager.distributionCounter = BigInt.fromI32(0);
  paymentManager.createdAt = BigInt.fromI32(1000);
  paymentManager.createdAtBlock = BigInt.fromI32(100);

  // Link organization to entities
  organization.executorContract = executorAddress;
  organization.toggleModuleContract = toggleModuleAddress;
  organization.taskManager = taskManagerAddress;
  organization.hybridVoting = contractAddress;
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

describe("HybridVoting", () => {
  afterEach(() => {
    clearStore();
  });

  describe("Initialized", () => {
    test("HybridVotingContract exists after initialization", () => {
      let version = BigInt.fromI32(1);
      let event = createInitializedEvent(version);

      // Setup contract first (simulating OrgDeployed)
      setupHybridVotingContract(event.address);

      handleInitialized(event);

      assert.entityCount("HybridVotingContract", 1);

      // Verify contract still exists with default values
      let contractId = event.address.toHexString();
      assert.fieldEquals(
        "HybridVotingContract",
        contractId,
        "executor",
        "0x0000000000000000000000000000000000000000"
      );
      assert.fieldEquals("HybridVotingContract", contractId, "thresholdPct", "0");
      assert.fieldEquals("HybridVotingContract", contractId, "quorum", "0");
    });
  });

  describe("ExecutorUpdated", () => {
    test("Executor updated and consolidated ExecutorChange created", () => {
      let newExecutor = Address.fromString(
        "0x0000000000000000000000000000000000000001"
      );
      let event = createExecutorUpdatedEvent(newExecutor);

      // Setup contract first (simulating OrgDeployed)
      setupHybridVotingContract(event.address);

      // Update the executor
      handleExecutorUpdated(event);

      // Verify contract was updated
      let contractId = event.address.toHexString();
      assert.fieldEquals(
        "HybridVotingContract",
        contractId,
        "executor",
        "0x0000000000000000000000000000000000000001"
      );

      // Verify consolidated ExecutorChange entity was created
      assert.entityCount("ExecutorChange", 1);
    });

    test("Executor update skips if contract doesn't exist", () => {
      let newExecutor = Address.fromString(
        "0x0000000000000000000000000000000000000001"
      );
      let event = createExecutorUpdatedEvent(newExecutor);
      handleExecutorUpdated(event);

      // Verify contract was NOT created (edge case handling)
      assert.entityCount("HybridVotingContract", 0);
      assert.entityCount("ExecutorChange", 0);
    });

    test("Multiple executor updates tracked historically", () => {
      let executor1 = Address.fromString(
        "0x0000000000000000000000000000000000000001"
      );
      let event1 = createExecutorUpdatedEvent(executor1);
      event1.logIndex = BigInt.fromI32(1);

      // Setup contract first (simulating OrgDeployed)
      setupHybridVotingContract(event1.address);

      // First update
      handleExecutorUpdated(event1);

      // Second update
      let executor2 = Address.fromString(
        "0x0000000000000000000000000000000000000002"
      );
      let event2 = createExecutorUpdatedEvent(executor2);
      event2.logIndex = BigInt.fromI32(2);
      handleExecutorUpdated(event2);

      // Verify both consolidated ExecutorChange entities are tracked
      assert.entityCount("ExecutorChange", 2);

      // Verify current executor is the latest
      let contractId = event1.address.toHexString();
      assert.fieldEquals(
        "HybridVotingContract",
        contractId,
        "executor",
        "0x0000000000000000000000000000000000000002"
      );
    });

    test("ExecutorChange has correct contract type for HybridVoting", () => {
      let newExecutor = Address.fromString(
        "0x0000000000000000000000000000000000000001"
      );
      let event = createExecutorUpdatedEvent(newExecutor);
      setupHybridVotingContract(event.address);
      handleExecutorUpdated(event);

      // ExecutorChange uses txHash-logIndex as ID
      let changeId = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
      assert.fieldEquals("ExecutorChange", changeId, "contractType", "HybridVoting");
      assert.fieldEquals("ExecutorChange", changeId, "newExecutor", "0x0000000000000000000000000000000000000001");
    });
  });

  describe("ThresholdPctSet", () => {
    test("Threshold set and historical record created", () => {
      let event = createThresholdPctSetEvent(51);

      setupHybridVotingContract(event.address);

      handleThresholdPctSet(event);

      let contractId = event.address.toHexString();
      assert.fieldEquals("HybridVotingContract", contractId, "thresholdPct", "51");
      assert.entityCount("HybridVotingThresholdChange", 1);
    });

    test("Threshold change skips if contract doesn't exist", () => {
      let event = createThresholdPctSetEvent(51);
      handleThresholdPctSet(event);

      assert.entityCount("HybridVotingContract", 0);
      assert.entityCount("HybridVotingThresholdChange", 0);
    });

    test("Multiple threshold changes tracked historically", () => {
      let event1 = createThresholdPctSetEvent(51);
      event1.logIndex = BigInt.fromI32(1);

      setupHybridVotingContract(event1.address);

      handleThresholdPctSet(event1);

      let event2 = createThresholdPctSetEvent(60);
      event2.logIndex = BigInt.fromI32(2);
      handleThresholdPctSet(event2);

      assert.entityCount("HybridVotingThresholdChange", 2);

      let contractId = event1.address.toHexString();
      assert.fieldEquals("HybridVotingContract", contractId, "thresholdPct", "60");
    });
  });

  describe("QuorumSet", () => {
    test("Quorum set and historical record created", () => {
      let event = createQuorumSetEvent(5);

      setupHybridVotingContract(event.address);

      handleQuorumSet(event);

      let contractId = event.address.toHexString();
      assert.fieldEquals("HybridVotingContract", contractId, "quorum", "5");
      assert.entityCount("HybridVotingQuorumChange", 1);
    });

    test("Quorum change skips if contract doesn't exist", () => {
      let event = createQuorumSetEvent(5);
      handleQuorumSet(event);

      assert.entityCount("HybridVotingContract", 0);
      assert.entityCount("HybridVotingQuorumChange", 0);
    });

    test("Multiple quorum changes tracked historically", () => {
      let event1 = createQuorumSetEvent(5);
      event1.logIndex = BigInt.fromI32(1);

      setupHybridVotingContract(event1.address);

      handleQuorumSet(event1);

      let event2 = createQuorumSetEvent(10);
      event2.logIndex = BigInt.fromI32(2);
      handleQuorumSet(event2);

      assert.entityCount("HybridVotingQuorumChange", 2);

      let contractId = event1.address.toHexString();
      assert.fieldEquals("HybridVotingContract", contractId, "quorum", "10");
    });
  });

  describe("HatSet", () => {
    test("Consolidated HatPermission created with Creator role for hatType 0", () => {
      // hatType 0 = Creator role, hatType 1+ = Voter role
      let event = createHatSetEvent(0, BigInt.fromI32(1), true);

      // Setup contract first (handler requires HybridVotingContract to exist)
      setupHybridVotingContract(event.address);

      handleHatSet(event);

      // Verify consolidated HatPermission entity was created
      assert.entityCount("HatPermission", 1);

      // HatPermission ID format: contractAddress-hatId-role
      let permissionId = event.address.toHexString() + "-1-Creator";
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "hatId",
        "1"
      );
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "allowed",
        "true"
      );
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "hatType",
        "0"
      );
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "permissionRole",
        "Creator"
      );
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "contractType",
        "HybridVoting"
      );
    });

    test("Consolidated HatPermission created with Voter role for hatType 1+", () => {
      // hatType 1+ = Voter role
      let event = createHatSetEvent(1, BigInt.fromI32(1), true);

      // Setup contract first (handler requires HybridVotingContract to exist)
      setupHybridVotingContract(event.address);

      handleHatSet(event);

      // Verify consolidated HatPermission entity was created
      assert.entityCount("HatPermission", 1);

      // HatPermission ID format: contractAddress-hatId-role
      let permissionId = event.address.toHexString() + "-1-Voter";
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "hatId",
        "1"
      );
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "permissionRole",
        "Voter"
      );
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "hatType",
        "1"
      );
    });

    test("Different hatTypes create separate permissions for same hatId", () => {
      // Setup contract first (handler requires HybridVotingContract to exist)
      let event1 = createHatSetEvent(0, BigInt.fromI32(1), true);
      setupHybridVotingContract(event1.address);

      // Create Creator permission (hatType 0)
      handleHatSet(event1);

      // Create Voter permission (hatType 1) for same hatId - should create a new entity
      let event2 = createHatSetEvent(1, BigInt.fromI32(1), false);
      handleHatSet(event2);

      // Should have 2 entities (different roles)
      assert.entityCount("HatPermission", 2);

      // Verify Creator permission
      let creatorPermissionId = event1.address.toHexString() + "-1-Creator";
      assert.fieldEquals(
        "HatPermission",
        creatorPermissionId,
        "allowed",
        "true"
      );

      // Verify Voter permission
      let voterPermissionId = event1.address.toHexString() + "-1-Voter";
      assert.fieldEquals(
        "HatPermission",
        voterPermissionId,
        "allowed",
        "false"
      );
      assert.fieldEquals(
        "HatPermission",
        voterPermissionId,
        "hatType",
        "1"
      );
    });

    test("HatSet skips if contract doesn't exist", () => {
      let event = createHatSetEvent(0, BigInt.fromI32(1), true);
      // Don't setup contract
      handleHatSet(event);

      // Verify no entity was created
      assert.entityCount("HatPermission", 0);
    });
  });

  describe("HatToggled", () => {
    test("Consolidated HatPermission created via toggle", () => {
      let event = createHatToggledEvent(BigInt.fromI32(1), true);

      // Setup contract first (handler requires HybridVotingContract to exist)
      setupHybridVotingContract(event.address);

      handleHatToggled(event);

      // Verify consolidated HatPermission entity was created
      assert.entityCount("HatPermission", 1);

      let permissionId = event.address.toHexString() + "-1-Voter";
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "allowed",
        "true"
      );
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "contractType",
        "HybridVoting"
      );
    });

    test("HatPermission can be toggled", () => {
      let event1 = createHatToggledEvent(BigInt.fromI32(1), true);

      // Setup contract first (handler requires HybridVotingContract to exist)
      setupHybridVotingContract(event1.address);

      handleHatToggled(event1);

      let event2 = createHatToggledEvent(BigInt.fromI32(1), false);
      handleHatToggled(event2);

      assert.entityCount("HatPermission", 1);

      let permissionId = event1.address.toHexString() + "-1-Voter";
      assert.fieldEquals(
        "HatPermission",
        permissionId,
        "allowed",
        "false"
      );
    });

    test("HatToggled skips if contract doesn't exist", () => {
      let event = createHatToggledEvent(BigInt.fromI32(1), true);
      // Don't setup contract
      handleHatToggled(event);

      // Verify no entity was created
      assert.entityCount("HatPermission", 0);
    });
  });

  describe("Proposals", () => {
    test("NewProposal creates unrestricted proposal", () => {
      let proposalId = BigInt.fromI32(1);
      let title = Bytes.fromHexString("0xabcd");
      let descriptionHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
      let numOptions = 3;
      let endTs = 1700000000 as i64;
      let created = 1699900000 as i64;

      let event = createNewProposalEvent(
        proposalId,
        title,
        descriptionHash,
        numOptions,
        endTs,
        created
      );

      handleNewProposal(event);

      assert.entityCount("Proposal", 1);

      let proposalEntityId = event.address.toHexString() + "-" + proposalId.toString();
      assert.fieldEquals("Proposal", proposalEntityId, "proposalId", "1");
      assert.fieldEquals("Proposal", proposalEntityId, "numOptions", "3");
      assert.fieldEquals("Proposal", proposalEntityId, "isHatRestricted", "false");
      assert.fieldEquals("Proposal", proposalEntityId, "status", "Active");
      assert.fieldEquals("Proposal", proposalEntityId, "wasExecuted", "false");
    });

    test("NewHatProposal creates hat-restricted proposal", () => {
      let proposalId = BigInt.fromI32(2);
      let title = Bytes.fromHexString("0x1234");
      let descriptionHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000005678");
      let numOptions = 2;
      let endTs = 1700000000 as i64;
      let created = 1699900000 as i64;
      let hatIds = [BigInt.fromI32(100), BigInt.fromI32(200)];

      let event = createNewHatProposalEvent(
        proposalId,
        title,
        descriptionHash,
        numOptions,
        endTs,
        created,
        hatIds
      );

      handleNewHatProposal(event);

      assert.entityCount("Proposal", 1);

      let proposalEntityId = event.address.toHexString() + "-" + proposalId.toString();
      assert.fieldEquals("Proposal", proposalEntityId, "isHatRestricted", "true");
      assert.fieldEquals("Proposal", proposalEntityId, "numOptions", "2");
    });

    test("VoteCast records a vote on proposal", () => {
      // First create a proposal
      let proposalId = BigInt.fromI32(1);
      let title = Bytes.fromHexString("0xabcd");
      let descriptionHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");

      let proposalEvent = createNewProposalEvent(
        proposalId,
        title,
        descriptionHash,
        3,
        1700000000 as i64,
        1699900000 as i64
      );
      handleNewProposal(proposalEvent);

      // Cast a vote
      let voter = Address.fromString("0x0000000000000000000000000000000000000003");
      let idxs = [0, 1];
      let weights = [60, 40];
      let classRawPowers = [BigInt.fromI32(1000), BigInt.fromI32(500)];
      let timestamp = 1699950000 as i64;

      let voteEvent = createVoteCastEvent(
        proposalId,
        voter,
        idxs,
        weights,
        classRawPowers,
        timestamp
      );

      handleVoteCast(voteEvent);

      assert.entityCount("Vote", 1);

      let voteId = voteEvent.address.toHexString() + "-" + proposalId.toString() + "-" + voter.toHexString();
      assert.fieldEquals("Vote", voteId, "voter", voter.toHexString());
    });

    test("Winner event updates proposal status to Ended", () => {
      // Create proposal
      let proposalId = BigInt.fromI32(1);
      let title = Bytes.fromHexString("0xabcd");
      let descriptionHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");

      let proposalEvent = createNewProposalEvent(
        proposalId,
        title,
        descriptionHash,
        3,
        1700000000 as i64,
        1699900000 as i64
      );
      handleNewProposal(proposalEvent);

      // Announce winner
      let winningIdx = BigInt.fromI32(1);
      let winnerEvent = createWinnerEvent(
        proposalId,
        winningIdx,
        true,
        false,
        1700000100 as i64
      );

      handleWinner(winnerEvent);

      let proposalEntityId = winnerEvent.address.toHexString() + "-" + proposalId.toString();
      assert.fieldEquals("Proposal", proposalEntityId, "winningOption", "1");
      assert.fieldEquals("Proposal", proposalEntityId, "isValid", "true");
      assert.fieldEquals("Proposal", proposalEntityId, "status", "Ended");
      assert.fieldEquals("Proposal", proposalEntityId, "wasExecuted", "false");
    });

    test("Winner event with executed=true updates status to Executed", () => {
      // Create proposal
      let proposalId = BigInt.fromI32(1);
      let title = Bytes.fromHexString("0xabcd");
      let descriptionHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");

      let proposalEvent = createNewProposalEvent(
        proposalId,
        title,
        descriptionHash,
        3,
        1700000000 as i64,
        1699900000 as i64
      );
      handleNewProposal(proposalEvent);

      // Announce winner with executed=true
      let winningIdx = BigInt.fromI32(2);
      let winnerEvent = createWinnerEvent(
        proposalId,
        winningIdx,
        true,
        true,
        1700000100 as i64
      );

      handleWinner(winnerEvent);

      let proposalEntityId = winnerEvent.address.toHexString() + "-" + proposalId.toString();
      assert.fieldEquals("Proposal", proposalEntityId, "status", "Executed");
      assert.fieldEquals("Proposal", proposalEntityId, "wasExecuted", "true");
    });

    test("ProposalExecuted marks proposal as executed", () => {
      // Create proposal
      let proposalId = BigInt.fromI32(1);
      let title = Bytes.fromHexString("0xabcd");
      let descriptionHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");

      let proposalEvent = createNewProposalEvent(
        proposalId,
        title,
        descriptionHash,
        3,
        1700000000 as i64,
        1699900000 as i64
      );
      handleNewProposal(proposalEvent);

      // Execute proposal
      let winningIdx = BigInt.fromI32(0);
      let numCalls = BigInt.fromI32(5);
      let executeEvent = createProposalExecutedEvent(
        proposalId,
        winningIdx,
        numCalls
      );

      handleProposalExecuted(executeEvent);

      let proposalEntityId = executeEvent.address.toHexString() + "-" + proposalId.toString();
      assert.fieldEquals("Proposal", proposalEntityId, "wasExecuted", "true");
      assert.fieldEquals("Proposal", proposalEntityId, "status", "Executed");
      assert.fieldEquals("Proposal", proposalEntityId, "executedCallsCount", "5");
    });

    test("Full proposal lifecycle", () => {
      let proposalId = BigInt.fromI32(1);
      let title = Bytes.fromHexString("0xabcd");
      let descriptionHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
      let voter1 = Address.fromString("0x0000000000000000000000000000000000000002");
      let voter2 = Address.fromString("0x0000000000000000000000000000000000000003");

      // 1. Create proposal
      let proposalEvent = createNewProposalEvent(
        proposalId,
        title,
        descriptionHash,
        3,
        1700000000 as i64,
        1699900000 as i64
      );
      handleNewProposal(proposalEvent);

      let proposalEntityId = proposalEvent.address.toHexString() + "-" + proposalId.toString();
      assert.fieldEquals("Proposal", proposalEntityId, "status", "Active");

      // 2. Cast votes
      let vote1 = createVoteCastEvent(
        proposalId,
        voter1,
        [0, 1],
        [70, 30],
        [BigInt.fromI32(1000)],
        1699950000 as i64
      );
      handleVoteCast(vote1);

      let vote2 = createVoteCastEvent(
        proposalId,
        voter2,
        [1],
        [100],
        [BigInt.fromI32(500)],
        1699960000 as i64
      );
      handleVoteCast(vote2);

      assert.entityCount("Vote", 2);

      // 3. Announce winner
      let winnerEvent = createWinnerEvent(
        proposalId,
        BigInt.fromI32(1),
        true,
        false,
        1700000100 as i64
      );
      handleWinner(winnerEvent);

      assert.fieldEquals("Proposal", proposalEntityId, "status", "Ended");
      assert.fieldEquals("Proposal", proposalEntityId, "winningOption", "1");

      // 4. Execute proposal
      let executeEvent = createProposalExecutedEvent(
        proposalId,
        BigInt.fromI32(1),
        BigInt.fromI32(3)
      );
      handleProposalExecuted(executeEvent);

      assert.fieldEquals("Proposal", proposalEntityId, "status", "Executed");
      assert.fieldEquals("Proposal", proposalEntityId, "wasExecuted", "true");
      assert.fieldEquals("Proposal", proposalEntityId, "executedCallsCount", "3");
    });
  });

  describe("ClassesReplaced", () => {
    test("VotingClass entities created from ClassesReplaced event", () => {
      // Create a ClassesReplaced event with 2 classes
      let version = BigInt.fromI32(12345);
      let classesHash = Bytes.fromHexString(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
      );
      let timestamp = 1700000000 as i64;

      // Class 0: DIRECT strategy, 60%, no quadratic, no min balance, no asset
      // Class 1: ERC20_BAL strategy, 40%, quadratic, 1 ETH min balance, token asset
      let event = createClassesReplacedEvent(version, classesHash, timestamp);

      // Setup contract first (handler requires HybridVotingContract to exist)
      setupHybridVotingContract(event.address);

      handleClassesReplaced(event);

      // Verify 2 VotingClass entities were created
      assert.entityCount("VotingClass", 2);

      // Verify VotingClassChange entity was created
      assert.entityCount("VotingClassChange", 1);

      // Verify first class (DIRECT)
      let class0Id = event.address.toHexString() + "-12345-0";
      assert.fieldEquals("VotingClass", class0Id, "strategy", "DIRECT");
      assert.fieldEquals("VotingClass", class0Id, "slicePct", "60");
      assert.fieldEquals("VotingClass", class0Id, "quadratic", "false");
      assert.fieldEquals("VotingClass", class0Id, "classIndex", "0");
      assert.fieldEquals("VotingClass", class0Id, "isActive", "true");

      // Verify second class (ERC20_BAL)
      let class1Id = event.address.toHexString() + "-12345-1";
      assert.fieldEquals("VotingClass", class1Id, "strategy", "ERC20_BAL");
      assert.fieldEquals("VotingClass", class1Id, "slicePct", "40");
      assert.fieldEquals("VotingClass", class1Id, "quadratic", "true");
      assert.fieldEquals("VotingClass", class1Id, "classIndex", "1");
      assert.fieldEquals("VotingClass", class1Id, "isActive", "true");

      // Verify contract's classVersion was updated
      assert.fieldEquals(
        "HybridVotingContract",
        event.address.toHexString(),
        "classVersion",
        "12345"
      );
    });

    test("ClassesReplaced skips if contract doesn't exist", () => {
      let version = BigInt.fromI32(12345);
      let classesHash = Bytes.fromHexString(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
      );
      let timestamp = 1700000000 as i64;
      let event = createClassesReplacedEvent(version, classesHash, timestamp);
      // Don't setup contract

      handleClassesReplaced(event);

      // Verify no entities were created
      assert.entityCount("VotingClass", 0);
      assert.entityCount("VotingClassChange", 0);
    });

    test("VotingClassChange entity has correct fields", () => {
      let version = BigInt.fromI32(99999);
      let classesHash = Bytes.fromHexString(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );
      let timestamp = 1700500000 as i64;
      let event = createClassesReplacedEvent(version, classesHash, timestamp);

      setupHybridVotingContract(event.address);
      handleClassesReplaced(event);

      // Verify VotingClassChange fields
      assert.entityCount("VotingClassChange", 1);

      // The ID is txHash.concatI32(logIndex)
      let changeId = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
      assert.fieldEquals("VotingClassChange", changeId, "version", "99999");
      assert.fieldEquals("VotingClassChange", changeId, "numClasses", "2");
      assert.fieldEquals(
        "VotingClassChange",
        changeId,
        "classesHash",
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );
    });

    test("VotingClass entities have correct minBalance and asset fields", () => {
      let version = BigInt.fromI32(54321);
      let classesHash = Bytes.fromHexString(
        "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321"
      );
      let timestamp = 1700100000 as i64;
      let event = createClassesReplacedEvent(version, classesHash, timestamp);

      setupHybridVotingContract(event.address);
      handleClassesReplaced(event);

      // Verify Class 0 has zero minBalance and zero asset (DIRECT strategy)
      let class0Id = event.address.toHexString() + "-54321-0";
      assert.fieldEquals("VotingClass", class0Id, "minBalance", "0");
      assert.fieldEquals(
        "VotingClass",
        class0Id,
        "asset",
        "0x0000000000000000000000000000000000000000"
      );

      // Verify Class 1 has 1 ETH minBalance and non-zero asset (ERC20_BAL strategy)
      let class1Id = event.address.toHexString() + "-54321-1";
      assert.fieldEquals("VotingClass", class1Id, "minBalance", "1000000000000000000");
      assert.fieldEquals(
        "VotingClass",
        class1Id,
        "asset",
        "0x0000000000000000000000000000000000000099"
      );
    });

    test("VotingClass entities link to HybridVotingContract", () => {
      let version = BigInt.fromI32(11111);
      let classesHash = Bytes.fromHexString(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      );
      let timestamp = 1700200000 as i64;
      let event = createClassesReplacedEvent(version, classesHash, timestamp);

      setupHybridVotingContract(event.address);
      handleClassesReplaced(event);

      // Verify VotingClass entities link to the correct HybridVotingContract
      let class0Id = event.address.toHexString() + "-11111-0";
      let class1Id = event.address.toHexString() + "-11111-1";

      assert.fieldEquals(
        "VotingClass",
        class0Id,
        "hybridVoting",
        event.address.toHexString()
      );
      assert.fieldEquals(
        "VotingClass",
        class1Id,
        "hybridVoting",
        event.address.toHexString()
      );
    });

    test("VotingClass entities have correct version field", () => {
      let version = BigInt.fromI32(77777);
      let classesHash = Bytes.fromHexString(
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      );
      let timestamp = 1700300000 as i64;
      let event = createClassesReplacedEvent(version, classesHash, timestamp);

      setupHybridVotingContract(event.address);
      handleClassesReplaced(event);

      let class0Id = event.address.toHexString() + "-77777-0";
      let class1Id = event.address.toHexString() + "-77777-1";

      assert.fieldEquals("VotingClass", class0Id, "version", "77777");
      assert.fieldEquals("VotingClass", class1Id, "version", "77777");
    });

    test("VotingClass entities have correct timestamps", () => {
      let version = BigInt.fromI32(88888);
      let classesHash = Bytes.fromHexString(
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      );
      let timestamp = 1700400000 as i64;
      let event = createClassesReplacedEvent(version, classesHash, timestamp);

      setupHybridVotingContract(event.address);
      handleClassesReplaced(event);

      let class0Id = event.address.toHexString() + "-88888-0";

      // Verify createdAt uses block.timestamp from event
      assert.fieldEquals(
        "VotingClass",
        class0Id,
        "createdAtBlock",
        event.block.number.toString()
      );
    });
  });
});
