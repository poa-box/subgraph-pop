import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock
} from "matchstick-as/assembly/index";
import { Bytes, BigInt, Address, DataSourceContext } from "@graphprotocol/graph-ts";
import { handleHatMetadata } from "../src/hat-metadata";
import { Hat, HatMetadata, EligibilityModuleContract, Organization } from "../generated/schema";

// Helper to convert bytes32 sha256 digest to IPFS CIDv0
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

// Helper to create a mock Hat entity for testing
function createMockHat(hatEntityId: string): void {
  let eligibilityModuleAddress = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");

  // Create Organization entity first
  let orgId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
  let org = new Organization(orgId);
  org.executorContract = Bytes.fromHexString("0x0000000000000000000000000000000000000001");
  org.hybridVoting = Bytes.fromHexString("0x0000000000000000000000000000000000000002");
  org.directDemocracyVoting = Bytes.fromHexString("0x0000000000000000000000000000000000000003");
  org.quickJoin = Bytes.fromHexString("0x0000000000000000000000000000000000000004");
  org.participationToken = Bytes.fromHexString("0x0000000000000000000000000000000000000005");
  org.taskManager = Bytes.fromHexString("0x0000000000000000000000000000000000000006");
  org.educationHub = Bytes.fromHexString("0x0000000000000000000000000000000000000007");
  org.paymentManager = Bytes.fromHexString("0x0000000000000000000000000000000000000008");
  org.eligibilityModule = eligibilityModuleAddress;
  org.toggleModuleContract = Bytes.fromHexString("0x000000000000000000000000000000000000000a");
  org.topHatId = BigInt.fromI32(1000);
  org.roleHatIds = [BigInt.fromI32(1001)];
  org.deployedAt = BigInt.fromI32(1000);
  org.deployedAtBlock = BigInt.fromI32(100);
  org.transactionHash = Bytes.fromHexString("0x1234");
  org.save();

  // Create EligibilityModuleContract entity
  let eligibilityModule = new EligibilityModuleContract(eligibilityModuleAddress);
  eligibilityModule.organization = orgId;
  eligibilityModule.superAdmin = Address.zero();
  eligibilityModule.hatsContract = Address.zero();
  eligibilityModule.toggleModule = Address.zero();
  eligibilityModule.isPaused = false;
  eligibilityModule.createdAt = BigInt.fromI32(1000);
  eligibilityModule.createdAtBlock = BigInt.fromI32(100);
  eligibilityModule.save();

  // Create Hat entity
  let hat = new Hat(hatEntityId);
  hat.hatId = BigInt.fromI32(1001);
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

describe("HatMetadata IPFS Handler", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("Parses valid JSON and creates HatMetadata entity with description", () => {
    let metadataCID = Bytes.fromHexString("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    // Set up data source mock for IPFS context
    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // Create valid JSON content with description
    let jsonContent = '{"description": "This is a role for managing administrative tasks"}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Verify HatMetadata entity was created
    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "description", "This is a role for managing administrative tasks");
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "hat", hatEntityId);
  });

  test("Creates HatMetadata entity with null description for missing field", () => {
    let metadataCID = Bytes.fromHexString("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON without description field
    let jsonContent = '{"otherField": "value"}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Verify HatMetadata entity was created with hat link but no description
    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "hat", hatEntityId);
    // Description should be null (not set)
    assert.assertNull(HatMetadata.load(hatEntityId + "-" + ipfsHash)!.description);
  });

  test("Handles malformed JSON gracefully", () => {
    let metadataCID = Bytes.fromHexString("0x5555555555555555555555555555555555555555555555555555555555555555");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // Invalid JSON
    let invalidContent = 'this is not valid json';
    let contentBytes = Bytes.fromUTF8(invalidContent);

    handleHatMetadata(contentBytes);

    // Should still create entity with just ID and hat link
    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "hat", hatEntityId);
    assert.assertNull(HatMetadata.load(hatEntityId + "-" + ipfsHash)!.description);
  });

  test("Handles empty description string as null", () => {
    let metadataCID = Bytes.fromHexString("0x6666666666666666666666666666666666666666666666666666666666666666");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with empty description - treated as null by the handler
    let jsonContent = '{"description": ""}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    assert.entityCount("HatMetadata", 1);
    // Empty strings are stored as null (consistent with Graph behavior)
    assert.assertNull(HatMetadata.load(hatEntityId + "-" + ipfsHash)!.description);
  });

  test("Handles non-string description type gracefully", () => {
    let metadataCID = Bytes.fromHexString("0x7777777777777777777777777777777777777777777777777777777777777777");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with number instead of string for description
    let jsonContent = '{"description": 12345}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Should create entity but not set description (wrong type)
    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "hat", hatEntityId);
    assert.assertNull(HatMetadata.load(hatEntityId + "-" + ipfsHash)!.description);
  });

  test("Handles null description value", () => {
    let metadataCID = Bytes.fromHexString("0x8888888888888888888888888888888888888888888888888888888888888888");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with null description
    let jsonContent = '{"description": null}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Should create entity but not set description
    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "hat", hatEntityId);
    assert.assertNull(HatMetadata.load(hatEntityId + "-" + ipfsHash)!.description);
  });

  test("Parses long description correctly", () => {
    let metadataCID = Bytes.fromHexString("0x9999999999999999999999999999999999999999999999999999999999999999");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with long description
    let longDescription = "This is a very long description that includes multiple sentences. It describes the role in detail, including responsibilities, requirements, and expectations. The role holder will be expected to perform various administrative tasks and coordinate with other team members.";
    let jsonContent = '{"description": "' + longDescription + '"}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "description", longDescription);
  });

  test("Sets indexedAt timestamp", () => {
    let metadataCID = Bytes.fromHexString("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    let jsonContent = '{"description": "Test description"}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Verify indexedAt is set (we use 0 as placeholder since file handlers don't have block context)
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "indexedAt", "0");
  });

  // Tests for name extraction from IPFS metadata

  test("Parses valid JSON and creates HatMetadata entity with name", () => {
    let metadataCID = Bytes.fromHexString("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with name field
    let jsonContent = '{"name": "Admin Role"}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Verify HatMetadata entity was created with name
    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "name", "Admin Role");
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "hat", hatEntityId);
  });

  test("Parses JSON with both name and description", () => {
    let metadataCID = Bytes.fromHexString("0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with both name and description
    let jsonContent = '{"name": "Council Member", "description": "A member of the governance council"}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Verify both fields are set
    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "name", "Council Member");
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "description", "A member of the governance council");
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "hat", hatEntityId);
  });

  test("Does not modify Hat entity from IPFS handler (avoids causality region conflict)", () => {
    let metadataCID = Bytes.fromHexString("0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    let jsonContent = '{"name": "Treasury Manager"}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // HatMetadata should have the name from IPFS
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "name", "Treasury Manager");

    // Hat entity should NOT be modified by the IPFS handler
    let hatAfter = Hat.load(hatEntityId);
    assert.assertNotNull(hatAfter);
    assert.assertNull(hatAfter!.name);
  });

  test("Handles empty name string as null", () => {
    let metadataCID = Bytes.fromHexString("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffF");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with empty name
    let jsonContent = '{"name": ""}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Empty strings should be treated as null
    assert.entityCount("HatMetadata", 1);
    assert.assertNull(HatMetadata.load(hatEntityId + "-" + ipfsHash)!.name);

    // Hat.name should remain null
    let hat = Hat.load(hatEntityId);
    assert.assertNull(hat!.name);
  });

  test("Handles null name value", () => {
    let metadataCID = Bytes.fromHexString("0x0101010101010101010101010101010101010101010101010101010101010101");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with null name
    let jsonContent = '{"name": null}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Should create entity but not set name
    assert.entityCount("HatMetadata", 1);
    assert.assertNull(HatMetadata.load(hatEntityId + "-" + ipfsHash)!.name);
  });

  test("Handles non-string name type gracefully", () => {
    let metadataCID = Bytes.fromHexString("0x0202020202020202020202020202020202020202020202020202020202020202");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";

    createMockHat(hatEntityId);

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    // JSON with number instead of string for name
    let jsonContent = '{"name": 12345}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // Should create entity but not set name (wrong type)
    assert.entityCount("HatMetadata", 1);
    assert.assertNull(HatMetadata.load(hatEntityId + "-" + ipfsHash)!.name);
  });

  test("Does not update Hat entity if Hat does not exist", () => {
    let metadataCID = Bytes.fromHexString("0x0303030303030303030303030303030303030303030303030303030303030303");
    let ipfsHash = bytes32ToCid(metadataCID);
    let hatEntityId = "nonexistent-hat-id";

    // Don't create Hat - it should not exist

    let context = new DataSourceContext();
    context.setString("hatEntityId", hatEntityId);
    dataSourceMock.setAddressAndContext(ipfsHash, context);

    let jsonContent = '{"name": "Orphan Role"}';
    let contentBytes = Bytes.fromUTF8(jsonContent);

    handleHatMetadata(contentBytes);

    // HatMetadata should still be created
    assert.entityCount("HatMetadata", 1);
    assert.fieldEquals("HatMetadata", hatEntityId + "-" + ipfsHash, "name", "Orphan Role");

    // Hat should not exist
    assert.assertNull(Hat.load(hatEntityId));
  });
});
