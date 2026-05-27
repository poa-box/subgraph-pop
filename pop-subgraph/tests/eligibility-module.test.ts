import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";

/**
 * Helper function to convert bytes32 sha256 digest to IPFS CIDv0.
 * Mirrors the logic in eligibility-module.ts for test assertions.
 */
function bytes32ToCid(hash: Bytes): string {
  let prefix = Bytes.fromHexString("0x1220");
  let multihash = new Bytes(34);
  for (let i = 0; i < 2; i++) {
    multihash[i] = prefix[i];
  }
  for (let i = 0; i < 32; i++) {
    multihash[i + 2] = hash[i];
  }
  return multihash.toBase58();
}
import {
  handleHatMetadataUpdated,
  handleHatCreatedWithEligibility,
  handleDefaultEligibilityUpdated,
  handleRoleApplicationSubmitted,
  handleRoleApplicationWithdrawn
} from "../src/eligibility-module";
import {
  createHatMetadataUpdatedEvent,
  createHatCreatedWithEligibilityEvent,
  createDefaultEligibilityUpdatedEvent,
  createRoleApplicationSubmittedEvent,
  createRoleApplicationWithdrawnEvent
} from "./eligibility-module-utils";
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
  TaskManager,
  Hat,
  Role,
  RoleApplication
} from "../generated/schema";

/**
 * Helper function to create necessary entities for eligibility module tests.
 * Creates an Organization and EligibilityModuleContract entity.
 */
function setupEligibilityModuleEntities(): void {
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

  // Create EligibilityModuleContract entity with the default mock event address
  let eligibilityModuleAddress = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
  let eligibilityModule = new EligibilityModuleContract(eligibilityModuleAddress);
  eligibilityModule.organization = orgId;
  eligibilityModule.superAdmin = Address.zero();
  eligibilityModule.hatsContract = Address.zero();
  eligibilityModule.toggleModule = Address.zero();
  eligibilityModule.isPaused = false;
  eligibilityModule.createdAt = BigInt.fromI32(1000);
  eligibilityModule.createdAtBlock = BigInt.fromI32(100);

  // Create ToggleModuleContract entity
  let toggleModuleAddress = Address.fromString("0x0000000000000000000000000000000000000010");
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
  taskManager.creatorHatIds = [BigInt.fromI32(1002)];
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
  eligibilityModule.save();
  toggleModule.save();
  executor.save();
  taskManager.save();
  hybridVoting.save();
  ddv.save();
  participationToken.save();
  quickJoin.save();
  educationHub.save();
  paymentManager.save();
  organization.save();
}

/**
 * Creates a Hat entity for testing metadata updates.
 */
function createHatEntity(hatId: BigInt): void {
  let eligibilityModuleAddress = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
  let hatEntityId = eligibilityModuleAddress.toHexString() + "-" + hatId.toString();

  let hat = new Hat(hatEntityId);
  hat.hatId = hatId;
  hat.parentHatId = BigInt.fromI32(1000);
  hat.level = 1;
  hat.eligibilityModule = eligibilityModuleAddress;
  hat.creator = Address.zero();
  hat.defaultEligible = true;
  hat.defaultStanding = true;
  hat.mintedCount = BigInt.fromI32(0);
  hat.active = true;
  hat.createdAt = BigInt.fromI32(1000);
  hat.createdAtBlock = BigInt.fromI32(100);
  hat.transactionHash = Bytes.fromHexString("0xabcd");
  hat.save();
}

