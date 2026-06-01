import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock
} from "matchstick-as/assembly/index";
import { Bytes, DataSourceContext } from "@graphprotocol/graph-ts";
import { handleOrgMetadata } from "../src/org-metadata";

// Helper to convert a bytes32 sha256 digest to an IPFS CIDv0 (matches the
// OrgMetadata entity ID the handler derives from dataSource.stringParam()).
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

let ORG_ID = Bytes.fromHexString(
  "0x1111111111111111111111111111111111111111111111111111111111111111"
);

// Sets up the IPFS data source mock (CID stringParam + orgId context) the way
// handleOrgMetadata reads them, then returns the derived OrgMetadata id (CID).
function mockOrgMetadataSource(seedHex: string): string {
  let cid = bytes32ToCid(Bytes.fromHexString(seedHex));
  let context = new DataSourceContext();
  context.setBytes("orgId", ORG_ID);
  dataSourceMock.setAddressAndContext(cid, context);
  return cid;
}

describe("OrgMetadata IPFS Handler — task payout fields", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("Parses taskPayoutHoursOnly and taskPayoutHourlyRate", () => {
    let cid = mockOrgMetadataSource(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    let jsonContent =
      '{"description":"Decentral Park","taskPayoutHoursOnly":true,"taskPayoutHourlyRate":10}';
    handleOrgMetadata(Bytes.fromUTF8(jsonContent));

    assert.entityCount("OrgMetadata", 1);
    assert.fieldEquals("OrgMetadata", cid, "organization", ORG_ID.toHexString());
    assert.fieldEquals("OrgMetadata", cid, "description", "Decentral Park");
    assert.fieldEquals("OrgMetadata", cid, "taskPayoutHoursOnly", "true");
    assert.fieldEquals("OrgMetadata", cid, "taskPayoutHourlyRate", "10");
  });

  test("Stores taskPayoutHoursOnly=false and a fractional rate", () => {
    let cid = mockOrgMetadataSource(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );

    let jsonContent =
      '{"taskPayoutHoursOnly":false,"taskPayoutHourlyRate":12.5}';
    handleOrgMetadata(Bytes.fromUTF8(jsonContent));

    assert.entityCount("OrgMetadata", 1);
    assert.fieldEquals("OrgMetadata", cid, "taskPayoutHoursOnly", "false");
    assert.fieldEquals("OrgMetadata", cid, "taskPayoutHourlyRate", "12.5");
  });

  test("Leaves task payout fields null when missing", () => {
    let cid = mockOrgMetadataSource(
      "0x5555555555555555555555555555555555555555555555555555555555555555"
    );

    let jsonContent = '{"description":"No payout config here"}';
    handleOrgMetadata(Bytes.fromUTF8(jsonContent));

    // Entity is still created from the rest of the metadata; the payout fields
    // are simply left unset (no "taskPayoutHourlyRate" key written to the store).
    assert.entityCount("OrgMetadata", 1);
    assert.fieldEquals("OrgMetadata", cid, "description", "No payout config here");
  });

  test("Ignores wrong-typed taskPayoutHourlyRate (string instead of number)", () => {
    let cid = mockOrgMetadataSource(
      "0x6666666666666666666666666666666666666666666666666666666666666666"
    );

    let jsonContent =
      '{"taskPayoutHoursOnly":true,"taskPayoutHourlyRate":"oops"}';
    handleOrgMetadata(Bytes.fromUTF8(jsonContent));

    // Handler stays resilient: the bool still parses and the wrong-typed rate
    // is ignored rather than bricking the entity.
    assert.entityCount("OrgMetadata", 1);
    assert.fieldEquals("OrgMetadata", cid, "taskPayoutHoursOnly", "true");
  });

  test("Does not regress existing metadata fields", () => {
    let cid = mockOrgMetadataSource(
      "0x7777777777777777777777777777777777777777777777777777777777777777"
    );

    let jsonContent =
      '{"description":"Org","hideTreasury":true,"useTokenSymbol":true,"taskPayoutHoursOnly":true,"taskPayoutHourlyRate":10}';
    handleOrgMetadata(Bytes.fromUTF8(jsonContent));

    assert.fieldEquals("OrgMetadata", cid, "hideTreasury", "true");
    assert.fieldEquals("OrgMetadata", cid, "useTokenSymbol", "true");
    assert.fieldEquals("OrgMetadata", cid, "taskPayoutHoursOnly", "true");
    assert.fieldEquals("OrgMetadata", cid, "taskPayoutHourlyRate", "10");
  });
});
