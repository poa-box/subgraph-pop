import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  createMockedFunction
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
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
  createClassesReplacedEvent,
  createClassesReplacedEventWithClasses,
  createClassConfig
} from "./hybrid-voting-utils";
import { ClassesReplaced } from "../generated/templates/HybridVoting/HybridVoting";
import { Organization, Proposal, HybridVotingContract, HybridVotingThresholdChange, TaskManager, DirectDemocracyVotingContract, EligibilityModuleContract, ParticipationTokenContract, QuickJoinContract, EducationHubContract, PaymentManagerContract, ExecutorContract, ToggleModuleContract, VotingClass, VotingClassChange } from "../generated/schema";

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
  quickJoin.memberHatIds = [];
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

/**
 * Mock HybridVoting.creatorHats() — the on-chain enumeration handleInitialized
 * reads to backfill creator hats that initialize() seeded without events.
 */
function mockCreatorHats(contractAddress: Address, hatIds: BigInt[]): void {
  createMockedFunction(
    contractAddress,
    "creatorHats",
    "creatorHats():(uint256[])"
  ).returns([ethereum.Value.fromUnsignedBigIntArray(hatIds)]);
}

/**
 * Builds a ClassesReplaced carrying `numClasses` DIRECT classes at `version`.
 * logIndex must be unique per emission within a test: VotingClassChange is immutable and
 * keyed on txHash.concatI32(logIndex), and every mock event shares one default tx hash.
 */
function classesReplacedWithCount(
  version: BigInt,
  numClasses: i32,
  logIndex: i32
): ClassesReplaced {
  let classConfigs: ethereum.Tuple[] = [];
  for (let i = 0; i < numClasses; i++) {
    classConfigs.push(
      createClassConfig(0, 100 / numClasses, false, BigInt.fromI32(0), Address.zero(), [
        BigInt.fromI32(1001 + i)
      ])
    );
  }

  let event = createClassesReplacedEventWithClasses(
    version,
    Bytes.fromHexString(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    ),
    1700000000 as i64,
    classConfigs
  );
  // Gnosis-shaped: the contract's block.number matches the indexed block. Arbitrum decouples
  // them — see "an L1-shared version does not collide across indexed blocks".
  event.block.number = version;
  event.logIndex = BigInt.fromI32(logIndex);
  return event;
}

/**
 * Builds a 2-class ClassesReplaced whose first class carries `slicePct0` — lets a test tell
 * two configurations apart when they share a version.
 */
function classesReplacedWithSlice(
  version: BigInt,
  slicePct0: i32,
  logIndex: i32
): ClassesReplaced {
  let classConfigs: ethereum.Tuple[] = [];
  classConfigs.push(
    createClassConfig(0, slicePct0, false, BigInt.fromI32(0), Address.zero(), [
      BigInt.fromI32(1001)
    ])
  );
  classConfigs.push(
    createClassConfig(0, 100 - slicePct0, false, BigInt.fromI32(0), Address.zero(), [
      BigInt.fromI32(1002)
    ])
  );

  let event = createClassesReplacedEventWithClasses(
    version,
    Bytes.fromHexString(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    ),
    1700000000 as i64,
    classConfigs
  );
  // Gnosis-shaped: the contract's block.number matches the indexed block. Arbitrum decouples
  // them — see "an L1-shared version does not collide across indexed blocks".
  event.block.number = version;
  event.logIndex = BigInt.fromI32(logIndex);
  return event;
}

/** VotingClass id: hybridVoting-indexedBlock-logIndex-classIndex (schema.graphql). */
function votingClassId(
  contractAddress: Address,
  blockNumber: i32,
  logIndex: i32,
  classIndex: i32
): string {
  return (
    contractAddress.toHexString() +
    "-" +
    blockNumber.toString() +
    "-" +
    logIndex.toString() +
    "-" +
    classIndex.toString()
  );
}

/**
 * Writes an active VotingClass row straight to the store, standing in for one the pre-fix
 * handler left behind. Lets a test start from more than one simultaneously-active version,
 * which no sequence of ClassesReplaced events can produce once the sweep is in place.
 */
