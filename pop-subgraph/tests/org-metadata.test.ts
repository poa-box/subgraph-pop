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

let OTHER_ORG_ID = Bytes.fromHexString(
  "0x2222222222222222222222222222222222222222222222222222222222222222"
);

describe("OrgMetadata IPFS Handler — id scoping", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  // Regression for the file-data-source context rule. OrgMetadata carries an `organization`
  // pointer and owns immutable OrgMetadataLink children, so its id is scoped by orgId. Two orgs
  // whose metadata JSON hashes to the same CID get different contexts, so graph-node spawns two
  // file data sources — with the old bare-CID id both would INSERT the same link rows and halt
  // indexing ("impossible combination of entity operations").
  test("Two orgs sharing one metadata CID produce two rows, not a collision", () => {
    let cid = bytes32ToCid(
      Bytes.fromHexString(
        "0x9999999999999999999999999999999999999999999999999999999999999999"
      )
    );
    let json =
      '{"description":"Shared boilerplate","links":[{"name":"Site","url":"https://a.example"}]}';

    let ctxA = new DataSourceContext();
    ctxA.setBytes("orgId", ORG_ID);
    dataSourceMock.setAddressAndContext(cid, ctxA);
    handleOrgMetadata(Bytes.fromUTF8(json));

    let ctxB = new DataSourceContext();
    ctxB.setBytes("orgId", OTHER_ORG_ID);
    dataSourceMock.setAddressAndContext(cid, ctxB);
    handleOrgMetadata(Bytes.fromUTF8(json));

    // Two distinct, org-scoped rows — and crucially two distinct immutable link rows.
    assert.entityCount("OrgMetadata", 2);
    assert.entityCount("OrgMetadataLink", 2);

    let idA = ORG_ID.toHexString() + "-" + cid;
    let idB = OTHER_ORG_ID.toHexString() + "-" + cid;
    assert.fieldEquals("OrgMetadata", idA, "organization", ORG_ID.toHexString());
    assert.fieldEquals("OrgMetadata", idB, "organization", OTHER_ORG_ID.toHexString());
    assert.fieldEquals("OrgMetadataLink", idA + "-0", "metadata", idA);
    assert.fieldEquals("OrgMetadataLink", idB + "-0", "metadata", idB);
  });

  // The same (org, CID) referenced twice must stay a single row: graph-node dedupes it upstream,
  // and the in-handler guard is the same-region safety net.
  test("Re-referencing the same (org, CID) does not duplicate", () => {
    let cid = mockOrgMetadataSource(
      "0x8888888888888888888888888888888888888888888888888888888888888888"
    );
    let json = '{"description":"Once","links":[{"name":"Site","url":"https://a.example"}]}';

    handleOrgMetadata(Bytes.fromUTF8(json));
    handleOrgMetadata(Bytes.fromUTF8(json));

    assert.entityCount("OrgMetadata", 1);
    assert.entityCount("OrgMetadataLink", 1);
  });
});

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
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "organization", ORG_ID.toHexString());
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "description", "Decentral Park");
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "taskPayoutHoursOnly", "true");
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "taskPayoutHourlyRate", "10");
  });

  test("Stores taskPayoutHoursOnly=false and a fractional rate", () => {
    let cid = mockOrgMetadataSource(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );

    let jsonContent =
      '{"taskPayoutHoursOnly":false,"taskPayoutHourlyRate":12.5}';
    handleOrgMetadata(Bytes.fromUTF8(jsonContent));

    assert.entityCount("OrgMetadata", 1);
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "taskPayoutHoursOnly", "false");
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "taskPayoutHourlyRate", "12.5");
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
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "description", "No payout config here");
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
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "taskPayoutHoursOnly", "true");
  });

  test("Does not regress existing metadata fields", () => {
    let cid = mockOrgMetadataSource(
      "0x7777777777777777777777777777777777777777777777777777777777777777"
    );

    let jsonContent =
      '{"description":"Org","hideTreasury":true,"useTokenSymbol":true,"taskPayoutHoursOnly":true,"taskPayoutHourlyRate":10}';
    handleOrgMetadata(Bytes.fromUTF8(jsonContent));

    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "hideTreasury", "true");
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "useTokenSymbol", "true");
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "taskPayoutHoursOnly", "true");
    assert.fieldEquals("OrgMetadata", ORG_ID.toHexString() + "-" + cid, "taskPayoutHourlyRate", "10");
  });
});