describe("EligibilityModule - HatMetadataUpdated", () => {
  afterEach(() => {
    clearStore();
  });

  test("HatMetadataUpdated updates Hat entity with metadata", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(1001);
    createHatEntity(hatId);

    let name = "ADMIN";
    let metadataCID = Bytes.fromHexString("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");

    let event = createHatMetadataUpdatedEvent(hatId, name, metadataCID);
    handleHatMetadataUpdated(event);

    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";
    assert.fieldEquals("Hat", hatEntityId, "name", "ADMIN");
    assert.fieldEquals("Hat", hatEntityId, "metadataCID", metadataCID.toHexString());
    // Verify metadata link is set to CIDv0 format for IPFS fetching
    assert.fieldEquals("Hat", hatEntityId, "metadata", bytes32ToCid(metadataCID));
  });

  test("HatMetadataUpdated sets metadata link to CIDv0 format", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(1001);
    createHatEntity(hatId);

    let name = "ROLE_NAME";
    let metadataCID = Bytes.fromHexString("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

    let event = createHatMetadataUpdatedEvent(hatId, name, metadataCID);
    handleHatMetadataUpdated(event);

    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";
    // Verify metadata field is set to the CIDv0 format (base58 encoded)
    assert.fieldEquals("Hat", hatEntityId, "metadata", bytes32ToCid(metadataCID));
  });

  test("HatMetadataUpdated does NOT set metadata link for zero hash", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(1001);
    createHatEntity(hatId);

    let name = "EMPTY_META";
    // Zero hash indicates no IPFS metadata
    let metadataCID = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");

    let event = createHatMetadataUpdatedEvent(hatId, name, metadataCID);
    handleHatMetadataUpdated(event);

    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";
    // Name should still be set
    assert.fieldEquals("Hat", hatEntityId, "name", "EMPTY_META");
    // metadataCID should still be stored
    assert.fieldEquals("Hat", hatEntityId, "metadataCID", metadataCID.toHexString());
    // But metadata link should NOT be set (no IPFS data source created)
    assert.assertNull(Hat.load(hatEntityId)!.metadata);
  });

  test("HatMetadataUpdated creates event history entity", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(1001);
    createHatEntity(hatId);

    let event = createHatMetadataUpdatedEvent(
      hatId,
      "MEMBER",
      Bytes.fromHexString("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")
    );
    handleHatMetadataUpdated(event);

    assert.entityCount("HatMetadataUpdateEvent", 1);
  });

  test("Multiple HatMetadataUpdated events create separate history entities and update metadata link", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(1001);
    createHatEntity(hatId);

    let firstCID = Bytes.fromHexString("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
    let secondCID = Bytes.fromHexString("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

    // First update
    let event1 = createHatMetadataUpdatedEvent(
      hatId,
      "ADMIN",
      firstCID
    );
    handleHatMetadataUpdated(event1);

    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";
    // Verify first metadata link
    assert.fieldEquals("Hat", hatEntityId, "metadata", bytes32ToCid(firstCID));

    // Second update with different log index
    let event2 = createHatMetadataUpdatedEvent(
      hatId,
      "SUPER_ADMIN",
      secondCID
    );
    event2.logIndex = BigInt.fromI32(2);
    handleHatMetadataUpdated(event2);

    assert.entityCount("HatMetadataUpdateEvent", 2);

    // Verify hat has latest metadata
    assert.fieldEquals("Hat", hatEntityId, "name", "SUPER_ADMIN");
    // Verify metadata link is updated to new CID
    assert.fieldEquals("Hat", hatEntityId, "metadata", bytes32ToCid(secondCID));
  });

  test("HatMetadataUpdated for non-existent hat does not create event", () => {
    setupEligibilityModuleEntities();

    // Don't create the hat entity - it shouldn't exist
    let hatId = BigInt.fromI32(9999);
    let event = createHatMetadataUpdatedEvent(
      hatId,
      "GHOST",
      Bytes.fromHexString("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
    );
    handleHatMetadataUpdated(event);

    // Should not create event entity since hat doesn't exist
    assert.entityCount("HatMetadataUpdateEvent", 0);
  });
});