function seedActiveVotingClass(
  contractAddress: Address,
  version: BigInt,
  classIndex: i32
): void {
  // VotingClass.change is non-null, so the seed needs an emission to hang off.
  let changeId = Bytes.fromHexString("0xdead").concatI32(version.toI32());
  let change = new VotingClassChange(changeId);
  change.hybridVoting = contractAddress;
  change.version = version;
  change.logIndex = BigInt.fromI32(0);
  change.classesHash = Bytes.fromHexString("0xbeef");
  change.numClasses = 1;
  change.changedAt = BigInt.fromI32(1000);
  change.changedAtBlock = BigInt.fromI32(100);
  change.transactionHash = Bytes.fromHexString("0xabcd");
  change.save();

  let votingClass = new VotingClass(
    contractAddress.toHexString() + "-" + version.toString() + "-0-" + classIndex.toString()
  );
  votingClass.hybridVoting = contractAddress;
  votingClass.change = changeId;
  votingClass.version = version;
  votingClass.classIndex = classIndex;
  votingClass.strategy = "DIRECT";
  votingClass.slicePct = 100;
  votingClass.quadratic = false;
  votingClass.minBalance = BigInt.fromI32(0);
  votingClass.asset = Address.zero();
  votingClass.hatIds = [BigInt.fromI32(1001)];
  votingClass.isActive = true;
  votingClass.createdAt = BigInt.fromI32(1000);
  votingClass.createdAtBlock = BigInt.fromI32(100);
  votingClass.transactionHash = Bytes.fromHexString("0xabcd");
  votingClass.save();
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
      // initialize() seeds creator hats with no event; handler reads them on-chain.
      mockCreatorHats(event.address, []);

      handleInitialized(event);

      assert.entityCount("HybridVotingContract", 1);
      // No creator hats configured → no permissions backfilled.
      assert.entityCount("HatPermission", 0);

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

    test("Creator-hat permissions backfilled from on-chain creatorHats()", () => {
      let event = createInitializedEvent(BigInt.fromI32(1));
      setupHybridVotingContract(event.address);
      // Two deploy-time creator hats that never emitted a HatSet event.
      mockCreatorHats(event.address, [BigInt.fromI32(1001), BigInt.fromI32(1002)]);

      handleInitialized(event);

      assert.entityCount("HatPermission", 2);

      let p1 = event.address.toHexString() + "-1001-Creator";
      assert.fieldEquals("HatPermission", p1, "permissionRole", "Creator");
      assert.fieldEquals("HatPermission", p1, "contractType", "HybridVoting");
      assert.fieldEquals("HatPermission", p1, "allowed", "true");
      assert.fieldEquals("HatPermission", p1, "hatId", "1001");

      let p2 = event.address.toHexString() + "-1002-Creator";
      assert.fieldEquals("HatPermission", p2, "allowed", "true");
    });

    test("Backfill is idempotent — a later HatSet overrides in place", () => {
      let event = createInitializedEvent(BigInt.fromI32(1));
      setupHybridVotingContract(event.address);
      mockCreatorHats(event.address, [BigInt.fromI32(1001)]);

      // Deploy-time backfill grants the creator hat...
      handleInitialized(event);
      let pid = event.address.toHexString() + "-1001-Creator";
      assert.fieldEquals("HatPermission", pid, "allowed", "true");

      // ...then governance revokes it post-deploy via setCreatorHatAllowed.
      handleHatSet(createHatSetEvent(0, BigInt.fromI32(1001), false));

      assert.entityCount("HatPermission", 1); // updated in place, not duplicated
      assert.fieldEquals("HatPermission", pid, "allowed", "false");
    });

    test("An event-sourced permission is not clobbered by the backfill", () => {
      let event = createInitializedEvent(BigInt.fromI32(1));
      setupHybridVotingContract(event.address);

      // Event arrives first (e.g. a post-deploy grant), recording hatType 0.
      handleHatSet(createHatSetEvent(0, BigInt.fromI32(1001), true));
      // Backfill then sees the same hat on-chain — must leave the row untouched.
      mockCreatorHats(event.address, [BigInt.fromI32(1001)]);
      handleInitialized(event);

      assert.entityCount("HatPermission", 1);
      let pid = event.address.toHexString() + "-1001-Creator";
      assert.fieldEquals("HatPermission", pid, "allowed", "true");
      assert.fieldEquals("HatPermission", pid, "hatType", "0"); // preserved from event
    });

    test("Reverting creatorHats() is tolerated — no crash, no permissions", () => {
      let event = createInitializedEvent(BigInt.fromI32(1));
      setupHybridVotingContract(event.address);
      createMockedFunction(
        event.address,
        "creatorHats",
        "creatorHats():(uint256[])"
      ).reverts();

      handleInitialized(event);

      assert.entityCount("HybridVotingContract", 1);
      assert.entityCount("HatPermission", 0);
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
      // No ClassesReplaced indexed yet — the documented null case for the snapshot pointer.
      assert.fieldEquals("Proposal", proposalEntityId, "classesVersion", "0");
      let storedProposal = Proposal.load(proposalEntityId);
      assert.assertNotNull(storedProposal);
      assert.assertTrue(storedProposal!.classesChange === null);
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
      let class0Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-0";
      assert.fieldEquals("VotingClass", class0Id, "strategy", "DIRECT");
      assert.fieldEquals("VotingClass", class0Id, "slicePct", "60");
      assert.fieldEquals("VotingClass", class0Id, "quadratic", "false");
      assert.fieldEquals("VotingClass", class0Id, "classIndex", "0");
      assert.fieldEquals("VotingClass", class0Id, "isActive", "true");

      // Verify second class (ERC20_BAL)
      let class1Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-1";
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
      let class0Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-0";
      assert.fieldEquals("VotingClass", class0Id, "minBalance", "0");
      assert.fieldEquals(
        "VotingClass",
        class0Id,
        "asset",
        "0x0000000000000000000000000000000000000000"
      );

      // Verify Class 1 has 1 ETH minBalance and non-zero asset (ERC20_BAL strategy)
      let class1Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-1";
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
      let class0Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-0";
      let class1Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-1";

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

      let class0Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-0";
      let class1Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-1";

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

      let class0Id = event.address.toHexString() + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-0";

      // Verify createdAt uses block.timestamp from event
      assert.fieldEquals(
        "VotingClass",
        class0Id,
        "createdAtBlock",
        event.block.number.toString()
      );
    });

    test("a new version deactivates the superseded version's classes", () => {
      let first = classesReplacedWithCount(BigInt.fromI32(100), 2, 1);
      setupHybridVotingContract(first.address);
      handleClassesReplaced(first);

      let second = classesReplacedWithCount(BigInt.fromI32(200), 2, 2);
      handleClassesReplaced(second);

      // Superseded rows are retained (Proposal.classesVersion points at them) but go false.
      assert.entityCount("VotingClass", 4);
      assert.entityCount("VotingClassChange", 2);
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 1, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 1, 1), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 200, 2, 0), "isActive", "true");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 200, 2, 1), "isActive", "true");
      assert.fieldEquals(
        "HybridVotingContract",
        first.address.toHexString(),
        "classVersion",
        "200"
      );
    });

    test("only the newest of three versions stays active", () => {
      let v1 = classesReplacedWithCount(BigInt.fromI32(100), 2, 1);
      setupHybridVotingContract(v1.address);
      handleClassesReplaced(v1);
      handleClassesReplaced(classesReplacedWithCount(BigInt.fromI32(200), 2, 2));
      handleClassesReplaced(classesReplacedWithCount(BigInt.fromI32(300), 2, 3));

      assert.entityCount("VotingClass", 6);
      assert.entityCount("VotingClassChange", 3);
      assert.fieldEquals("VotingClass", votingClassId(v1.address, 100, 1, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(v1.address, 100, 1, 1), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(v1.address, 200, 2, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(v1.address, 200, 2, 1), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(v1.address, 300, 3, 0), "isActive", "true");
      assert.fieldEquals("VotingClass", votingClassId(v1.address, 300, 3, 1), "isActive", "true");
    });

    test("a shrinking config leaves no orphan active rows", () => {
      let wide = classesReplacedWithCount(BigInt.fromI32(100), 3, 1);
      setupHybridVotingContract(wide.address);
      handleClassesReplaced(wide);

      // 3 classes -> 2: the old classIndex 2 has no successor id to overwrite it.
      handleClassesReplaced(classesReplacedWithCount(BigInt.fromI32(200), 2, 2));

      assert.entityCount("VotingClass", 5);
      assert.entityCount("VotingClassChange", 2);
      assert.fieldEquals("VotingClass", votingClassId(wide.address, 100, 1, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(wide.address, 100, 1, 1), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(wide.address, 100, 1, 2), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(wide.address, 200, 2, 0), "isActive", "true");
      assert.fieldEquals("VotingClass", votingClassId(wide.address, 200, 2, 1), "isActive", "true");
    });

    test("two setClasses in one block keep separate rows, only the last active", () => {
      // version IS the block number, so both emissions share it. logIndex is what keeps their
      // rows apart; without it the second would overwrite the first in place.
      let first = classesReplacedWithCount(BigInt.fromI32(100), 2, 1);
      setupHybridVotingContract(first.address);
      handleClassesReplaced(first);
      handleClassesReplaced(classesReplacedWithCount(BigInt.fromI32(100), 2, 2));

      assert.entityCount("VotingClass", 4);
      assert.entityCount("VotingClassChange", 2);
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 1, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 1, 1), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 2, 0), "isActive", "true");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 2, 1), "isActive", "true");
    });

    test("a same-block shrink retains the wider config it replaced", () => {
      let wide = classesReplacedWithCount(BigInt.fromI32(100), 3, 1);
      setupHybridVotingContract(wide.address);
      handleClassesReplaced(wide);
      handleClassesReplaced(classesReplacedWithCount(BigInt.fromI32(100), 2, 2));

      // 3 classes -> 2 within one block: the third row survives under the first emission's
      // logIndex instead of being stranded active or silently overwritten.
      assert.entityCount("VotingClass", 5);
      assert.entityCount("VotingClassChange", 2);
      assert.fieldEquals("VotingClass", votingClassId(wide.address, 100, 1, 2), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(wide.address, 100, 2, 0), "isActive", "true");
      assert.fieldEquals("VotingClass", votingClassId(wide.address, 100, 2, 1), "isActive", "true");
    });

    test("supersession is scoped to one HybridVoting contract", () => {
      let mine = classesReplacedWithCount(BigInt.fromI32(100), 2, 1);
      setupHybridVotingContract(mine.address);
      handleClassesReplaced(mine);

      // A second org's HybridVoting replacing its classes must not touch the first org's rows.
      let otherAddress = Address.fromString("0x00000000000000000000000000000000000000bb");
      let theirs = classesReplacedWithCount(BigInt.fromI32(200), 2, 2);
      theirs.address = otherAddress;
      setupHybridVotingContract(otherAddress);
      handleClassesReplaced(theirs);

      assert.fieldEquals("VotingClass", votingClassId(mine.address, 100, 1, 0), "isActive", "true");
      assert.fieldEquals("VotingClass", votingClassId(mine.address, 100, 1, 1), "isActive", "true");
      assert.fieldEquals("VotingClass", votingClassId(otherAddress, 200, 2, 0), "isActive", "true");
    });

    test("the sweep clears every active version, not just the previous one", () => {
      let event = classesReplacedWithCount(BigInt.fromI32(300), 2, 1);
      setupHybridVotingContract(event.address);

      // Two versions left active by the pre-fix handler. Sweeping only contract.classVersion
      // would strand v100, so this is what pins the sweep to the derived loader.
      seedActiveVotingClass(event.address, BigInt.fromI32(100), 0);
      seedActiveVotingClass(event.address, BigInt.fromI32(200), 0);

      handleClassesReplaced(event);

      assert.fieldEquals("VotingClass", votingClassId(event.address, 100, 0, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(event.address, 200, 0, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(event.address, 300, 1, 0), "isActive", "true");
    });

    test("a proposal between two same-block setClasses keeps the config it was created under", () => {
      // Config A: 60/40.
      let a = classesReplacedWithSlice(BigInt.fromI32(100), 60, 1);
      setupHybridVotingContract(a.address);
      handleClassesReplaced(a);
      let changeA = a.transaction.hash.concatI32(a.logIndex.toI32()).toHexString();

      let proposalEvent = createNewProposalEvent(
        BigInt.fromI32(0),
        Bytes.fromUTF8("Created under A"),
        Bytes.fromHexString(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        ),
        2,
        1700003600 as i64,
        1700000000 as i64
      );
      handleNewProposal(proposalEvent);

      let proposalId = a.address.toHexString() + "-0";
      assert.fieldEquals("Proposal", proposalId, "classesChange", changeA);

      // Config B: 30/70, same block, so classesVersion alone can no longer tell them apart.
      let b = classesReplacedWithSlice(BigInt.fromI32(100), 30, 2);
      handleClassesReplaced(b);
      let changeB = b.transaction.hash.concatI32(b.logIndex.toI32()).toHexString();

      // The proposal still resolves to A, and A's contents are intact.
      assert.fieldEquals("Proposal", proposalId, "classesVersion", "100");
      assert.fieldEquals("Proposal", proposalId, "classesChange", changeA);
      assert.fieldEquals("VotingClass", votingClassId(a.address, 100, 1, 0), "slicePct", "60");
      assert.fieldEquals("VotingClass", votingClassId(a.address, 100, 1, 1), "slicePct", "40");
      // Pins the join the schema advertises — classesChange { votingClasses }.
      assert.fieldEquals("VotingClass", votingClassId(a.address, 100, 1, 0), "change", changeA);
      assert.fieldEquals("VotingClass", votingClassId(a.address, 100, 2, 0), "change", changeB);

      // B is what the contract now points at as live.
      assert.fieldEquals("VotingClass", votingClassId(a.address, 100, 2, 0), "slicePct", "30");
      assert.fieldEquals(
        "HybridVotingContract",
        a.address.toHexString(),
        "classesChange",
        changeB
      );
    });

    test("an L1-shared version does not collide across indexed blocks", () => {
      // Arbitrum: the contract's block.number is the L1 block, so one `version` spans ~48 indexed
      // L2 blocks. Two emissions can therefore share a version AND a logIndex (it restarts each
      // L2 block). Keying rows on version would silently merge them.
      let a = classesReplacedWithSlice(BigInt.fromI32(100), 60, 3);
      a.block.number = BigInt.fromI32(500);
      setupHybridVotingContract(a.address);
      handleClassesReplaced(a);
      let changeA = a.transaction.hash.concatI32(a.logIndex.toI32()).toHexString();

      let b = classesReplacedWithSlice(BigInt.fromI32(100), 30, 3);
      b.block.number = BigInt.fromI32(530);
      // Distinct tx hash — same L1 version, same logIndex, different indexed block.
      b.transaction.hash = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      handleClassesReplaced(b);
      let changeB = b.transaction.hash.concatI32(b.logIndex.toI32()).toHexString();

      assert.entityCount("VotingClass", 4);
      assert.entityCount("VotingClassChange", 2);

      // Both configs survive intact under the same version.
      assert.fieldEquals("VotingClass", votingClassId(a.address, 500, 3, 0), "slicePct", "60");
      assert.fieldEquals("VotingClass", votingClassId(a.address, 500, 3, 0), "version", "100");
      assert.fieldEquals("VotingClass", votingClassId(a.address, 500, 3, 0), "change", changeA);
      assert.fieldEquals("VotingClass", votingClassId(a.address, 530, 3, 0), "slicePct", "30");
      assert.fieldEquals("VotingClass", votingClassId(a.address, 530, 3, 0), "version", "100");
      assert.fieldEquals("VotingClass", votingClassId(a.address, 530, 3, 0), "change", changeB);

      // Only the later emission is live.
      assert.fieldEquals("VotingClass", votingClassId(a.address, 500, 3, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(a.address, 530, 3, 0), "isActive", "true");

      // changedAtBlock is the tiebreaker for same-version emissions; logIndex alone is not.
      assert.fieldEquals("VotingClassChange", changeA, "changedAtBlock", "500");
      assert.fieldEquals("VotingClassChange", changeB, "changedAtBlock", "530");
      assert.fieldEquals("VotingClassChange", changeA, "logIndex", "3");
      assert.fieldEquals("VotingClassChange", changeB, "logIndex", "3");
    });

    test("hat-restricted proposals snapshot the class config too", () => {
      let first = classesReplacedWithSlice(BigInt.fromI32(100), 60, 1);
      setupHybridVotingContract(first.address);
      handleClassesReplaced(first);
      let changeA = first.transaction.hash.concatI32(first.logIndex.toI32()).toHexString();

      let event = createNewHatProposalEvent(
        BigInt.fromI32(0),
        Bytes.fromUTF8("Hat proposal under A"),
        Bytes.fromHexString(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        ),
        2,
        1700003600 as i64,
        1700000000 as i64,
        [BigInt.fromI32(1001)]
      );
      handleNewHatProposal(event);

      handleClassesReplaced(classesReplacedWithSlice(BigInt.fromI32(100), 30, 2));

      let proposalId = first.address.toHexString() + "-0";
      assert.fieldEquals("Proposal", proposalId, "classesChange", changeA);
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 1, 0), "slicePct", "60");
    });

    test("a proposal's snapshot version still resolves after its config is superseded", () => {
      let first = classesReplacedWithCount(BigInt.fromI32(100), 2, 1);
      setupHybridVotingContract(first.address);
      handleClassesReplaced(first);

      let proposalEvent = createNewProposalEvent(
        BigInt.fromI32(0),
        Bytes.fromUTF8("Proposal under v100"),
        Bytes.fromHexString(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        ),
        2,
        1700003600 as i64,
        1700000000 as i64
      );
      handleNewProposal(proposalEvent);

      let proposalId = first.address.toHexString() + "-0";
      assert.fieldEquals("Proposal", proposalId, "classesVersion", "100");

      handleClassesReplaced(classesReplacedWithCount(BigInt.fromI32(200), 2, 2));

      // The snapshot rows survive the flip — reconstruct by version, never by isActive.
      assert.fieldEquals("Proposal", proposalId, "classesVersion", "100");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 1, 0), "version", "100");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 1, 0), "isActive", "false");
      assert.fieldEquals("VotingClass", votingClassId(first.address, 100, 1, 1), "version", "100");
    });
  });
});
