import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  beforeEach,
  createMockedFunction
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  handlePaymasterInitialized,
  handleOrgRegistered,
  handleRuleSet,
  handleGlobalRuleSet,
  handleTargetTypeSet,
  handleRulesModeSet,
  handleGlobalRuleBlockSet,
  backfillGlobalRulebook
} from "../src/paymaster-hub";
import {
  createPaymasterInitializedEvent,
  createOrgRegisteredEvent,
  createRuleSetEvent,
  createGlobalRuleSetEvent,
  createTargetTypeSetEvent,
  createRulesModeSetEvent,
  createGlobalRuleBlockSetEvent
} from "./paymaster-hub-utils";

// Matchstick's default mock event address — also the hub address for every test here.
const HUB = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
const ENTRY_POINT = Address.fromString("0x0000000071727de22e5e9d8baf0edac6f37da032");
const HATS = Address.fromString("0x3bc1a0ad72417f2d411118085256fc53cbddd137");
const POA_MANAGER = Address.fromString("0x00000000000000000000000000000000000000a1");

const ORG_ID = Bytes.fromHexString(
  "0x1111111111111111111111111111111111111111111111111111111111111111"
);
const OTHER_ORG_ID = Bytes.fromHexString(
  "0x2222222222222222222222222222222222222222222222222222222222222222"
);
const ZERO_TYPE_ID = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000000000000000000000000000"
);
// keccak256("TaskManager") / keccak256("UniversalAccountRegistry") — mirrors ModuleTypes.sol.
const TASK_MANAGER_TYPE_ID = Bytes.fromHexString(
  "0x32f7a2c64ebedb84c7786a459012ac8953c5a63d5dcc8715f2fa3e32bdb3b434"
);
const UNIVERSAL_ACCOUNT_REGISTRY_TYPE_ID = Bytes.fromHexString(
  "0x3250c7e0dd82fca1639c4864d0b069e0c7943457c0d528081ef5f3196816981f"
);
const UNKNOWN_TYPE_ID = Bytes.fromHexString(
  "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
);

const SELECTOR = Bytes.fromHexString("0x8dd33495");
const TARGET = Address.fromString("0x00000000000000000000000000000000000000b1");
// Chain-shared singleton — the same address is target-typed under every orgId.
const SHARED_REGISTRY = Address.fromString("0x00000000000000000000000000000000000000c1");

function orgConfigId(orgId: Bytes): string {
  return HUB.toHexString() + "-" + orgId.toHexString();
}

function globalRuleId(typeId: Bytes, selector: Bytes): string {
  return HUB.toHexString() + "-" + typeId.toHexString() + "-" + selector.toHexString();
}

function targetTypeId(orgId: Bytes, target: Address): string {
  return orgConfigId(orgId) + "-" + target.toHexString();
}

// PaymasterRule and PaymasterGlobalRuleBlock intentionally share this id string.
function pairId(orgId: Bytes, target: Address, selector: Bytes): string {
  return orgConfigId(orgId) + "-" + target.toHexString() + "-" + selector.toHexString();
}

function setupHub(): void {
  handlePaymasterInitialized(
    createPaymasterInitializedEvent(HUB, ENTRY_POINT, HATS, POA_MANAGER)
  );
}

function setupOrg(orgId: Bytes): void {
  handleOrgRegistered(
    createOrgRegisteredEvent(HUB, orgId, BigInt.fromI32(1), BigInt.fromI32(2))
  );
}

// Fresh-chain catch-up mocks: DeployInfrastructure seeds the rulebook many transactions before
// registerInfrastructure creates the PaymasterHub template, so those GlobalRuleSet logs are
// cross-block and never delivered — handleInfrastructureDeployed reads the state instead.
// Declared at module scope because AssemblyScript has no closures.
function mockRulebookCount(count: i32): void {
  createMockedFunction(HUB, "getGlobalRuleCount", "getGlobalRuleCount():(uint256)").returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(count))
  ]);
}