describe("EligibilityModule - DefaultEligibilityUpdated", () => {
  afterEach(() => {
    clearStore();
  });

  test("DefaultEligibilityUpdated creates Hat entity when hat does not exist", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(2001);
    let admin = Address.fromString("0x0000000000000000000000000000000000000099");

    let event = createDefaultEligibilityUpdatedEvent(hatId, true, true, admin);
    handleDefaultEligibilityUpdated(event);

    // Hat entity should be created
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-2001";
    assert.entityCount("Hat", 1);
    assert.fieldEquals("Hat", hatEntityId, "hatId", "2001");
    assert.fieldEquals("Hat", hatEntityId, "defaultEligible", "true");
    assert.fieldEquals("Hat", hatEntityId, "defaultStanding", "true");
  });

  test("DefaultEligibilityUpdated creates Role entity and links Hat to Role", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(2002);
    let admin = Address.fromString("0x0000000000000000000000000000000000000099");

    let event = createDefaultEligibilityUpdatedEvent(hatId, true, true, admin);
    handleDefaultEligibilityUpdated(event);

    // Role entity should be created
    let orgId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
    let roleId = orgId.toHexString() + "-" + hatId.toString();
    assert.entityCount("Role", 1);
    assert.fieldEquals("Role", roleId, "hatId", "2002");

    // Role.hat should link to the Hat entity
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-2002";
    assert.fieldEquals("Role", roleId, "hat", hatEntityId);
  });

  test("DefaultEligibilityUpdated updates existing Hat without creating duplicate Role", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(2003);
    let admin = Address.fromString("0x0000000000000000000000000000000000000099");

    // First event - creates Hat and Role
    let event1 = createDefaultEligibilityUpdatedEvent(hatId, true, true, admin);
    handleDefaultEligibilityUpdated(event1);

    // Verify Hat and Role were created
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-2003";
    let orgId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
    let roleId = orgId.toHexString() + "-" + hatId.toString();

    assert.entityCount("Hat", 1);
    assert.entityCount("Role", 1);
    assert.fieldEquals("Hat", hatEntityId, "defaultEligible", "true");

    // Second event with same hatId - should update Hat but not create another Role
    let event2 = createDefaultEligibilityUpdatedEvent(hatId, false, false, admin);
    event2.logIndex = BigInt.fromI32(2);
    handleDefaultEligibilityUpdated(event2);

    // Should still have only 1 Hat and 1 Role
    assert.entityCount("Hat", 1);
    assert.entityCount("Role", 1);

    // Hat should be updated with new eligibility values
    assert.fieldEquals("Hat", hatEntityId, "defaultEligible", "false");
    assert.fieldEquals("Hat", hatEntityId, "defaultStanding", "false");
  });

  test("DefaultEligibilityUpdated does not duplicate Role link on existing Hat", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(1001);  // Use roleHatId that's already in org
    createHatEntity(hatId);

    // Create a Role entity to simulate what would have been created when the Hat was first indexed
    let orgId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
    let roleId = orgId.toHexString() + "-" + hatId.toString();
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";
    let role = new Role(roleId);
    role.organization = orgId;
    role.hatId = hatId;
    role.hat = hatEntityId;
    role.createdAt = BigInt.fromI32(1000);
    role.createdAtBlock = BigInt.fromI32(100);
    role.transactionHash = Bytes.fromHexString("0xabcd");
    role.save();

    let admin = Address.fromString("0x0000000000000000000000000000000000000099");

    // Event for existing Hat - should NOT create a new Role link
    let event = createDefaultEligibilityUpdatedEvent(hatId, false, true, admin);
    handleDefaultEligibilityUpdated(event);

    // Hat should be updated
    assert.fieldEquals("Hat", hatEntityId, "defaultEligible", "false");
    assert.fieldEquals("Hat", hatEntityId, "defaultStanding", "true");

    // Only one Role should exist (not duplicated)
    assert.entityCount("Role", 1);
  });

  test("HatCreatedWithEligibility creates Hat and links to Role", () => {
    setupEligibilityModuleEntities();

    let creator = Address.fromString("0x0000000000000000000000000000000000000099");
    let parentHatId = BigInt.fromI32(1000);
    let newHatId = BigInt.fromI32(3001);

    let event = createHatCreatedWithEligibilityEvent(
      creator,
      parentHatId,
      newHatId,
      true,
      true,
      BigInt.fromI32(0)
    );
    handleHatCreatedWithEligibility(event);

    // Hat should be created
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-3001";
    assert.entityCount("Hat", 1);
    assert.fieldEquals("Hat", hatEntityId, "hatId", "3001");
    assert.fieldEquals("Hat", hatEntityId, "parentHatId", "1000");

    // Role should be created and linked
    let orgId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
    let roleId = orgId.toHexString() + "-" + newHatId.toString();
    assert.entityCount("Role", 1);
    assert.fieldEquals("Role", roleId, "hat", hatEntityId);

    // Governance-created hats join the org's role list so the frontend
    // surfaces them in role pickers without a redeploy.
    assert.fieldEquals(
      "Organization",
      orgId.toHexString(),
      "roleHatIds",
      "[1001, 1002, 3001]"
    );
    assert.fieldEquals("Role", roleId, "isUserRole", "true");
  });

  test("HatCreatedWithEligibility is idempotent on roleHatIds", () => {
    setupEligibilityModuleEntities();

    let creator = Address.fromString("0x0000000000000000000000000000000000000099");
    let parentHatId = BigInt.fromI32(1000);
    let newHatId = BigInt.fromI32(3001);

    let event = createHatCreatedWithEligibilityEvent(
      creator, parentHatId, newHatId, true, true, BigInt.fromI32(0)
    );
    handleHatCreatedWithEligibility(event);
    handleHatCreatedWithEligibility(event);

    let orgId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
    assert.fieldEquals(
      "Organization",
      orgId.toHexString(),
      "roleHatIds",
      "[1001, 1002, 3001]"
    );
  });
});

