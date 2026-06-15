import { assert, describe, test, clearStore, afterEach } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { handleContractRegistered } from "../src/org-registry";
import { handleDomainRuleSet, handleDomainRuleRemoved, handleRoleClaimedByDomain } from "../src/zk-email-invites";
import { createContractRegisteredEvent } from "./org-registry-utils";
import {
  mockZkGetters,
  createDomainRuleSetEvent,
  createDomainRuleRemovedEvent,
  createRoleClaimedByDomainEvent
} from "./zk-email-invites-utils";
import { Organization, ZkEmailInvitesContract } from "../generated/schema";

const ZK_TYPE_ID = Bytes.fromHexString("0x77a52db12b54c70a33bdf184cac221a69b235b98cf754315952afcffd06ae4db");
const OTHER_TYPE_ID = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");

const ORG_ID = Bytes.fromHexString("0x2222222222222222222222222222222222222222222222222222222222222222");
const CONTRACT_ID = Bytes.fromHexString("0x3333333333333333333333333333333333333333333333333333333333333333");
const PROXY = Address.fromString("0x00000000000000000000000000000000000000a1");
const BEACON = Address.fromString("0x00000000000000000000000000000000000000b1");
const OWNER = Address.fromString("0x00000000000000000000000000000000000000c1");
const EXECUTOR = Address.fromString("0x00000000000000000000000000000000000000e1");
const VERIFIER = Address.fromString("0x0000000000000000000000000000000000000011");
const DKIM = Address.fromString("0x0000000000000000000000000000000000000022");
const ACCT = Address.fromString("0x0000000000000000000000000000000000000033");
const FACTORY = Address.fromString("0x0000000000000000000000000000000000000044");
const CLAIMER = Address.fromString("0x00000000000000000000000000000000000000aa");
const DOMAIN_HASH = Bytes.fromHexString("0x44444444444444444444444444444444444444444444444444444444444444dd");
const NULLIFIER = Bytes.fromHexString("0x55555555555555555555555555555555555555555555555555555555555555ee");

function makeOrg(orgId: Bytes, deployed: boolean): void {
  let org = new Organization(orgId);
  org.executorContract = EXECUTOR;
  if (deployed) {
    org.deployedAtBlock = BigInt.fromI32(100);
  }
  org.save();
}

function seedModule(proxy: Address, orgId: Bytes): void {
  let m = new ZkEmailInvitesContract(proxy);
  m.organization = orgId;
  m.verifier = VERIFIER;
  m.dkimRegistry = DKIM;
  m.accountRegistry = ACCT;
  m.universalFactory = FACTORY;
  m.executor = EXECUTOR;
  m.createdAt = BigInt.fromI32(1);
  m.createdAtBlock = BigInt.fromI32(1);
  m.transactionHash = Bytes.fromHexString("0x00");
  m.save();
}

describe("ZkEmailInvites", () => {
  afterEach(() => {
    clearStore();
  });

  describe("wiring via handleContractRegistered", () => {
    // The novel behavior vs EducationHub: ZkEmailInvites is NOT in OrgDeployed, so it must wire even
    // when deployedAtBlock is null (its ContractRegistered fires during the deploy tx).
    test("wires at deploy time even when deployedAtBlock is null", () => {
      makeOrg(ORG_ID, false);
      mockZkGetters(PROXY, VERIFIER, DKIM, ACCT, FACTORY, EXECUTOR);

      let ev = createContractRegisteredEvent(CONTRACT_ID, ORG_ID, ZK_TYPE_ID, PROXY, BEACON, true, OWNER);
      handleContractRegistered(ev);

      assert.fieldEquals("Organization", ORG_ID.toHexString(), "zkEmailInvites", PROXY.toHexString());
      assert.entityCount("ZkEmailInvitesContract", 1);
      assert.fieldEquals("ZkEmailInvitesContract", PROXY.toHexString(), "organization", ORG_ID.toHexString());
      assert.fieldEquals("ZkEmailInvitesContract", PROXY.toHexString(), "verifier", VERIFIER.toHexString());
      assert.fieldEquals("ZkEmailInvitesContract", PROXY.toHexString(), "dkimRegistry", DKIM.toHexString());
      assert.fieldEquals("ZkEmailInvitesContract", PROXY.toHexString(), "executor", EXECUTOR.toHexString());
    });

    test("is idempotent — a second registration does not duplicate the module", () => {
      makeOrg(ORG_ID, true);
      mockZkGetters(PROXY, VERIFIER, DKIM, ACCT, FACTORY, EXECUTOR);

      let ev = createContractRegisteredEvent(CONTRACT_ID, ORG_ID, ZK_TYPE_ID, PROXY, BEACON, true, OWNER);
      handleContractRegistered(ev);
      handleContractRegistered(ev);

      assert.entityCount("ZkEmailInvitesContract", 1);
    });

    test("ignores non-ZkEmailInvites typeIds", () => {
      makeOrg(ORG_ID, true);

      let ev = createContractRegisteredEvent(CONTRACT_ID, ORG_ID, OTHER_TYPE_ID, PROXY, BEACON, true, OWNER);
      handleContractRegistered(ev);

      assert.entityCount("ZkEmailInvitesContract", 0);
    });
  });

  describe("rule + claim handlers", () => {
    test("indexes a domain rule and marks it inactive on removal", () => {
      makeOrg(ORG_ID, true);
      seedModule(PROXY, ORG_ID);
      let id = PROXY.toHexString() + "-" + DOMAIN_HASH.toHexString();

      let hatIds: BigInt[] = [BigInt.fromI32(7)];
      handleDomainRuleSet(createDomainRuleSetEvent(PROXY, DOMAIN_HASH, hatIds, BigInt.fromI32(0)));
      assert.entityCount("ZkEmailDomainRule", 1);
      assert.fieldEquals("ZkEmailDomainRule", id, "active", "true");
      assert.fieldEquals("ZkEmailDomainRule", id, "organization", ORG_ID.toHexString());

      handleDomainRuleRemoved(createDomainRuleRemovedEvent(PROXY, DOMAIN_HASH));
      assert.fieldEquals("ZkEmailDomainRule", id, "active", "false");
    });

    test("indexes a role claim by domain", () => {
      makeOrg(ORG_ID, true);
      seedModule(PROXY, ORG_ID);

      let hatIds: BigInt[] = [BigInt.fromI32(7)];
      let ev = createRoleClaimedByDomainEvent(PROXY, CLAIMER, DOMAIN_HASH, hatIds, NULLIFIER);
      handleRoleClaimedByDomain(ev);

      let id = ev.transaction.hash.concatI32(ev.logIndex.toI32());
      assert.entityCount("ZkEmailRoleClaim", 1);
      assert.fieldEquals("ZkEmailRoleClaim", id.toHexString(), "claimer", CLAIMER.toHexString());
      assert.fieldEquals("ZkEmailRoleClaim", id.toHexString(), "kind", "Domain");
      assert.fieldEquals("ZkEmailRoleClaim", id.toHexString(), "nullifier", NULLIFIER.toHexString());
      assert.fieldEquals("ZkEmailRoleClaim", id.toHexString(), "viaPasskeyRegistration", "false");
      assert.fieldEquals("ZkEmailRoleClaim", id.toHexString(), "organization", ORG_ID.toHexString());
    });
  });
});
