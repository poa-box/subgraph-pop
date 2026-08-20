import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  beforeEach,
  dataSourceMock,
  createMockedFunction
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  handleOrgRegistered,
  handleMetaUpdated,
  handleContractRegistered,
  handleOrgMetadataAdminHatSet,
  handleHatsTreeRegistered
} from "../src/org-registry";
import {
  createOrgRegisteredEvent,
  createMetaUpdatedEvent,
  createContractRegisteredEvent,
  createOrgMetadataAdminHatSetEvent,
  createHatsTreeRegisteredEvent
} from "./org-registry-utils";
import {
  OrgRegistryContract,
  Organization,
  RegisteredContract,
  OrgMetadata,
  HatPermission
} from "../generated/schema";

// Default mock event address from matchstick
const REGISTRY_ADDRESS = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a";

// keccak256("EducationHub") — OrgRegistry typeId for the optional EducationHub module.
const EDUCATION_HUB_TYPE_ID = "0xa871f070b566fe185ede7c7d071cb2f92e7c75c6a2912b6f37c86a50cdc6bad3";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Helper: org deployed WITHOUT an EducationHub (educationHub points at the zero entity),
// mirroring a real org like Decentral Park. `deployed` toggles whether OrgDeployed has run yet
// (deployedAtBlock is null until it has).
function createOrgWithoutEduHub(orgId: Bytes, deployed: boolean): void {
  let org = new Organization(orgId);
  org.executorContract = Bytes.fromHexString("0x0000000000000000000000000000000000000001");
  org.participationToken = Bytes.fromHexString("0x0000000000000000000000000000000000000005");
  org.educationHub = Bytes.fromHexString(ZERO_ADDRESS);
  if (deployed) {
    org.deployedAt = BigInt.fromI32(1000);
    org.deployedAtBlock = BigInt.fromI32(100);
  }
  org.save();
}

/**
 * Mock EducationHub.creatorHatIds()/memberHatIds() — the on-chain enumerations
 * wirePostDeployModule reads to recover the hat grants whose CreatorHatSet /
 * MemberHatSet logs were emitted in an earlier block, before this proxy's data
 * source existed.
 */
function mockHubHatIds(hub: Address, creatorHats: BigInt[], memberHats: BigInt[]): void {
  createMockedFunction(
    hub,
    "creatorHatIds",
    "creatorHatIds():(uint256[])"
  ).returns([ethereum.Value.fromUnsignedBigIntArray(creatorHats)]);
  createMockedFunction(
    hub,
    "memberHatIds",
    "memberHatIds():(uint256[])"
  ).returns([ethereum.Value.fromUnsignedBigIntArray(memberHats)]);
}