describe("EligibilityModule - RoleApplications", () => {
  afterEach(() => {
    clearStore();
  });

  test("RoleApplicationSubmitted creates RoleApplication entity", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(1001);
    let applicant = Address.fromString("0x0000000000000000000000000000000000000099");
    let applicationHash = Bytes.fromHexString(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );

    let event = createRoleApplicationSubmittedEvent(hatId, applicant, applicationHash);
    handleRoleApplicationSubmitted(event);

    let applicationId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001-0x0000000000000000000000000000000000000099";
    assert.entityCount("RoleApplication", 1);
    assert.fieldEquals("RoleApplication", applicationId, "hatId", "1001");
    assert.fieldEquals("RoleApplication", applicationId, "active", "true");
    assert.fieldEquals(
      "RoleApplication",
      applicationId,
      "applicant",
      "0x0000000000000000000000000000000000000099"
    );
    assert.fieldEquals(
      "RoleApplication",
      applicationId,
      "applicationHash",
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );
  });

  test("RoleApplicationWithdrawn marks application as inactive", () => {
    setupEligibilityModuleEntities();

    let hatId = BigInt.fromI32(1001);
    let applicant = Address.fromString("0x0000000000000000000000000000000000000099");
    let applicationHash = Bytes.fromHexString(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );

    // First submit an application
    let submitEvent = createRoleApplicationSubmittedEvent(hatId, applicant, applicationHash);
    handleRoleApplicationSubmitted(submitEvent);

    // Then withdraw it
    let withdrawEvent = createRoleApplicationWithdrawnEvent(hatId, applicant);
    withdrawEvent.logIndex = BigInt.fromI32(2);
    handleRoleApplicationWithdrawn(withdrawEvent);

    let applicationId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001-0x0000000000000000000000000000000000000099";
    assert.fieldEquals("RoleApplication", applicationId, "active", "false");
  });
});
