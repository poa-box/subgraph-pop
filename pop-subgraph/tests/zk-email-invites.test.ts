import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt, DataSourceContext } from "@graphprotocol/graph-ts";
import { handleActiveAllowlistSet } from "../src/zk-email-invites";
import { handleZkEmailAllowlist } from "../src/zk-email-allowlist";
import { handleContractRegistered } from "../src/org-registry";
import { createContractRegisteredEvent } from "./org-registry-utils";
import { createActiveAllowlistSetEvent } from "./zk-email-invites-utils";
import { Organization, ZkEmailInvites, ZkEmailAllowlist } from "../generated/schema";

const ZKEMAIL_INVITES_ID = "0x77a52db12b54c70a33bdf184cac221a69b235b98cf754315952afcffd06ae4db";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const MODULE = "0x00000000000000000000000000000000000000ee";
const ORG_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";

// Mirror bytes32ToCid in the handlers for assertions.
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

function createOrgWithZkModule(): void {
  let orgId = Bytes.fromHexString(ORG_ID);
  let org = new Organization(orgId);
  org.executorContract = Bytes.fromHexString("0x0000000000000000000000000000000000000001");
  org.deployedAt = BigInt.fromI32(1000);
  org.deployedAtBlock = BigInt.fromI32(100);
  org.save();

  let zk = new ZkEmailInvites(Bytes.fromHexString(MODULE));
  zk.organization = orgId;
  zk.createdAt = BigInt.fromI32(1000);
  zk.lastUpdatedAt = BigInt.fromI32(1000);
  zk.save();
}

describe("ZkEmailInvites", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  describe("org-registry wiring", () => {
    test("ContractRegistered with the ZkEmailInvites typeId wires the module + Organization pointer", () => {
      let orgId = Bytes.fromHexString(ORG_ID);
      let org = new Organization(orgId);
      org.executorContract = Bytes.fromHexString("0x0000000000000000000000000000000000000001");
      org.save();

      let contractId = Bytes.fromHexString(
        "0x7777777777777777777777777777777777777777777777777777777777777777"
      );
      let typeId = Bytes.fromHexString(ZKEMAIL_INVITES_ID);
      let proxy = Address.fromString(MODULE);
      let beacon = Address.fromString("0x00000000000000000000000000000000000000bb");
      let owner = Address.fromString("0x0000000000000000000000000000000000000001");

      let ev = createContractRegisteredEvent(contractId, orgId, typeId, proxy, beacon, true, owner);
      handleContractRegistered(ev);

      assert.fieldEquals("Organization", orgId.toHexString(), "zkEmailInvites", proxy.toHexString());
      assert.entityCount("ZkEmailInvites", 1);
      assert.fieldEquals("ZkEmailInvites", proxy.toHexString(), "organization", orgId.toHexString());
      assert.entityCount("RegisteredContract", 1);
    });
  });

  describe("handleActiveAllowlistSet", () => {
    test("sets activeRoot + activeAllowlistCid and links the allowlist for a non-zero CID", () => {
      createOrgWithZkModule();

      let root = Bytes.fromHexString(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      );
      let cidHash = Bytes.fromHexString(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );
      let expectedCid = bytes32ToCid(cidHash);

      let ev = createActiveAllowlistSetEvent(Address.fromString(MODULE), root, cidHash);
      handleActiveAllowlistSet(ev);

      assert.fieldEquals("ZkEmailInvites", MODULE, "activeRoot", root.toHexString());
      assert.fieldEquals("ZkEmailInvites", MODULE, "activeAllowlistCid", expectedCid);
      assert.fieldEquals("ZkEmailInvites", MODULE, "activeAllowlist", expectedCid);
    });

    test("clears the active allowlist (dormant) for a zero CID", () => {
      createOrgWithZkModule();

      let root = Bytes.fromHexString(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      );
      let cidHash = Bytes.fromHexString(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );
      handleActiveAllowlistSet(createActiveAllowlistSetEvent(Address.fromString(MODULE), root, cidHash));

      let zeroRoot = Bytes.fromHexString(ZERO_HASH);
      let zeroCid = Bytes.fromHexString(ZERO_HASH);
      handleActiveAllowlistSet(createActiveAllowlistSetEvent(Address.fromString(MODULE), zeroRoot, zeroCid));

      let module = ZkEmailInvites.load(Bytes.fromHexString(MODULE))!;
      assert.assertTrue(module.activeAllowlistCid === null);
      assert.assertTrue(module.activeRoot === null);
      assert.assertTrue(module.activeAllowlist === null);
    });
  });
});
