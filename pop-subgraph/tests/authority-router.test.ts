import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  beforeEach
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  handleRouterInitialized,
  handleRouterPaymasterHubSet,
  handleAuthorityBound,
  handleAuthorityUnbound
} from "../src/authority-router";
import { handleContractRegistered } from "../src/org-registry";
import { createContractRegisteredEvent } from "./org-registry-utils";
import {
  createRouterInitializedEvent,
  createPaymasterHubSetEvent,
  createAuthorityBoundEvent,
  createAuthorityUnboundEvent
} from "./authority-router-utils";
import { Organization } from "../generated/schema";

const MEMBERSHIP_AUTHORITY_TYPE_ID = "0xdff254c0d9c318c4e70eac95af4c0c9189e13f9d51ae2cfe2c1c446c4775ddb8";

// The CREATE3 singleton address — identical on gnosis and arbitrum-one (see networks.json).
const ROUTER = "0x9591d1e139dcfbe0ba12d6477b85d1035a2417f1";
const HATS = "0x3bc1a0ad72417f2d411118085256fc53cbddd137";
const ORG_REGISTRY = "0x3744b372abc41589226313f2bb1db3acaa22a854";
const PAYMASTER = "0xdef1038c297493c0b5f82f0cdb49e929b53b4108";
const ADMIN = "0xa6f4d9f44dd980b7168d829d5f74c2b00a46b2c9";

const ORG_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const AUTHORITY = "0x00000000000000000000000000000000000000aa";
const BEACON = "0x00000000000000000000000000000000000000bb";
const EXECUTOR = "0x00000000000000000000000000000000000000e1";
const CONTRACT_ID = "0x2222222222222222222222222222222222222222222222222222222222222222";

// Test6's live top-hat domain.
const TOPHAT_DOMAIN = 1077;

function router(): Address {
  return Address.fromString(ROUTER);
}

function orgId(): Bytes {
  return Bytes.fromHexString(ORG_ID);
}

function domain(): BigInt {
  return BigInt.fromI32(TOPHAT_DOMAIN);
}

function bindingId(): string {
  return ROUTER + "-" + TOPHAT_DOMAIN.toString();
}

function setupOrgWithAuthority(): void {
  let org = new Organization(orgId());
  org.executorContract = Bytes.fromHexString(EXECUTOR);
  org.deployedAt = BigInt.fromI32(1000);
  org.deployedAtBlock = BigInt.fromI32(100);
  org.save();

  handleContractRegistered(
    createContractRegisteredEvent(
      Bytes.fromHexString(CONTRACT_ID),
      orgId(),
      Bytes.fromHexString(MEMBERSHIP_AUTHORITY_TYPE_ID),
      Address.fromString(AUTHORITY),
      Address.fromString(BEACON),
      true,
      Address.fromString(EXECUTOR)
    )
  );
}

afterEach(() => {
  clearStore();
});

describe("AuthorityRouter", () => {
  beforeEach(() => {
    setupOrgWithAuthority();
  });

  test("RouterInitialized captures the singleton wiring with no eth_calls", () => {
    handleRouterInitialized(
      createRouterInitializedEvent(
        router(),
        Address.fromString(HATS),
        Address.fromString(ORG_REGISTRY),
        Address.fromString(ADMIN)
      )
    );
    // initialize() mirrors the setter event, so the paymaster pointer arrives from a log too.
    handleRouterPaymasterHubSet(
      createPaymasterHubSetEvent(router(), Address.fromString(PAYMASTER))
    );
    assert.fieldEquals("AuthorityRouterContract", ROUTER, "hats", HATS);
    assert.fieldEquals("AuthorityRouterContract", ROUTER, "orgRegistry", ORG_REGISTRY);
    assert.fieldEquals("AuthorityRouterContract", ROUTER, "admin", ADMIN);
    assert.fieldEquals("AuthorityRouterContract", ROUTER, "paymasterHub", PAYMASTER);
    assert.fieldEquals("AuthorityRouterContract", ROUTER, "bindingCount", "0");
  });

  test("AuthorityBound IS the cutover marker for the org", () => {
    handleAuthorityBound(
      createAuthorityBoundEvent(router(), orgId(), domain(), Address.fromString(AUTHORITY))
    );
    assert.fieldEquals("RouterBinding", bindingId(), "isBound", "true");
    assert.fieldEquals("RouterBinding", bindingId(), "authority", AUTHORITY);
    assert.fieldEquals("RouterBinding", bindingId(), "orgIdHash", ORG_ID);
    assert.fieldEquals("RouterBinding", bindingId(), "organization", ORG_ID);
    assert.fieldEquals("RouterBinding", bindingId(), "topHatDomain", TOPHAT_DOMAIN.toString());
    assert.fieldEquals("AuthorityRouterContract", ROUTER, "bindingCount", "1");
    // The authority side of the link, plus the cutover timestamp.
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "isRouterBound", "true");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "routerBinding", bindingId());
  });

  test("AuthorityUnbound (rollback) retains the row and flips isBound", () => {
    handleAuthorityBound(
      createAuthorityBoundEvent(router(), orgId(), domain(), Address.fromString(AUTHORITY))
    );
    handleAuthorityUnbound(
      createAuthorityUnboundEvent(router(), orgId(), domain(), Address.fromString(AUTHORITY))
    );
    assert.fieldEquals("RouterBinding", bindingId(), "isBound", "false");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "isRouterBound", "false");
    // The row survives so a re-bind reuses the same (router, domain) key.
    assert.fieldEquals("AuthorityRouterContract", ROUTER, "bindingCount", "1");
  });

  test("a re-bind after rollback reuses the same key without inflating the count", () => {
    handleAuthorityBound(
      createAuthorityBoundEvent(router(), orgId(), domain(), Address.fromString(AUTHORITY))
    );
    handleAuthorityUnbound(
      createAuthorityUnboundEvent(router(), orgId(), domain(), Address.fromString(AUTHORITY))
    );
    handleAuthorityBound(
      createAuthorityBoundEvent(router(), orgId(), domain(), Address.fromString(AUTHORITY))
    );
    assert.fieldEquals("RouterBinding", bindingId(), "isBound", "true");
    assert.fieldEquals("AuthorityRouterContract", ROUTER, "bindingCount", "1");
    assert.entityCount("RouterBinding", 1);
  });

  test("a bind whose authority is not yet indexed still records the binding", () => {
    let unknownAuthority = "0x00000000000000000000000000000000000000cc";
    handleAuthorityBound(
      createAuthorityBoundEvent(
        router(),
        orgId(),
        BigInt.fromI32(1342),
        Address.fromString(unknownAuthority)
      )
    );
    assert.fieldEquals("RouterBinding", ROUTER + "-1342", "authority", unknownAuthority);
    assert.fieldEquals("RouterBinding", ROUTER + "-1342", "isBound", "true");
  });
});