function mockRuleAt(
  index: i32,
  typeId: Bytes,
  selector: Bytes,
  maxCallGasHint: i32,
  allowed: boolean
): void {
  let rule = new ethereum.Tuple();
  rule.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(maxCallGasHint)));
  rule.push(ethereum.Value.fromBoolean(allowed));

  createMockedFunction(
    HUB,
    "getGlobalRuleAt",
    "getGlobalRuleAt(uint256):(bytes32,bytes4,(uint32,bool))"
  )
    .withArgs([ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(index))])
    .returns([
      ethereum.Value.fromFixedBytes(typeId),
      ethereum.Value.fromFixedBytes(selector),
      ethereum.Value.fromTuple(rule)
    ]);
}

describe("PaymasterHub global rulebook", () => {
  afterEach(() => {
    clearStore();
  });

  describe("handleGlobalRuleSet", () => {
    beforeEach(() => {
      setupHub();
    });

    test("creates a rulebook entry with the resolved module name", () => {
      let event = createGlobalRuleSetEvent(HUB, TASK_MANAGER_TYPE_ID, SELECTOR, true, 0);
      handleGlobalRuleSet(event);

      let id = globalRuleId(TASK_MANAGER_TYPE_ID, SELECTOR);
      assert.entityCount("PaymasterGlobalRule", 1);
      assert.fieldEquals("PaymasterGlobalRule", id, "paymasterHub", HUB.toHexString());
      assert.fieldEquals("PaymasterGlobalRule", id, "typeId", TASK_MANAGER_TYPE_ID.toHexString());
      assert.fieldEquals("PaymasterGlobalRule", id, "moduleName", "TaskManager");
      assert.fieldEquals("PaymasterGlobalRule", id, "selector", SELECTOR.toHexString());
      assert.fieldEquals("PaymasterGlobalRule", id, "allowed", "true");
      assert.fieldEquals("PaymasterGlobalRule", id, "maxCallGasHint", "0");
      // Provenance: setAt is the block TIMESTAMP, setAtBlock the block NUMBER — not swapped.
      assert.fieldEquals(
        "PaymasterGlobalRule",
        id,
        "setAt",
        event.block.timestamp.toString()
      );
      assert.fieldEquals(
        "PaymasterGlobalRule",
        id,
        "setAtBlock",
        event.block.number.toString()
      );
      assert.fieldEquals(
        "PaymasterGlobalRule",
        id,
        "transactionHash",
        event.transaction.hash.toHexString()
      );
    });

    test("round-trips a non-zero maxCallGasHint", () => {
      handleGlobalRuleSet(
        createGlobalRuleSetEvent(HUB, TASK_MANAGER_TYPE_ID, SELECTOR, true, 800000)
      );

      assert.fieldEquals(
        "PaymasterGlobalRule",
        globalRuleId(TASK_MANAGER_TYPE_ID, SELECTOR),
        "maxCallGasHint",
        "800000"
      );
    });

    test("allowed=false tombstones the entry in place rather than deleting it", () => {
      handleGlobalRuleSet(
        createGlobalRuleSetEvent(HUB, TASK_MANAGER_TYPE_ID, SELECTOR, true, 800000)
      );
      handleGlobalRuleSet(
        createGlobalRuleSetEvent(HUB, TASK_MANAGER_TYPE_ID, SELECTOR, false, 0)
      );

      let id = globalRuleId(TASK_MANAGER_TYPE_ID, SELECTOR);
      assert.entityCount("PaymasterGlobalRule", 1);
      assert.fieldEquals("PaymasterGlobalRule", id, "allowed", "false");
      assert.fieldEquals("PaymasterGlobalRule", id, "maxCallGasHint", "0");
    });

    test("names the protocol singleton typeIds that have no RegisteredContract row", () => {
      handleGlobalRuleSet(
        createGlobalRuleSetEvent(HUB, UNIVERSAL_ACCOUNT_REGISTRY_TYPE_ID, SELECTOR, true, 0)
      );

      assert.fieldEquals(
        "PaymasterGlobalRule",
        globalRuleId(UNIVERSAL_ACCOUNT_REGISTRY_TYPE_ID, SELECTOR),
        "moduleName",
        "UniversalAccountRegistry"
      );
    });

    test("stores an unknown typeId with a null moduleName", () => {
      handleGlobalRuleSet(createGlobalRuleSetEvent(HUB, UNKNOWN_TYPE_ID, SELECTOR, true, 0));

      let id = globalRuleId(UNKNOWN_TYPE_ID, SELECTOR);
      assert.entityCount("PaymasterGlobalRule", 1);
      assert.fieldEquals("PaymasterGlobalRule", id, "typeId", UNKNOWN_TYPE_ID.toHexString());
      assert.fieldEquals("PaymasterGlobalRule", id, "moduleName", "null");
    });
  });

  test("handleGlobalRuleSet is hub-level: no org config is required or referenced", () => {
    // Deliberately no setupHub()/setupOrg() — GlobalRuleSet carries no orgId, so it must create
    // the hub itself and leave PaymasterConfigChange.orgConfig unset.
    let event = createGlobalRuleSetEvent(HUB, TASK_MANAGER_TYPE_ID, SELECTOR, true, 0);
    event.logIndex = BigInt.fromI32(7);
    handleGlobalRuleSet(event);

    assert.entityCount("PaymasterHubContract", 1);
    assert.entityCount("PaymasterOrgConfig", 0);
    assert.entityCount("PaymasterGlobalRule", 1);

    let changeId = event.transaction.hash.concatI32(7).toHexString();
    assert.entityCount("PaymasterConfigChange", 1);
    assert.fieldEquals("PaymasterConfigChange", changeId, "changeType", "GlobalRuleSet");
    assert.fieldEquals("PaymasterConfigChange", changeId, "orgConfig", "null");
    clearStore();
  });

  describe("handleTargetTypeSet", () => {
    beforeEach(() => {
      setupHub();
      setupOrg(ORG_ID);
    });

    test("maps a target address to a module typeId", () => {
      handleTargetTypeSet(
        createTargetTypeSetEvent(HUB, ORG_ID, TARGET, TASK_MANAGER_TYPE_ID)
      );

      let id = targetTypeId(ORG_ID, TARGET);
      assert.entityCount("PaymasterTargetType", 1);
      assert.fieldEquals("PaymasterTargetType", id, "orgConfig", orgConfigId(ORG_ID));
      assert.fieldEquals("PaymasterTargetType", id, "target", TARGET.toHexString());
      assert.fieldEquals("PaymasterTargetType", id, "typeId", TASK_MANAGER_TYPE_ID.toHexString());
      assert.fieldEquals("PaymasterTargetType", id, "moduleName", "TaskManager");
      assert.fieldEquals("PaymasterTargetType", id, "cleared", "false");
    });

    test("typeId = bytes32(0) clears the mapping in place", () => {
      handleTargetTypeSet(
        createTargetTypeSetEvent(HUB, ORG_ID, TARGET, TASK_MANAGER_TYPE_ID)
      );
      handleTargetTypeSet(createTargetTypeSetEvent(HUB, ORG_ID, TARGET, ZERO_TYPE_ID));

      let id = targetTypeId(ORG_ID, TARGET);
      assert.entityCount("PaymasterTargetType", 1);
      assert.fieldEquals("PaymasterTargetType", id, "typeId", ZERO_TYPE_ID.toHexString());
      assert.fieldEquals("PaymasterTargetType", id, "cleared", "true");
      assert.fieldEquals("PaymasterTargetType", id, "moduleName", "null");
    });

    test("a cleared target can be re-typed — the cleared flag is not sticky", () => {
      handleTargetTypeSet(
        createTargetTypeSetEvent(HUB, ORG_ID, TARGET, TASK_MANAGER_TYPE_ID)
      );
      handleTargetTypeSet(createTargetTypeSetEvent(HUB, ORG_ID, TARGET, ZERO_TYPE_ID));
      handleTargetTypeSet(
        createTargetTypeSetEvent(HUB, ORG_ID, TARGET, TASK_MANAGER_TYPE_ID)
      );

      let id = targetTypeId(ORG_ID, TARGET);
      assert.entityCount("PaymasterTargetType", 1);
      assert.fieldEquals("PaymasterTargetType", id, "cleared", "false");
      assert.fieldEquals("PaymasterTargetType", id, "moduleName", "TaskManager");
      assert.fieldEquals("PaymasterTargetType", id, "typeId", TASK_MANAGER_TYPE_ID.toHexString());
    });

    test("files an org-scoped TargetTypeSet audit row", () => {
      let event = createTargetTypeSetEvent(HUB, ORG_ID, TARGET, TASK_MANAGER_TYPE_ID);
      event.logIndex = BigInt.fromI32(9);
      handleTargetTypeSet(event);

      let changeId = event.transaction.hash.concatI32(9).toHexString();
      assert.fieldEquals("PaymasterConfigChange", changeId, "changeType", "TargetTypeSet");
      assert.fieldEquals("PaymasterConfigChange", changeId, "orgConfig", orgConfigId(ORG_ID));
      assert.fieldEquals("PaymasterConfigChange", changeId, "paymasterHub", HUB.toHexString());
    });

    test("the same shared-registry address is typed separately under each org", () => {
      setupOrg(OTHER_ORG_ID);

      handleTargetTypeSet(
        createTargetTypeSetEvent(
          HUB,
          ORG_ID,
          SHARED_REGISTRY,
          UNIVERSAL_ACCOUNT_REGISTRY_TYPE_ID
        )
      );
      handleTargetTypeSet(
        createTargetTypeSetEvent(
          HUB,
          OTHER_ORG_ID,
          SHARED_REGISTRY,
          UNIVERSAL_ACCOUNT_REGISTRY_TYPE_ID
        )
      );

      assert.entityCount("PaymasterTargetType", 2);
      assert.fieldEquals(
        "PaymasterTargetType",
        targetTypeId(ORG_ID, SHARED_REGISTRY),
        "orgConfig",
        orgConfigId(ORG_ID)
      );
      assert.fieldEquals(
        "PaymasterTargetType",
        targetTypeId(OTHER_ORG_ID, SHARED_REGISTRY),
        "orgConfig",
        orgConfigId(OTHER_ORG_ID)
      );
    });
  });

  describe("handleRulesModeSet", () => {
    beforeEach(() => {
      setupHub();
      setupOrg(ORG_ID);
    });

    test("a newly registered org defaults to Mirror without any RulesModeSet", () => {
      assert.fieldEquals("PaymasterOrgConfig", orgConfigId(ORG_ID), "rulesMode", "Mirror");
      assert.entityCount("PaymasterRulesModeChange", 0);
    });

    test("mode=1 switches the org to Static and records the change", () => {
      let event = createRulesModeSetEvent(HUB, ORG_ID, 1);
      event.logIndex = BigInt.fromI32(3);
      handleRulesModeSet(event);

      assert.fieldEquals("PaymasterOrgConfig", orgConfigId(ORG_ID), "rulesMode", "Static");

      let recordId = event.transaction.hash.concatI32(3).toHexString();
      assert.entityCount("PaymasterRulesModeChange", 1);
      assert.fieldEquals("PaymasterRulesModeChange", recordId, "orgConfig", orgConfigId(ORG_ID));
      assert.fieldEquals("PaymasterRulesModeChange", recordId, "mode", "Static");
      assert.fieldEquals("PaymasterRulesModeChange", recordId, "modeRaw", "1");

      assert.fieldEquals("PaymasterConfigChange", recordId, "changeType", "RulesModeSet");
      assert.fieldEquals("PaymasterConfigChange", recordId, "orgConfig", orgConfigId(ORG_ID));
    });

    test("mode=0 switches back to Mirror and appends a second history row", () => {
      let toStatic = createRulesModeSetEvent(HUB, ORG_ID, 1);
      toStatic.logIndex = BigInt.fromI32(3);
      handleRulesModeSet(toStatic);

      let toMirror = createRulesModeSetEvent(HUB, ORG_ID, 0);
      toMirror.logIndex = BigInt.fromI32(4);
      handleRulesModeSet(toMirror);

      assert.fieldEquals("PaymasterOrgConfig", orgConfigId(ORG_ID), "rulesMode", "Mirror");
      assert.entityCount("PaymasterRulesModeChange", 2);
      assert.fieldEquals(
        "PaymasterRulesModeChange",
        toMirror.transaction.hash.concatI32(4).toHexString(),
        "modeRaw",
        "0"
      );
    });

    test("records history even when the org config has not been indexed", () => {
      clearStore();

      let event = createRulesModeSetEvent(HUB, ORG_ID, 1);
      event.logIndex = BigInt.fromI32(5);
      handleRulesModeSet(event);

      assert.entityCount("PaymasterOrgConfig", 0);
      assert.entityCount("PaymasterRulesModeChange", 1);
      assert.fieldEquals(
        "PaymasterRulesModeChange",
        event.transaction.hash.concatI32(5).toHexString(),
        "mode",
        "Static"
      );
    });
  });

  describe("handleGlobalRuleBlockSet", () => {
    beforeEach(() => {
      setupHub();
      setupOrg(ORG_ID);
    });

    test("setRule(false) writes a rule and a block under the same id, in emission order", () => {
      // The contract emits RuleSet first, then GlobalRuleBlockSet at a higher logIndex.
      let ruleSet = createRuleSetEvent(HUB, ORG_ID, TARGET, SELECTOR, false, 0);
      ruleSet.logIndex = BigInt.fromI32(1);
      handleRuleSet(ruleSet);

      let blockSet = createGlobalRuleBlockSetEvent(HUB, ORG_ID, TARGET, SELECTOR, true);
      blockSet.logIndex = BigInt.fromI32(2);
      handleGlobalRuleBlockSet(blockSet);

      let id = pairId(ORG_ID, TARGET, SELECTOR);
      assert.fieldEquals("PaymasterRule", id, "allowed", "false");
      assert.fieldEquals("PaymasterGlobalRuleBlock", id, "blocked", "true");
      assert.fieldEquals("PaymasterGlobalRuleBlock", id, "orgConfig", orgConfigId(ORG_ID));
      assert.fieldEquals("PaymasterGlobalRuleBlock", id, "target", TARGET.toHexString());
      assert.fieldEquals("PaymasterGlobalRuleBlock", id, "selector", SELECTOR.toHexString());

      let changeId = blockSet.transaction.hash.concatI32(2).toHexString();
      assert.fieldEquals("PaymasterConfigChange", changeId, "changeType", "GlobalRuleBlockSet");
      assert.fieldEquals("PaymasterConfigChange", changeId, "orgConfig", orgConfigId(ORG_ID));
    });

    test("an explicit deny keeps its non-zero hint, distinguishing it from an unset rule", () => {
      // Resolution step 2 hinges on this: {allowed:false, hint!=0} is an EXPLICIT DENY that
      // short-circuits the global fallback, while {allowed:false, hint:0} is merely UNSET.
      handleRuleSet(createRuleSetEvent(HUB, ORG_ID, TARGET, SELECTOR, false, 500000));

      let id = pairId(ORG_ID, TARGET, SELECTOR);
      assert.fieldEquals("PaymasterRule", id, "allowed", "false");
      assert.fieldEquals("PaymasterRule", id, "maxCallGasHint", "500000");

      // clearRule resets the pair to the protocol default: allowed=false AND hint=0.
      handleRuleSet(createRuleSetEvent(HUB, ORG_ID, TARGET, SELECTOR, true, 0));
      handleRuleSet(createRuleSetEvent(HUB, ORG_ID, TARGET, SELECTOR, false, 0));
      assert.fieldEquals("PaymasterRule", id, "maxCallGasHint", "0");
    });

    test("setRule(true) clears the standing block", () => {
      handleRuleSet(createRuleSetEvent(HUB, ORG_ID, TARGET, SELECTOR, false, 0));
      handleGlobalRuleBlockSet(
        createGlobalRuleBlockSetEvent(HUB, ORG_ID, TARGET, SELECTOR, true)
      );

      handleRuleSet(createRuleSetEvent(HUB, ORG_ID, TARGET, SELECTOR, true, 0));
      handleGlobalRuleBlockSet(
        createGlobalRuleBlockSetEvent(HUB, ORG_ID, TARGET, SELECTOR, false)
      );

      let id = pairId(ORG_ID, TARGET, SELECTOR);
      assert.fieldEquals("PaymasterRule", id, "allowed", "true");
      assert.fieldEquals("PaymasterGlobalRuleBlock", id, "blocked", "false");
    });

    test("the RuleSet/GlobalRuleBlockSet pair is order-independent", () => {
      // Same pair, dispatched in the reverse order: the two handlers write disjoint entities, so
      // the final state must be identical to the in-order case above.
      handleGlobalRuleBlockSet(
        createGlobalRuleBlockSetEvent(HUB, ORG_ID, TARGET, SELECTOR, true)
      );
      handleRuleSet(createRuleSetEvent(HUB, ORG_ID, TARGET, SELECTOR, false, 0));

      let id = pairId(ORG_ID, TARGET, SELECTOR);
      assert.entityCount("PaymasterRule", 1);
      assert.entityCount("PaymasterGlobalRuleBlock", 1);
      assert.fieldEquals("PaymasterRule", id, "allowed", "false");
      assert.fieldEquals("PaymasterGlobalRuleBlock", id, "blocked", "true");
    });

    test("a block can exist with no rule row, and re-emitting it is idempotent", () => {
      // The v20 migration reconstructs pre-v20 denials by emitting blocks alone.
      let first = createGlobalRuleBlockSetEvent(HUB, ORG_ID, TARGET, SELECTOR, true);
      first.logIndex = BigInt.fromI32(1);
      handleGlobalRuleBlockSet(first);

      let repeat = createGlobalRuleBlockSetEvent(HUB, ORG_ID, TARGET, SELECTOR, true);
      repeat.logIndex = BigInt.fromI32(2);
      handleGlobalRuleBlockSet(repeat);

      assert.entityCount("PaymasterRule", 0);
      assert.entityCount("PaymasterGlobalRuleBlock", 1);
      assert.fieldEquals(
        "PaymasterGlobalRuleBlock",
        pairId(ORG_ID, TARGET, SELECTOR),
        "blocked",
        "true"
      );
    });
  });

  describe("backfillGlobalRulebook", () => {
    test("materialises the enumerated rulebook with event-identical ids and fields", () => {
      mockRulebookCount(2);
      mockRuleAt(0, TASK_MANAGER_TYPE_ID, SELECTOR, 800000, true);
      mockRuleAt(1, UNIVERSAL_ACCOUNT_REGISTRY_TYPE_ID, SELECTOR, 0, true);

      backfillGlobalRulebook(
        HUB,
        BigInt.fromI32(1700000000),
        BigInt.fromI32(4242),
        Bytes.fromHexString("0xabcd")
      );

      assert.entityCount("PaymasterGlobalRule", 2);

      let id = globalRuleId(TASK_MANAGER_TYPE_ID, SELECTOR);
      assert.fieldEquals("PaymasterGlobalRule", id, "moduleName", "TaskManager");
      assert.fieldEquals("PaymasterGlobalRule", id, "allowed", "true");
      assert.fieldEquals("PaymasterGlobalRule", id, "maxCallGasHint", "800000");
      assert.fieldEquals("PaymasterGlobalRule", id, "setAt", "1700000000");
      assert.fieldEquals("PaymasterGlobalRule", id, "setAtBlock", "4242");

      assert.fieldEquals(
        "PaymasterGlobalRule",
        globalRuleId(UNIVERSAL_ACCOUNT_REGISTRY_TYPE_ID, SELECTOR),
        "moduleName",
        "UniversalAccountRegistry"
      );
    });

    test("a later GlobalRuleSet log overwrites the backfilled row under the same id", () => {
      mockRulebookCount(1);
      mockRuleAt(0, TASK_MANAGER_TYPE_ID, SELECTOR, 800000, true);
      backfillGlobalRulebook(
        HUB,
        BigInt.fromI32(1700000000),
        BigInt.fromI32(4242),
        Bytes.fromHexString("0xabcd")
      );

      handleGlobalRuleSet(
        createGlobalRuleSetEvent(HUB, TASK_MANAGER_TYPE_ID, SELECTOR, false, 0)
      );

      assert.entityCount("PaymasterGlobalRule", 1);
      assert.fieldEquals(
        "PaymasterGlobalRule",
        globalRuleId(TASK_MANAGER_TYPE_ID, SELECTOR),
        "allowed",
        "false"
      );
    });

    test("a pre-v20 hub without the getter is a silent no-op", () => {
      createMockedFunction(HUB, "getGlobalRuleCount", "getGlobalRuleCount():(uint256)").reverts();

      backfillGlobalRulebook(
        HUB,
        BigInt.fromI32(1700000000),
        BigInt.fromI32(4242),
        Bytes.fromHexString("0xabcd")
      );

      assert.entityCount("PaymasterGlobalRule", 0);
    });
  });
});
