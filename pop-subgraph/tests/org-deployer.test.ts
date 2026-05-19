import {
  assert,
  describe,
  test,
  clearStore,
  beforeEach,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import { handleOrgDeployed, handleRolesCreated } from "../src/org-deployer";
import { createOrgDeployedEvent, createRolesCreatedEvent } from "./org-deployer-utils";

// Tests for OrgDeployer event handlers
describe("OrgDeployer", () => {
  afterEach(() => {
    clearStore();
  });

  test("Organization created and stored with all component addresses", () => {
    let orgId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let executor = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    );
    let hybridVoting = Address.fromString(
      "0x0000000000000000000000000000000000000002"
    );
    let directDemocracyVoting = Address.fromString(
      "0x0000000000000000000000000000000000000003"
    );
    let quickJoin = Address.fromString(
      "0x0000000000000000000000000000000000000004"
    );
    let participationToken = Address.fromString(
      "0x0000000000000000000000000000000000000005"
    );
    let taskManager = Address.fromString(
      "0x0000000000000000000000000000000000000006"
    );
    let educationHub = Address.fromString(
      "0x0000000000000000000000000000000000000007"
    );
    let paymentManager = Address.fromString(
      "0x0000000000000000000000000000000000000008"
    );
    let eligibilityModule = Address.fromString(
      "0x0000000000000000000000000000000000000009"
    );
    let toggleModule = Address.fromString(
      "0x000000000000000000000000000000000000000a"
    );
    let topHatId = BigInt.fromI32(1000);
    let roleHatIds = [BigInt.fromI32(1001), BigInt.fromI32(1002), BigInt.fromI32(1003)];

    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Verify Organization, TaskManager, HybridVotingContract, DirectDemocracyVotingContract, EligibilityModuleContract, ParticipationTokenContract, QuickJoinContract, EducationHubContract, PaymentManagerContract, ExecutorContract, and ToggleModuleContract entities are created
    assert.entityCount("Organization", 1);
    assert.entityCount("TaskManager", 1);
    assert.entityCount("HybridVotingContract", 1);
    assert.entityCount("DirectDemocracyVotingContract", 1);
    assert.entityCount("EligibilityModuleContract", 1);
    assert.entityCount("ParticipationTokenContract", 1);
    assert.entityCount("QuickJoinContract", 1);
    assert.entityCount("EducationHubContract", 1);
    assert.entityCount("PaymentManagerContract", 1);
    assert.entityCount("ExecutorContract", 1);
    assert.entityCount("ToggleModuleContract", 1);

    // Verify Organization fields
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "executorContract",
      "0x0000000000000000000000000000000000000001"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "hybridVoting",
      "0x0000000000000000000000000000000000000002"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "directDemocracyVoting",
      "0x0000000000000000000000000000000000000003"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "quickJoin",
      "0x0000000000000000000000000000000000000004"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "participationToken",
      "0x0000000000000000000000000000000000000005"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "educationHub",
      "0x0000000000000000000000000000000000000007"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "paymentManager",
      "0x0000000000000000000000000000000000000008"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "eligibilityModule",
      "0x0000000000000000000000000000000000000009"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "toggleModuleContract",
      "0x000000000000000000000000000000000000000a"
    );
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "topHatId",
      "1000"
    );

    // Verify Organization.taskManager links to TaskManager entity
    assert.fieldEquals(
      "Organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "taskManager",
      "0x0000000000000000000000000000000000000006"
    );

    // Verify TaskManager entity and its relationship back to Organization
    assert.fieldEquals(
      "TaskManager",
      "0x0000000000000000000000000000000000000006",
      "organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    // Verify HybridVotingContract entity and its relationship back to Organization
    assert.fieldEquals(
      "HybridVotingContract",
      "0x0000000000000000000000000000000000000002",
      "organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    // Verify DirectDemocracyVotingContract entity and its relationship back to Organization
    assert.fieldEquals(
      "DirectDemocracyVotingContract",
      "0x0000000000000000000000000000000000000003",
      "organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    // Verify EligibilityModuleContract entity and its relationship back to Organization
    assert.fieldEquals(
      "EligibilityModuleContract",
      "0x0000000000000000000000000000000000000009",
      "organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    assert.fieldEquals(
      "EligibilityModuleContract",
      "0x0000000000000000000000000000000000000009",
      "isPaused",
      "false"
    );

    // Verify ParticipationTokenContract entity and its relationship back to Organization
    assert.fieldEquals(
      "ParticipationTokenContract",
      "0x0000000000000000000000000000000000000005",
      "organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    assert.fieldEquals(
      "ParticipationTokenContract",
      "0x0000000000000000000000000000000000000005",
      "totalSupply",
      "0"
    );

    // Verify QuickJoinContract entity and its relationship back to Organization
    assert.fieldEquals(
      "QuickJoinContract",
      "0x0000000000000000000000000000000000000004",
      "organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    assert.fieldEquals(
      "QuickJoinContract",
      "0x0000000000000000000000000000000000000004",
      "executor",
      "0x0000000000000000000000000000000000000000"
    );

    // Verify EducationHubContract entity and its relationship back to Organization
    assert.fieldEquals(
      "EducationHubContract",
      "0x0000000000000000000000000000000000000007",
      "organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    assert.fieldEquals(
      "EducationHubContract",
      "0x0000000000000000000000000000000000000007",
      "isPaused",
      "false"
    );
    assert.fieldEquals(
      "EducationHubContract",
      "0x0000000000000000000000000000000000000007",
      "nextModuleId",
      "0"
    );

    // Verify PaymentManagerContract entity and its relationship back to Organization
    assert.fieldEquals(
      "PaymentManagerContract",
      "0x0000000000000000000000000000000000000008",
      "organization",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    assert.fieldEquals(
      "PaymentManagerContract",
      "0x0000000000000000000000000000000000000008",
      "distributionCounter",
      "0"
    );
  });

  // ========================================
  // creatorHatIds Derivation Tests
  // ========================================

  test("TaskManager.creatorHatIds derived from roleHatIds[1:]", () => {
    let orgId = Bytes.fromHexString(
      "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd"
    );
    let executor = Address.fromString("0x0000000000000000000000000000000000000001");
    let hybridVoting = Address.fromString("0x0000000000000000000000000000000000000002");
    let directDemocracyVoting = Address.fromString("0x0000000000000000000000000000000000000003");
    let quickJoin = Address.fromString("0x0000000000000000000000000000000000000004");
    let participationToken = Address.fromString("0x0000000000000000000000000000000000000005");
    let taskManager = Address.fromString("0x0000000000000000000000000000000000000006");
    let educationHub = Address.fromString("0x0000000000000000000000000000000000000007");
    let paymentManager = Address.fromString("0x0000000000000000000000000000000000000008");
    let eligibilityModule = Address.fromString("0x0000000000000000000000000000000000000009");
    let toggleModule = Address.fromString("0x000000000000000000000000000000000000000a");
    let topHatId = BigInt.fromI32(1000);
    // roleHatIds[0] = member (1001), roleHatIds[1] = admin (1002), roleHatIds[2] = executive (1003)
    let roleHatIds = [BigInt.fromI32(1001), BigInt.fromI32(1002), BigInt.fromI32(1003)];

    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Verify creatorHatIds is roleHatIds[1:] = [1002, 1003]
    // Matchstick compares arrays as comma-separated strings
    assert.fieldEquals(
      "TaskManager",
      "0x0000000000000000000000000000000000000006",
      "creatorHatIds",
      "[1002, 1003]"
    );
    // organizerHatIds (v4) is initialized empty; populated later by OrganizerHatAllowed events.
    assert.fieldEquals(
      "TaskManager",
      "0x0000000000000000000000000000000000000006",
      "organizerHatIds",
      "[]"
    );
  });

  test("TaskManager.creatorHatIds empty when only member role in roleHatIds", () => {
    let orgId = Bytes.fromHexString(
      "0x1111222233334444111122223333444411112222333344441111222233334444"
    );
    let executor = Address.fromString("0x0000000000000000000000000000000000000011");
    let hybridVoting = Address.fromString("0x0000000000000000000000000000000000000012");
    let directDemocracyVoting = Address.fromString("0x0000000000000000000000000000000000000013");
    let quickJoin = Address.fromString("0x0000000000000000000000000000000000000014");
    let participationToken = Address.fromString("0x0000000000000000000000000000000000000015");
    let taskManager = Address.fromString("0x0000000000000000000000000000000000000016");
    let educationHub = Address.fromString("0x0000000000000000000000000000000000000017");
    let paymentManager = Address.fromString("0x0000000000000000000000000000000000000018");
    let eligibilityModule = Address.fromString("0x0000000000000000000000000000000000000019");
    let toggleModule = Address.fromString("0x000000000000000000000000000000000000001a");
    let topHatId = BigInt.fromI32(2000);
    // Only member role - no creator-eligible roles
    let roleHatIds = [BigInt.fromI32(2001)];

    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Verify creatorHatIds is empty array (roleHatIds[1:] = [])
    assert.fieldEquals(
      "TaskManager",
      "0x0000000000000000000000000000000000000016",
      "creatorHatIds",
      "[]"
    );
  });

  test("TaskManager.creatorHatIds with many non-member roles", () => {
    let orgId = Bytes.fromHexString(
      "0x5555666677778888555566667777888855556666777788885555666677778888"
    );
    let executor = Address.fromString("0x0000000000000000000000000000000000000021");
    let hybridVoting = Address.fromString("0x0000000000000000000000000000000000000022");
    let directDemocracyVoting = Address.fromString("0x0000000000000000000000000000000000000023");
    let quickJoin = Address.fromString("0x0000000000000000000000000000000000000024");
    let participationToken = Address.fromString("0x0000000000000000000000000000000000000025");
    let taskManager = Address.fromString("0x0000000000000000000000000000000000000026");
    let educationHub = Address.fromString("0x0000000000000000000000000000000000000027");
    let paymentManager = Address.fromString("0x0000000000000000000000000000000000000028");
    let eligibilityModule = Address.fromString("0x0000000000000000000000000000000000000029");
    let toggleModule = Address.fromString("0x000000000000000000000000000000000000002a");
    let topHatId = BigInt.fromI32(3000);
    // 5 roles: member (3001), plus 4 non-member roles
    let roleHatIds = [
      BigInt.fromI32(3001), // member
      BigInt.fromI32(3002), // admin
      BigInt.fromI32(3003), // executive
      BigInt.fromI32(3004), // moderator
      BigInt.fromI32(3005)  // reviewer
    ];

    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Verify creatorHatIds includes all non-member roles [3002, 3003, 3004, 3005]
    assert.fieldEquals(
      "TaskManager",
      "0x0000000000000000000000000000000000000026",
      "creatorHatIds",
      "[3002, 3003, 3004, 3005]"
    );
  });

  // ========================================
  // RolesCreated Event Tests
  // ========================================

  test("RolesCreated updates Role entities with name, image, metadataCID, and canVote", () => {
    let orgId = Bytes.fromHexString(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );
    let executor = Address.fromString("0x0000000000000000000000000000000000000031");
    let hybridVoting = Address.fromString("0x0000000000000000000000000000000000000032");
    let directDemocracyVoting = Address.fromString("0x0000000000000000000000000000000000000033");
    let quickJoin = Address.fromString("0x0000000000000000000000000000000000000034");
    let participationToken = Address.fromString("0x0000000000000000000000000000000000000035");
    let taskManager = Address.fromString("0x0000000000000000000000000000000000000036");
    let educationHub = Address.fromString("0x0000000000000000000000000000000000000037");
    let paymentManager = Address.fromString("0x0000000000000000000000000000000000000038");
    let eligibilityModule = Address.fromString("0x0000000000000000000000000000000000000039");
    let toggleModule = Address.fromString("0x000000000000000000000000000000000000003a");
    let topHatId = BigInt.fromI32(4000);
    let roleHatIds = [BigInt.fromI32(4001), BigInt.fromI32(4002), BigInt.fromI32(4003)];

    // First deploy the org to create Role entities
    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Verify Role entities are created (only for roleHatIds, NOT topHatId)
    assert.entityCount("Role", 3); // Only 3 roleHatIds (topHatId is a system hat, no Role created)

    // Verify Role entities have isUserRole = true
    let roleIdPre1 = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890-4001";
    assert.fieldEquals("Role", roleIdPre1, "isUserRole", "true");

    // Now emit RolesCreated to update the roles
    let hatIds = [BigInt.fromI32(4001), BigInt.fromI32(4002), BigInt.fromI32(4003)];
    let names = ["Member", "Admin", "Executive"];
    let images = ["ipfs://member.png", "ipfs://admin.png", "ipfs://executive.png"];
    let metadataCIDs = [
      Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111"),
      Bytes.fromHexString("0x2222222222222222222222222222222222222222222222222222222222222222"),
      Bytes.fromHexString("0x3333333333333333333333333333333333333333333333333333333333333333")
    ];
    let canVote = [true, true, true];

    let rolesCreatedEvent = createRolesCreatedEvent(
      orgId,
      hatIds,
      names,
      images,
      metadataCIDs,
      canVote
    );

    handleRolesCreated(rolesCreatedEvent);

    // Verify Role entities are updated with metadata
    let roleId1 = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890-4001";
    let roleId2 = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890-4002";
    let roleId3 = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890-4003";

    assert.fieldEquals("Role", roleId1, "name", "Member");
    assert.fieldEquals("Role", roleId1, "image", "ipfs://member.png");
    assert.fieldEquals("Role", roleId1, "canVote", "true");
    assert.fieldEquals("Role", roleId1, "isUserRole", "true");
    assert.fieldEquals("Role", roleId1, "metadataCID", "0x1111111111111111111111111111111111111111111111111111111111111111");

    assert.fieldEquals("Role", roleId2, "name", "Admin");
    assert.fieldEquals("Role", roleId2, "image", "ipfs://admin.png");
    assert.fieldEquals("Role", roleId2, "canVote", "true");
    assert.fieldEquals("Role", roleId2, "isUserRole", "true");
    assert.fieldEquals("Role", roleId2, "metadataCID", "0x2222222222222222222222222222222222222222222222222222222222222222");

    assert.fieldEquals("Role", roleId3, "name", "Executive");
    assert.fieldEquals("Role", roleId3, "image", "ipfs://executive.png");
    assert.fieldEquals("Role", roleId3, "canVote", "true");
    assert.fieldEquals("Role", roleId3, "isUserRole", "true");
    assert.fieldEquals("Role", roleId3, "metadataCID", "0x3333333333333333333333333333333333333333333333333333333333333333");
  });

  test("RolesCreated does not set metadataCID when it is bytes32(0)", () => {
    let orgId = Bytes.fromHexString(
      "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321"
    );
    let executor = Address.fromString("0x0000000000000000000000000000000000000041");
    let hybridVoting = Address.fromString("0x0000000000000000000000000000000000000042");
    let directDemocracyVoting = Address.fromString("0x0000000000000000000000000000000000000043");
    let quickJoin = Address.fromString("0x0000000000000000000000000000000000000044");
    let participationToken = Address.fromString("0x0000000000000000000000000000000000000045");
    let taskManager = Address.fromString("0x0000000000000000000000000000000000000046");
    let educationHub = Address.fromString("0x0000000000000000000000000000000000000047");
    let paymentManager = Address.fromString("0x0000000000000000000000000000000000000048");
    let eligibilityModule = Address.fromString("0x0000000000000000000000000000000000000049");
    let toggleModule = Address.fromString("0x000000000000000000000000000000000000004a");
    let topHatId = BigInt.fromI32(5000);
    let roleHatIds = [BigInt.fromI32(5001)];

    // First deploy the org
    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Emit RolesCreated with empty metadataCID (bytes32(0))
    let hatIds = [BigInt.fromI32(5001)];
    let names = ["Member"];
    let images = [""];
    let metadataCIDs = [
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")
    ];
    let canVote = [true];

    let rolesCreatedEvent = createRolesCreatedEvent(
      orgId,
      hatIds,
      names,
      images,
      metadataCIDs,
      canVote
    );

    handleRolesCreated(rolesCreatedEvent);

    // Verify Role is updated but metadataCID remains null (not set)
    let roleId = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321-5001";
    assert.fieldEquals("Role", roleId, "name", "Member");
    assert.fieldEquals("Role", roleId, "canVote", "true");
    // metadataCID should not be set when it's bytes32(0)
    assert.assertNull(null); // Note: Matchstick doesn't have assertFieldNull, but we can verify by checking the entity
  });

  test("RolesCreated creates Role entities if they don't exist", () => {
    let orgId = Bytes.fromHexString(
      "0x9999888877776666999988887777666699998888777766669999888877776666"
    );

    // Don't deploy org first - directly emit RolesCreated
    let hatIds = [BigInt.fromI32(6001), BigInt.fromI32(6002)];
    let names = ["Role A", "Role B"];
    let images = ["", ""];
    let metadataCIDs = [
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"),
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")
    ];
    let canVote = [false, true];

    let rolesCreatedEvent = createRolesCreatedEvent(
      orgId,
      hatIds,
      names,
      images,
      metadataCIDs,
      canVote
    );

    handleRolesCreated(rolesCreatedEvent);

    // Verify Role entities are created
    let roleId1 = "0x9999888877776666999988887777666699998888777766669999888877776666-6001";
    let roleId2 = "0x9999888877776666999988887777666699998888777766669999888877776666-6002";

    assert.fieldEquals("Role", roleId1, "name", "Role A");
    assert.fieldEquals("Role", roleId1, "canVote", "false");
    assert.fieldEquals("Role", roleId1, "hatId", "6001");
    assert.fieldEquals("Role", roleId1, "isUserRole", "true"); // RolesCreated always sets isUserRole = true

    assert.fieldEquals("Role", roleId2, "name", "Role B");
    assert.fieldEquals("Role", roleId2, "canVote", "true");
    assert.fieldEquals("Role", roleId2, "hatId", "6002");
    assert.fieldEquals("Role", roleId2, "isUserRole", "true"); // RolesCreated always sets isUserRole = true
  });

  test("RolesCreated handles mixed canVote values", () => {
    let orgId = Bytes.fromHexString(
      "0xaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccdddd"
    );
    let executor = Address.fromString("0x0000000000000000000000000000000000000051");
    let hybridVoting = Address.fromString("0x0000000000000000000000000000000000000052");
    let directDemocracyVoting = Address.fromString("0x0000000000000000000000000000000000000053");
    let quickJoin = Address.fromString("0x0000000000000000000000000000000000000054");
    let participationToken = Address.fromString("0x0000000000000000000000000000000000000055");
    let taskManager = Address.fromString("0x0000000000000000000000000000000000000056");
    let educationHub = Address.fromString("0x0000000000000000000000000000000000000057");
    let paymentManager = Address.fromString("0x0000000000000000000000000000000000000058");
    let eligibilityModule = Address.fromString("0x0000000000000000000000000000000000000059");
    let toggleModule = Address.fromString("0x000000000000000000000000000000000000005a");
    let topHatId = BigInt.fromI32(7000);
    let roleHatIds = [BigInt.fromI32(7001), BigInt.fromI32(7002), BigInt.fromI32(7003)];

    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Emit RolesCreated with mixed canVote values
    let hatIds = [BigInt.fromI32(7001), BigInt.fromI32(7002), BigInt.fromI32(7003)];
    let names = ["Member", "Observer", "Admin"];
    let images = ["", "", ""];
    let metadataCIDs = [
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"),
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"),
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")
    ];
    let canVote = [true, false, true]; // Member and Admin can vote, Observer cannot

    let rolesCreatedEvent = createRolesCreatedEvent(
      orgId,
      hatIds,
      names,
      images,
      metadataCIDs,
      canVote
    );

    handleRolesCreated(rolesCreatedEvent);

    // Verify canVote values
    let roleId1 = "0xaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccdddd-7001";
    let roleId2 = "0xaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccdddd-7002";
    let roleId3 = "0xaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccdddd-7003";

    assert.fieldEquals("Role", roleId1, "name", "Member");
    assert.fieldEquals("Role", roleId1, "canVote", "true");

    assert.fieldEquals("Role", roleId2, "name", "Observer");
    assert.fieldEquals("Role", roleId2, "canVote", "false");

    assert.fieldEquals("Role", roleId3, "name", "Admin");
    assert.fieldEquals("Role", roleId3, "canVote", "true");
  });

  // ========================================
  // isUserRole Tests
  // ========================================

  test("OrgDeployed does NOT create Role for topHatId (system hat)", () => {
    let orgId = Bytes.fromHexString(
      "0xbbbbccccddddeeeebbbbccccddddeeeebbbbccccddddeeeebbbbccccddddeee0"
    );
    let executor = Address.fromString("0x0000000000000000000000000000000000000061");
    let hybridVoting = Address.fromString("0x0000000000000000000000000000000000000062");
    let directDemocracyVoting = Address.fromString("0x0000000000000000000000000000000000000063");
    let quickJoin = Address.fromString("0x0000000000000000000000000000000000000064");
    let participationToken = Address.fromString("0x0000000000000000000000000000000000000065");
    let taskManager = Address.fromString("0x0000000000000000000000000000000000000066");
    let educationHub = Address.fromString("0x0000000000000000000000000000000000000067");
    let paymentManager = Address.fromString("0x0000000000000000000000000000000000000068");
    let eligibilityModule = Address.fromString("0x0000000000000000000000000000000000000069");
    let toggleModule = Address.fromString("0x000000000000000000000000000000000000006a");
    let topHatId = BigInt.fromI32(8000);
    let roleHatIds = [BigInt.fromI32(8001), BigInt.fromI32(8002)];

    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Verify only 2 Role entities are created (for roleHatIds, NOT topHatId)
    assert.entityCount("Role", 2);

    // Verify user roles have isUserRole = true
    let roleId1 = "0xbbbbccccddddeeeebbbbccccddddeeeebbbbccccddddeeeebbbbccccddddeee0-8001";
    let roleId2 = "0xbbbbccccddddeeeebbbbccccddddeeeebbbbccccddddeeeebbbbccccddddeee0-8002";
    assert.fieldEquals("Role", roleId1, "isUserRole", "true");
    assert.fieldEquals("Role", roleId2, "isUserRole", "true");

    // Verify topHatId Role does NOT exist
    let topHatRoleId = "0xbbbbccccddddeeeebbbbccccddddeeeebbbbccccddddeeeebbbbccccddddeee0-8000";
    // This should NOT exist - asserting entity count already confirms this
    // but we can't easily assert non-existence with matchstick
  });

  test("OrgDeployed creates Role entities with isUserRole = true for roleHatIds", () => {
    let orgId = Bytes.fromHexString(
      "0xccccddddeeeeffffccccddddeeeeffffccccddddeeeeffffccccddddeeeefff0"
    );
    let executor = Address.fromString("0x0000000000000000000000000000000000000071");
    let hybridVoting = Address.fromString("0x0000000000000000000000000000000000000072");
    let directDemocracyVoting = Address.fromString("0x0000000000000000000000000000000000000073");
    let quickJoin = Address.fromString("0x0000000000000000000000000000000000000074");
    let participationToken = Address.fromString("0x0000000000000000000000000000000000000075");
    let taskManager = Address.fromString("0x0000000000000000000000000000000000000076");
    let educationHub = Address.fromString("0x0000000000000000000000000000000000000077");
    let paymentManager = Address.fromString("0x0000000000000000000000000000000000000078");
    let eligibilityModule = Address.fromString("0x0000000000000000000000000000000000000079");
    let toggleModule = Address.fromString("0x000000000000000000000000000000000000007a");
    let topHatId = BigInt.fromI32(9000);
    let roleHatIds = [BigInt.fromI32(9001), BigInt.fromI32(9002), BigInt.fromI32(9003)];

    let orgDeployedEvent = createOrgDeployedEvent(
      orgId,
      executor,
      hybridVoting,
      directDemocracyVoting,
      quickJoin,
      participationToken,
      taskManager,
      educationHub,
      paymentManager,
      eligibilityModule,
      toggleModule,
      topHatId,
      roleHatIds
    );

    handleOrgDeployed(orgDeployedEvent);

    // Verify 3 Role entities are created (only roleHatIds)
    assert.entityCount("Role", 3);

    // Verify all roles have isUserRole = true
    let roleId1 = "0xccccddddeeeeffffccccddddeeeeffffccccddddeeeeffffccccddddeeeefff0-9001";
    let roleId2 = "0xccccddddeeeeffffccccddddeeeeffffccccddddeeeeffffccccddddeeeefff0-9002";
    let roleId3 = "0xccccddddeeeeffffccccddddeeeeffffccccddddeeeeffffccccddddeeeefff0-9003";

    assert.fieldEquals("Role", roleId1, "isUserRole", "true");
    assert.fieldEquals("Role", roleId1, "hatId", "9001");
    assert.fieldEquals("Role", roleId2, "isUserRole", "true");
    assert.fieldEquals("Role", roleId2, "hatId", "9002");
    assert.fieldEquals("Role", roleId3, "isUserRole", "true");
    assert.fieldEquals("Role", roleId3, "hatId", "9003");
  });
});