/**
 * Helper function to convert bytes32 sha256 digest to IPFS CIDv0.
 * Mirrors the logic in org-registry.ts for test assertions.
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

// Helper to create Organization entity (normally created by OrgDeployed)
function createMockOrganization(orgId: Bytes): void {
  let org = new Organization(orgId);
  // Required fields - mock addresses
  org.executorContract = Bytes.fromHexString("0x0000000000000000000000000000000000000001");
  org.hybridVoting = Bytes.fromHexString("0x0000000000000000000000000000000000000002");
  org.directDemocracyVoting = Bytes.fromHexString("0x0000000000000000000000000000000000000003");
  org.quickJoin = Bytes.fromHexString("0x0000000000000000000000000000000000000004");
  org.participationToken = Bytes.fromHexString("0x0000000000000000000000000000000000000005");
  org.taskManager = Bytes.fromHexString("0x0000000000000000000000000000000000000006");
  org.educationHub = Bytes.fromHexString("0x0000000000000000000000000000000000000007");
  org.paymentManager = Bytes.fromHexString("0x0000000000000000000000000000000000000008");
  org.eligibilityModule = Bytes.fromHexString("0x0000000000000000000000000000000000000009");
  org.toggleModuleContract = Bytes.fromHexString("0x000000000000000000000000000000000000000a");
  org.topHatId = BigInt.fromI32(0);
  org.roleHatIds = [];
  org.deployedAt = BigInt.fromI32(1000);
  org.deployedAtBlock = BigInt.fromI32(100);
  org.transactionHash = Bytes.fromHexString("0x1234");
  org.save();
}

describe("OrgRegistry", () => {
  afterEach(() => {
    clearStore();
  });

  describe("handleOrgRegistered", () => {
    test("creates OrgRegistryContract singleton and updates Organization with name/metadata", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");
      let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");

      // Create Organization first (normally done by OrgDeployed)
      createMockOrganization(orgId);

      let event = createOrgRegisteredEvent(orgId, executor, name, metadataHash);
      handleOrgRegistered(event);

      // Verify OrgRegistryContract was created
      assert.entityCount("OrgRegistryContract", 1);
      assert.fieldEquals(
        "OrgRegistryContract",
        REGISTRY_ADDRESS,
        "totalOrgs",
        "1"
      );
      assert.fieldEquals(
        "OrgRegistryContract",
        REGISTRY_ADDRESS,
        "totalContracts",
        "0"
      );

      // Verify Organization was updated with name and metadata
      assert.entityCount("Organization", 1);
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "name",
        "Test Org"
      );
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "metadataHash",
        "0x0000000000000000000000000000000000000000000000000000000000001234"
      );
      // Verify metadata link is set to the org-scoped OrgMetadata entity ID (orgId-CID)
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "metadata",
        orgId.toHexString() + "-" + bytes32ToCid(metadataHash)
      );
    });

    test("sets metadata link for non-zero hash", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");
      let metadataHash = Bytes.fromHexString("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

      createMockOrganization(orgId);

      let event = createOrgRegisteredEvent(orgId, executor, name, metadataHash);
      handleOrgRegistered(event);

      // Verify metadata field is set to the CIDv0 format of the hash
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "metadata",
        orgId.toHexString() + "-" + bytes32ToCid(metadataHash)
      );
    });

    test("does NOT set metadata link for zero hash", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");
      // Use zero hash (empty metadata)
      let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");

      createMockOrganization(orgId);

      let event = createOrgRegisteredEvent(orgId, executor, name, metadataHash);
      handleOrgRegistered(event);

      // Metadata field should NOT be set for zero hash (no IPFS data source created)
      assert.assertNull(
        Organization.load(orgId)!.metadata
      );
    });

    test("increments totalOrgs when Organization doesn't exist yet", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");

      // Don't create Organization - simulating OrgRegistered arriving before OrgDeployed
      let event = createOrgRegisteredEvent(orgId, executor, name);
      handleOrgRegistered(event);

      // Should still increment total orgs
      assert.fieldEquals(
        "OrgRegistryContract",
        REGISTRY_ADDRESS,
        "totalOrgs",
        "1"
      );
    });

    test("registers multiple orgs correctly", () => {
      let orgId1 = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let orgId2 = Bytes.fromHexString(
        "0x2222222222222222222222222222222222222222222222222222222222222222"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");

      createMockOrganization(orgId1);
      createMockOrganization(orgId2);

      let event1 = createOrgRegisteredEvent(orgId1, executor, name);
      handleOrgRegistered(event1);

      let event2 = createOrgRegisteredEvent(orgId2, executor, name);
      event2.logIndex = BigInt.fromI32(2);
      handleOrgRegistered(event2);

      assert.entityCount("Organization", 2);
      assert.fieldEquals(
        "OrgRegistryContract",
        REGISTRY_ADDRESS,
        "totalOrgs",
        "2"
      );
    });
  });

  describe("handleMetaUpdated", () => {
    test("updates org metadata and creates history record", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");

      // Create Organization and register it
      createMockOrganization(orgId);
      let regEvent = createOrgRegisteredEvent(orgId, executor, name);
      handleOrgRegistered(regEvent);

      // Update metadata
      let newName = Bytes.fromUTF8("Updated Org");
      let newMetadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000005678");
      let updateEvent = createMetaUpdatedEvent(orgId, newName, newMetadataHash);
      updateEvent.logIndex = BigInt.fromI32(2);
      handleMetaUpdated(updateEvent);

      // Verify org name was updated
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "name",
        "Updated Org"
      );

      // Verify metadataHash was updated
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "metadataHash",
        "0x0000000000000000000000000000000000000000000000000000000000005678"
      );

      // Verify metadata link was updated to CIDv0 format of new hash
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "metadata",
        orgId.toHexString() + "-" + bytes32ToCid(newMetadataHash)
      );

      // Verify history record was created
      assert.entityCount("OrgMetaUpdate", 1);
    });

    test("updates metadata link when metadata changes", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");
      let initialHash = Bytes.fromHexString("0xaaaa000000000000000000000000000000000000000000000000000000001111");

      createMockOrganization(orgId);
      let regEvent = createOrgRegisteredEvent(orgId, executor, name, initialHash);
      handleOrgRegistered(regEvent);

      // Verify initial metadata link is in CIDv0 format
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "metadata",
        orgId.toHexString() + "-" + bytes32ToCid(initialHash)
      );

      // Update to new metadata
      let newName = Bytes.fromUTF8("Updated Org");
      let newHash = Bytes.fromHexString("0xbbbb000000000000000000000000000000000000000000000000000000002222");
      let updateEvent = createMetaUpdatedEvent(orgId, newName, newHash);
      updateEvent.logIndex = BigInt.fromI32(2);
      handleMetaUpdated(updateEvent);

      // Verify metadata link was updated to CIDv0 format of new hash
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "metadata",
        orgId.toHexString() + "-" + bytes32ToCid(newHash)
      );
    });

    test("does not create history record if org not found", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let newName = Bytes.fromUTF8("Updated Org");

      // Don't create Organization
      let event = createMetaUpdatedEvent(orgId, newName);
      handleMetaUpdated(event);

      // History record should NOT be created since org doesn't exist
      assert.entityCount("OrgMetaUpdate", 0);
    });
  });

  describe("handleContractRegistered", () => {
    test("creates RegisteredContract and updates counters", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");

      // Create Organization
      createMockOrganization(orgId);
      let regEvent = createOrgRegisteredEvent(orgId, executor, name);
      handleOrgRegistered(regEvent);

      // Register a contract
      let contractId = Bytes.fromHexString(
        "0x3333333333333333333333333333333333333333333333333333333333333333"
      );
      let typeId = Bytes.fromHexString(
        "0x4444444444444444444444444444444444444444444444444444444444444444"
      );
      let proxy = Address.fromString("0x0000000000000000000000000000000000000002");
      let beacon = Address.fromString("0x0000000000000000000000000000000000000003");
      let owner = Address.fromString("0x0000000000000000000000000000000000000004");

      let contractEvent = createContractRegisteredEvent(
        contractId,
        orgId,
        typeId,
        proxy,
        beacon,
        true,
        owner
      );
      contractEvent.logIndex = BigInt.fromI32(2);
      handleContractRegistered(contractEvent);

      // Verify RegisteredContract was created
      assert.entityCount("RegisteredContract", 1);
      assert.fieldEquals(
        "RegisteredContract",
        contractId.toHexString(),
        "proxy",
        "0x0000000000000000000000000000000000000002"
      );
      assert.fieldEquals(
        "RegisteredContract",
        contractId.toHexString(),
        "autoUpgrade",
        "true"
      );

      // Verify registry counter was updated
      assert.fieldEquals(
        "OrgRegistryContract",
        REGISTRY_ADDRESS,
        "totalContracts",
        "1"
      );
    });

    test("registers multiple contracts for same org", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");

      createMockOrganization(orgId);
      let regEvent = createOrgRegisteredEvent(orgId, executor, name);
      handleOrgRegistered(regEvent);

      // Register first contract
      let contractId1 = Bytes.fromHexString(
        "0x3333333333333333333333333333333333333333333333333333333333333333"
      );
      let typeId1 = Bytes.fromHexString(
        "0x4444444444444444444444444444444444444444444444444444444444444444"
      );
      let proxy = Address.fromString("0x0000000000000000000000000000000000000002");
      let beacon = Address.fromString("0x0000000000000000000000000000000000000003");
      let owner = Address.fromString("0x0000000000000000000000000000000000000004");

      let contractEvent1 = createContractRegisteredEvent(
        contractId1,
        orgId,
        typeId1,
        proxy,
        beacon,
        true,
        owner
      );
      contractEvent1.logIndex = BigInt.fromI32(2);
      handleContractRegistered(contractEvent1);

      // Register second contract
      let contractId2 = Bytes.fromHexString(
        "0x5555555555555555555555555555555555555555555555555555555555555555"
      );
      let typeId2 = Bytes.fromHexString(
        "0x6666666666666666666666666666666666666666666666666666666666666666"
      );

      let contractEvent2 = createContractRegisteredEvent(
        contractId2,
        orgId,
        typeId2,
        proxy,
        beacon,
        false,
        owner
      );
      contractEvent2.logIndex = BigInt.fromI32(3);
      handleContractRegistered(contractEvent2);

      // Verify both contracts created
      assert.entityCount("RegisteredContract", 2);
      assert.fieldEquals(
        "OrgRegistryContract",
        REGISTRY_ADDRESS,
        "totalContracts",
        "2"
      );
    });
  });

  describe("handleContractRegistered - post-deploy module wiring", () => {
    test("wires Organization.educationHub + creates entity for a post-deploy EducationHub", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let contractId = Bytes.fromHexString(
        "0x7777777777777777777777777777777777777777777777777777777777777777"
      );
      let eduTypeId = Bytes.fromHexString(EDUCATION_HUB_TYPE_ID);
      let proxy = Address.fromString("0x00000000000000000000000000000000000000ee");
      let beacon = Address.fromString("0x00000000000000000000000000000000000000bb");
      let owner = Address.fromString("0x0000000000000000000000000000000000000001");

      // Org deployed without an EducationHub (the Decentral Park case).
      createOrgWithoutEduHub(orgId, true);
      mockHubHatIds(proxy, [], []);

      let ev = createContractRegisteredEvent(contractId, orgId, eduTypeId, proxy, beacon, true, owner);
      ev.logIndex = BigInt.fromI32(2);
      handleContractRegistered(ev);

      // The typed pointer the frontend reads now resolves to the new proxy.
      assert.fieldEquals("Organization", orgId.toHexString(), "educationHub", proxy.toHexString());

      // The referenced EducationHubContract entity exists, seeded from org context.
      assert.entityCount("EducationHubContract", 1);
      assert.fieldEquals("EducationHubContract", proxy.toHexString(), "organization", orgId.toHexString());
      assert.fieldEquals(
        "EducationHubContract",
        proxy.toHexString(),
        "executor",
        "0x0000000000000000000000000000000000000001"
      );
      assert.fieldEquals(
        "EducationHubContract",
        proxy.toHexString(),
        "token",
        "0x0000000000000000000000000000000000000005"
      );
      assert.fieldEquals("EducationHubContract", proxy.toHexString(), "nextModuleId", "0");

      // The generic RegisteredContract row is still written.
      assert.entityCount("RegisteredContract", 1);
    });

    test("is idempotent - does not overwrite an already-wired EducationHub", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let contractId = Bytes.fromHexString(
        "0x7777777777777777777777777777777777777777777777777777777777777777"
      );
      let eduTypeId = Bytes.fromHexString(EDUCATION_HUB_TYPE_ID);
      let proxy = Address.fromString("0x00000000000000000000000000000000000000ee");
      let beacon = Address.fromString("0x00000000000000000000000000000000000000bb");
      let owner = Address.fromString("0x0000000000000000000000000000000000000001");

      // Org already has a real EducationHub (e.g. it was deployed with one).
      let org = new Organization(orgId);
      org.executorContract = Bytes.fromHexString("0x0000000000000000000000000000000000000001");
      org.participationToken = Bytes.fromHexString("0x0000000000000000000000000000000000000005");
      org.educationHub = Bytes.fromHexString("0x00000000000000000000000000000000000000aa");
      org.deployedAtBlock = BigInt.fromI32(100);
      org.save();

      let ev = createContractRegisteredEvent(contractId, orgId, eduTypeId, proxy, beacon, true, owner);
      ev.logIndex = BigInt.fromI32(2);
      handleContractRegistered(ev);

      // Pointer is unchanged and no new module entity is fabricated.
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "educationHub",
        "0x00000000000000000000000000000000000000aa"
      );
      assert.entityCount("EducationHubContract", 0);
    });

    test("skips wiring during initial deployment (deployedAtBlock null)", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let contractId = Bytes.fromHexString(
        "0x7777777777777777777777777777777777777777777777777777777777777777"
      );
      let eduTypeId = Bytes.fromHexString(EDUCATION_HUB_TYPE_ID);
      let proxy = Address.fromString("0x00000000000000000000000000000000000000ee");
      let beacon = Address.fromString("0x00000000000000000000000000000000000000bb");
      let owner = Address.fromString("0x0000000000000000000000000000000000000001");

      // OrgDeployed has not run yet (deployedAtBlock null); it will wire the module + template.
      createOrgWithoutEduHub(orgId, false);

      let ev = createContractRegisteredEvent(contractId, orgId, eduTypeId, proxy, beacon, true, owner);
      ev.logIndex = BigInt.fromI32(2);
      handleContractRegistered(ev);

      // Pointer stays at the zero entity; no module entity created here.
      assert.fieldEquals("Organization", orgId.toHexString(), "educationHub", ZERO_ADDRESS);
      assert.entityCount("EducationHubContract", 0);
      // The generic RegisteredContract row is still written regardless.
      assert.entityCount("RegisteredContract", 1);
    });

    test("backfills Creator/Member hat permissions from the hub's on-chain enumerations", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let contractId = Bytes.fromHexString(
        "0x7777777777777777777777777777777777777777777777777777777777777777"
      );
      let eduTypeId = Bytes.fromHexString(EDUCATION_HUB_TYPE_ID);
      let proxy = Address.fromString("0x00000000000000000000000000000000000000ee");
      let beacon = Address.fromString("0x00000000000000000000000000000000000000bb");
      let owner = Address.fromString("0x0000000000000000000000000000000000000001");

      createOrgWithoutEduHub(orgId, true);

      // Decentral Park's real shape: one creator hat, two member hats, where the
      // creator is also a member — so it must yield a row under BOTH roles.
      let executiveHat = BigInt.fromString(
        "36180248838698575036480031466286475792781881727149517033480474826113024"
      );
      let memberHat = BigInt.fromString(
        "36180248838698575132261002770404529440178570924043841009651669962588160"
      );
      mockHubHatIds(proxy, [executiveHat], [memberHat, executiveHat]);

      let ev = createContractRegisteredEvent(contractId, orgId, eduTypeId, proxy, beacon, true, owner);
      ev.logIndex = BigInt.fromI32(2);
      handleContractRegistered(ev);

      // 1 Creator + 2 Member — the same 3-row shape every deploy-time hub already has.
      assert.entityCount("HatPermission", 3);

      let creatorId = proxy.toHexString() + "-" + executiveHat.toString() + "-Creator";
      assert.fieldEquals("HatPermission", creatorId, "contractType", "EducationHub");
      assert.fieldEquals("HatPermission", creatorId, "organization", orgId.toHexString());
      assert.fieldEquals("HatPermission", creatorId, "allowed", "true");

      assert.fieldEquals(
        "HatPermission",
        proxy.toHexString() + "-" + executiveHat.toString() + "-Member",
        "allowed",
        "true"
      );
      assert.fieldEquals(
        "HatPermission",
        proxy.toHexString() + "-" + memberHat.toString() + "-Member",
        "allowed",
        "true"
      );
    });

    test("does not clobber a hat permission an event already wrote", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let contractId = Bytes.fromHexString(
        "0x7777777777777777777777777777777777777777777777777777777777777777"
      );
      let eduTypeId = Bytes.fromHexString(EDUCATION_HUB_TYPE_ID);
      let proxy = Address.fromString("0x00000000000000000000000000000000000000ee");
      let beacon = Address.fromString("0x00000000000000000000000000000000000000bb");
      let owner = Address.fromString("0x0000000000000000000000000000000000000001");

      createOrgWithoutEduHub(orgId, true);

      let hatId = BigInt.fromI32(42);

      // A revoke arrived first (allowed=false). The array read cannot see the
      // revocation's precise state, so the authoritative event row must win.
      let existing = new HatPermission(proxy.toHexString() + "-" + hatId.toString() + "-Creator");
      existing.contractAddress = proxy;
      existing.contractType = "EducationHub";
      existing.organization = orgId;
      existing.hatId = hatId;
      existing.permissionRole = "Creator";
      existing.allowed = false;
      existing.setAt = BigInt.fromI32(500);
      existing.setAtBlock = BigInt.fromI32(50);
      existing.transactionHash = Bytes.fromHexString("0xdead");
      existing.save();

      mockHubHatIds(proxy, [hatId], []);

      let ev = createContractRegisteredEvent(contractId, orgId, eduTypeId, proxy, beacon, true, owner);
      ev.logIndex = BigInt.fromI32(2);
      handleContractRegistered(ev);

      assert.fieldEquals(
        "HatPermission",
        proxy.toHexString() + "-" + hatId.toString() + "-Creator",
        "allowed",
        "false"
      );
      assert.entityCount("HatPermission", 1);
    });

    test("reverting hat getters are tolerated - hub still wired, no permissions", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let contractId = Bytes.fromHexString(
        "0x7777777777777777777777777777777777777777777777777777777777777777"
      );
      let eduTypeId = Bytes.fromHexString(EDUCATION_HUB_TYPE_ID);
      let proxy = Address.fromString("0x00000000000000000000000000000000000000ee");
      let beacon = Address.fromString("0x00000000000000000000000000000000000000bb");
      let owner = Address.fromString("0x0000000000000000000000000000000000000001");

      createOrgWithoutEduHub(orgId, true);

      createMockedFunction(proxy, "creatorHatIds", "creatorHatIds():(uint256[])").reverts();
      createMockedFunction(proxy, "memberHatIds", "memberHatIds():(uint256[])").reverts();

      let ev = createContractRegisteredEvent(contractId, orgId, eduTypeId, proxy, beacon, true, owner);
      ev.logIndex = BigInt.fromI32(2);
      handleContractRegistered(ev);

      // The wiring that does not depend on the reads still happens.
      assert.fieldEquals("Organization", orgId.toHexString(), "educationHub", proxy.toHexString());
      assert.entityCount("EducationHubContract", 1);
      assert.entityCount("HatPermission", 0);
    });
  });

  describe("handleOrgMetadataAdminHatSet", () => {
    test("sets metadataAdminHatId on Organization", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");

      createMockOrganization(orgId);
      let regEvent = createOrgRegisteredEvent(orgId, executor, name);
      handleOrgRegistered(regEvent);

      let hatId = BigInt.fromI32(5001);
      let event = createOrgMetadataAdminHatSetEvent(orgId, hatId);
      handleOrgMetadataAdminHatSet(event);

      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "metadataAdminHatId",
        "5001"
      );
    });

    test("handles org not found gracefully", () => {
      let orgId = Bytes.fromHexString(
        "0x9999999999999999999999999999999999999999999999999999999999999999"
      );
      let hatId = BigInt.fromI32(5001);
      let event = createOrgMetadataAdminHatSetEvent(orgId, hatId);
      handleOrgMetadataAdminHatSet(event);

      // Should not throw - just a no-op
      assert.entityCount("Organization", 0);
    });
  });

  describe("handleHatsTreeRegistered", () => {
    test("updates Organization with topHatId and roleHatIds", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");

      createMockOrganization(orgId);
      let regEvent = createOrgRegisteredEvent(orgId, executor, name);
      handleOrgRegistered(regEvent);

      // Register hats tree
      let topHatId = BigInt.fromI32(1000);
      let roleHatIds: BigInt[] = [
        BigInt.fromI32(1001),
        BigInt.fromI32(1002),
        BigInt.fromI32(1003)
      ];

      let hatsEvent = createHatsTreeRegisteredEvent(orgId, topHatId, roleHatIds);
      hatsEvent.logIndex = BigInt.fromI32(2);
      handleHatsTreeRegistered(hatsEvent);

      // Verify org was updated with hat IDs
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "topHatId",
        "1000"
      );
    });

    test("handles org not found gracefully", () => {
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let topHatId = BigInt.fromI32(1000);
      let roleHatIds: BigInt[] = [BigInt.fromI32(1001)];

      // Don't create Organization - should not throw
      let event = createHatsTreeRegisteredEvent(orgId, topHatId, roleHatIds);
      handleHatsTreeRegistered(event);

      // No entities should be created
      assert.entityCount("Organization", 0);
    });
  });


  describe("Integration tests", () => {
    test("full lifecycle: register org, add contracts, update settings", () => {
      // 1. Create and register org
      let orgId = Bytes.fromHexString(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      );
      let executor = Address.fromString("0x0000000000000000000000000000000000000001");
      let name = Bytes.fromUTF8("Test Org");

      createMockOrganization(orgId);
      let regEvent = createOrgRegisteredEvent(orgId, executor, name);
      handleOrgRegistered(regEvent);

      // 2. Register hats tree
      let topHatId = BigInt.fromI32(1000);
      let roleHatIds: BigInt[] = [BigInt.fromI32(1001), BigInt.fromI32(1002)];

      let hatsEvent = createHatsTreeRegisteredEvent(orgId, topHatId, roleHatIds);
      hatsEvent.logIndex = BigInt.fromI32(2);
      handleHatsTreeRegistered(hatsEvent);

      // 3. Register a contract
      let contractId = Bytes.fromHexString(
        "0x3333333333333333333333333333333333333333333333333333333333333333"
      );
      let typeId = Bytes.fromHexString(
        "0x4444444444444444444444444444444444444444444444444444444444444444"
      );
      let proxy = Address.fromString("0x0000000000000000000000000000000000000002");
      let beacon = Address.fromString("0x0000000000000000000000000000000000000003");
      let owner = Address.fromString("0x0000000000000000000000000000000000000004");

      let contractEvent = createContractRegisteredEvent(
        contractId,
        orgId,
        typeId,
        proxy,
        beacon,
        true,
        owner
      );
      contractEvent.logIndex = BigInt.fromI32(3);
      handleContractRegistered(contractEvent);

      // 4. Update metadata
      let newName = Bytes.fromUTF8("Updated Org");
      let metaEvent = createMetaUpdatedEvent(orgId, newName);
      metaEvent.logIndex = BigInt.fromI32(4);
      handleMetaUpdated(metaEvent);

      // Verify final state
      assert.entityCount("OrgRegistryContract", 1);
      assert.entityCount("Organization", 1);
      assert.entityCount("RegisteredContract", 1);
      assert.entityCount("OrgMetaUpdate", 1);

      assert.fieldEquals(
        "OrgRegistryContract",
        REGISTRY_ADDRESS,
        "totalOrgs",
        "1"
      );
      assert.fieldEquals(
        "OrgRegistryContract",
        REGISTRY_ADDRESS,
        "totalContracts",
        "1"
      );
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "name",
        "Updated Org"
      );
      assert.fieldEquals(
        "Organization",
        orgId.toHexString(),
        "topHatId",
        "1000"
      );
    });
  });
});
