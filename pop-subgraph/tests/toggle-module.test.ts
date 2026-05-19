import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  handleToggleModuleInitialized,
  handleHatToggled,
  handleAdminTransferred
} from "../src/toggle-module";
import {
  createToggleModuleInitializedEvent,
  createHatToggledEvent,
  createAdminTransferredEvent
} from "./toggle-module-utils";
import {
  Organization,
  ExecutorContract,
  ToggleModuleContract,
  HybridVotingContract,
  DirectDemocracyVotingContract,
  EligibilityModuleContract,
  ParticipationTokenContract,
  QuickJoinContract,
  EducationHubContract,
  PaymentManagerContract,
  TaskManager
} from "../generated/schema";

/**
 * Helper function to create necessary entities for toggle module tests.
 * Creates an Organization and ToggleModuleContract entity.
 */
function setupToggleModuleEntities(): void {
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

  // Create ToggleModuleContract entity with the default mock event address
  let toggleModuleAddress = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
  let toggleModule = new ToggleModuleContract(toggleModuleAddress);
  toggleModule.organization = orgId;
  toggleModule.admin = Address.zero();
  toggleModule.createdAt = BigInt.fromI32(1000);
  toggleModule.createdAtBlock = BigInt.fromI32(100);

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
  toggleModule.save();
  executor.save();
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

describe("ToggleModule", () => {
  afterEach(() => {
    clearStore();
  });

  test("ToggleModuleInitialized updates ToggleModuleContract admin", () => {
    setupToggleModuleEntities();

    let admin = Address.fromString("0x0000000000000000000000000000000000000001");
    let event = createToggleModuleInitializedEvent(admin);
    handleToggleModuleInitialized(event);

    assert.fieldEquals(
      "ToggleModuleContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "admin",
      "0x0000000000000000000000000000000000000001"
    );
  });

  test("HatToggled creates HatToggleEvent entity with active status", () => {
    setupToggleModuleEntities();

    let hatId = BigInt.fromI32(1001);
    let event = createHatToggledEvent(hatId, true);
    handleHatToggled(event);

    assert.entityCount("HatToggleEvent", 1);
  });

  test("HatToggled creates HatToggleEvent entity with inactive status", () => {
    setupToggleModuleEntities();

    let hatId = BigInt.fromI32(1001);
    let event = createHatToggledEvent(hatId, false);
    handleHatToggled(event);

    assert.entityCount("HatToggleEvent", 1);
  });

  test("Multiple HatToggled events create separate HatToggleEvent entities", () => {
    setupToggleModuleEntities();

    // Toggle hat on
    let hatId = BigInt.fromI32(1001);
    let event1 = createHatToggledEvent(hatId, true);
    handleHatToggled(event1);

    // Toggle hat off
    let event2 = createHatToggledEvent(hatId, false);
    // Need to change the log index to get a different ID (default is 1)
    event2.logIndex = BigInt.fromI32(2);
    handleHatToggled(event2);

    assert.entityCount("HatToggleEvent", 2);
  });

  test("AdminTransferred updates ToggleModuleContract and creates ToggleAdminTransfer", () => {
    setupToggleModuleEntities();

    let oldAdmin = Address.fromString("0x0000000000000000000000000000000000000001");
    let newAdmin = Address.fromString("0x0000000000000000000000000000000000000002");
    let event = createAdminTransferredEvent(oldAdmin, newAdmin);
    handleAdminTransferred(event);

    assert.fieldEquals(
      "ToggleModuleContract",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "admin",
      "0x0000000000000000000000000000000000000002"
    );
    assert.entityCount("ToggleAdminTransfer", 1);
  });
});
