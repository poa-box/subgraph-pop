import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt, DataSourceContext, ethereum } from "@graphprotocol/graph-ts";
import {
  handleActiveAllowlistSet,
  handleRoleClaimedByDomain,
  handleRoleClaimedByEmail,
  handleRegisteredAndClaimedByDomain,
  handleRegisteredAndClaimedByEmail,
  handleRegisteredEmailCleared,
  handleDKIMRegistryUpdated,
  handleDomainVerifierUpdated
} from "../src/zk-email-invites";
import { handleZkEmailAllowlist } from "../src/zk-email-allowlist";
import { handleContractRegistered } from "../src/org-registry";
import { createContractRegisteredEvent } from "./org-registry-utils";
import {
  createActiveAllowlistSetEvent,
  createRoleClaimedByDomainEvent,
  createRoleClaimedByEmailEvent,
  createRegisteredAndClaimedByDomainEvent,
  createRegisteredAndClaimedByEmailEvent,
  createRegisteredEmailClearedEvent,
  createDKIMRegistryUpdatedEvent,
  createDomainVerifierUpdatedEvent
} from "./zk-email-invites-utils";
import {
  Organization,
  ZkEmailInvites,
  ZkEmailAllowlist,
  ZkEmailClaim,
  ZkEmailRegisteredEmail,
  ZkEmailNullifier
} from "../generated/schema";
import { createMockedFunction } from "matchstick-as";

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
  zk.claimCount = 0;
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

  describe("claims", () => {
    const CLAIMER = "0x00000000000000000000000000000000000000aa";
    const DOMAIN_HASH = "0x14d46e073cbff5944a738ea295de6c7447606fa5a270571229d8a4b1e7ca77e5";
    const EMAIL_HASH = "0x005b76e0eb10eba0c508236b3b805cd3509298aa506796acf267e27ea6aa632e";
    const NULLIFIER = "0x21e7a322ea8b904894df539aff05fb5323c6aa2640157dcecde4bbe2db7ccf18";

    test("a domain claim is recorded with its nullifier and does NOT consume a registration", () => {
      createOrgWithZkModule();

      let event = createRoleClaimedByDomainEvent(
        Address.fromString(MODULE),
        Address.fromString(CLAIMER),
        Bytes.fromHexString(DOMAIN_HASH),
        [BigInt.fromI32(42)],
        Bytes.fromHexString(NULLIFIER)
      );
      handleRoleClaimedByDomain(event);

      assert.entityCount("ZkEmailClaim", 1);
      assert.entityCount("ZkEmailNullifier", 1);
      // Derive the id the way the handler does rather than hardcoding matchstick's mock defaults.
      let claimId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
      assert.fieldEquals("ZkEmailClaim", claimId, "kind", "Domain");
      assert.fieldEquals("ZkEmailClaim", claimId, "identifierHash", DOMAIN_HASH);
      assert.fieldEquals("ZkEmailClaim", claimId, "claimer", CLAIMER);
      // A domain claim has no per-address limit, so it must not write a registration row —
      // doing so would make the address look unable to claim again.
      assert.entityCount("ZkEmailRegisteredEmail", 0);
      assert.fieldEquals("ZkEmailInvites", MODULE, "claimCount", "1");
    });

    test("a specific-address claim consumes that address's one registration", () => {
      createOrgWithZkModule();

      handleRoleClaimedByEmail(
        createRoleClaimedByEmailEvent(
          Address.fromString(MODULE),
          Address.fromString(CLAIMER),
          Bytes.fromHexString(EMAIL_HASH),
          [BigInt.fromI32(42)],
          Bytes.fromHexString(NULLIFIER)
        )
      );

      let regId = MODULE + "-" + EMAIL_HASH;
      assert.entityCount("ZkEmailRegisteredEmail", 1);
      assert.fieldEquals("ZkEmailRegisteredEmail", regId, "registered", "true");
      assert.fieldEquals("ZkEmailRegisteredEmail", regId, "claimer", CLAIMER);
    });

    test("RegisteredEmailCleared frees the address to claim again", () => {
      createOrgWithZkModule();
      let regId = MODULE + "-" + EMAIL_HASH;

      handleRoleClaimedByEmail(
        createRoleClaimedByEmailEvent(
          Address.fromString(MODULE),
          Address.fromString(CLAIMER),
          Bytes.fromHexString(EMAIL_HASH),
          [BigInt.fromI32(42)],
          Bytes.fromHexString(NULLIFIER)
        )
      );
      assert.fieldEquals("ZkEmailRegisteredEmail", regId, "registered", "true");

      handleRegisteredEmailCleared(
        createRegisteredEmailClearedEvent(Address.fromString(MODULE), Bytes.fromHexString(EMAIL_HASH))
      );
      assert.fieldEquals("ZkEmailRegisteredEmail", regId, "registered", "false");
    });

    test("clearing an address never seen before still records registered=false", () => {
      createOrgWithZkModule();

      handleRegisteredEmailCleared(
        createRegisteredEmailClearedEvent(Address.fromString(MODULE), Bytes.fromHexString(EMAIL_HASH))
      );

      let regId = MODULE + "-" + EMAIL_HASH;
      assert.entityCount("ZkEmailRegisteredEmail", 1);
      assert.fieldEquals("ZkEmailRegisteredEmail", regId, "registered", "false");
    });

    test("the onboarding path is indexed too, carrying the username and no nullifier", () => {
      createOrgWithZkModule();

      handleRegisteredAndClaimedByEmail(
        createRegisteredAndClaimedByEmailEvent(
          Address.fromString(MODULE),
          Address.fromString(CLAIMER),
          Bytes.fromHexString("0x00000000000000000000000000000000000000000000000000000000000000c1"),
          "alice",
          Bytes.fromHexString(EMAIL_HASH),
          [BigInt.fromI32(42)]
        )
      );

      assert.entityCount("ZkEmailClaim", 1);
      // RegisteredAndClaimed* carries a credentialId instead of a nullifier.
      assert.entityCount("ZkEmailNullifier", 0);
      assert.entityCount("ZkEmailRegisteredEmail", 1);
    });
  });

  describe("module wiring", () => {
    test("the DOMAIN onboarding path does not consume a specific-address registration", () => {
      // The mirror of the Email onboarding test. Domain claims have no per-address limit
      // on-chain, so writing a registration row here would make the CLI tell every
      // domain-invited user they had already used their invite — blocking a valid claim.
      createOrgWithZkModule();

      handleRegisteredAndClaimedByDomain(
        createRegisteredAndClaimedByDomainEvent(
          Address.fromString(MODULE),
          Address.fromString("0x00000000000000000000000000000000000000aa"),
          Bytes.fromHexString("0x00000000000000000000000000000000000000000000000000000000000000c1"),
          "bob",
          Bytes.fromHexString("0x14d46e073cbff5944a738ea295de6c7447606fa5a270571229d8a4b1e7ca77e5"),
          [BigInt.fromI32(42)]
        )
      );

      assert.entityCount("ZkEmailClaim", 1);
      assert.entityCount("ZkEmailRegisteredEmail", 0);
    });

    test("DomainVerifierUpdated records the verifier", () => {
      createOrgWithZkModule();
      createMockedFunction(Address.fromString(MODULE), "executor", "executor():(address)")
        .returns([ethereum.Value.fromAddress(Address.fromString("0x0000000000000000000000000000000000000001"))]);

      handleDomainVerifierUpdated(
        createDomainVerifierUpdatedEvent(
          Address.fromString(MODULE),
          Address.fromString("0x00000000000000000000000000000000000000b1")
        )
      );

      assert.fieldEquals("ZkEmailInvites", MODULE, "domainVerifier", "0x00000000000000000000000000000000000000b1");
    });

    test("DKIMRegistryUpdated records the registry and resolves the executor once", () => {
      createOrgWithZkModule();

      // executor() has no event, so the handler binds the proxy exactly once.
      createMockedFunction(Address.fromString(MODULE), "executor", "executor():(address)")
        .returns([ethereum.Value.fromAddress(Address.fromString("0x0000000000000000000000000000000000000001"))]);

      handleDKIMRegistryUpdated(
        createDKIMRegistryUpdatedEvent(
          Address.fromString(MODULE),
          Address.fromString("0x00000000000000000000000000000000000000dd")
        )
      );

      assert.fieldEquals("ZkEmailInvites", MODULE, "dkimRegistry", "0x00000000000000000000000000000000000000dd");
      assert.fieldEquals("ZkEmailInvites", MODULE, "executor", "0x0000000000000000000000000000000000000001");
    });
  });
});
