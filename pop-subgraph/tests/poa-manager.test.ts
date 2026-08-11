import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  beforeEach,
  createMockedFunction
} from "matchstick-as/assembly/index";
import { dataSourceMock } from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  handleBeaconCreated,
  handleBeaconUpgraded,
  handleRegistryUpdated,
  handleInfrastructureDeployed
} from "../src/poa-manager";
import {
  createBeaconCreatedEvent,
  createBeaconUpgradedEvent,
  createRegistryUpdatedEvent,
  createInfrastructureDeployedEvent
} from "./poa-manager-utils";
import { PoaManagerContract, Beacon, BeaconUpgradeEvent } from "../generated/schema";

// Default mock event address used by matchstick-as
const DEFAULT_ADDRESS = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a";
const NETWORK = "sepolia";
const HUB = Address.fromString("0x00000000000000000000000000000000000000fe");
const OTHER = Address.fromString("0x00000000000000000000000000000000000000ff");
const ACCOUNT_REGISTRY = Address.fromString("0x55f72ceb09cbc1faaed734b6505b99b0a1dfa1ca");

// Mocks the getters handleInfrastructureDeployed reads at the InfrastructureDeployed block.
// Module scope, not inside describe() — AssemblyScript has no closures.
function mockHubGetters(): void {
  createMockedFunction(HUB, "ENTRY_POINT", "ENTRY_POINT():(address)").returns([
    ethereum.Value.fromAddress(Address.fromString("0x0000000071727de22e5e9d8baf0edac6f37da032"))
  ]);
  createMockedFunction(HUB, "HATS", "HATS():(address)").returns([
    ethereum.Value.fromAddress(Address.fromString("0x3bc1a0ad72417f2d411118085256fc53cbddd137"))
  ]);
  createMockedFunction(HUB, "POA_MANAGER", "POA_MANAGER():(address)").returns([
    ethereum.Value.fromAddress(Address.fromString("0x00000000000000000000000000000000000000a1"))
  ]);
  createMockedFunction(
    HUB,
    "getSolidarityFund",
    "getSolidarityFund():((uint128,uint32,uint16,bool))"
  ).reverts();
  createMockedFunction(
    HUB,
    "getGracePeriodConfig",
    "getGracePeriodConfig():((uint32,uint128,uint128))"
  ).reverts();
  createMockedFunction(
    HUB,
    "getOrgDeployConfig",
    "getOrgDeployConfig():((uint128,uint128,uint128,uint32,uint8,bool,address))"
  ).reverts();
  createMockedFunction(HUB, "getGlobalRuleCount", "getGlobalRuleCount():(uint256)").reverts();
}

describe("PoaManager", () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(NETWORK);
  });

  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  describe("handleBeaconCreated", () => {
    test("creates PoaManagerContract if it doesn't exist", () => {
      let typeId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let typeName = "TaskManager";
      let beacon = Address.fromString("0x0000000000000000000000000000000000000001");
      let implementation = Address.fromString("0x0000000000000000000000000000000000000002");

      let event = createBeaconCreatedEvent(typeId, typeName, beacon, implementation);
      handleBeaconCreated(event);

      assert.entityCount("PoaManagerContract", 1);
      assert.fieldEquals(
        "PoaManagerContract",
        DEFAULT_ADDRESS,
        "beaconCount",
        "1"
      );
    });

    test("creates Beacon entity with correct fields", () => {
      let typeId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let typeName = "TaskManager";
      let beacon = Address.fromString("0x0000000000000000000000000000000000000001");
      let implementation = Address.fromString("0x0000000000000000000000000000000000000002");

      let event = createBeaconCreatedEvent(typeId, typeName, beacon, implementation);
      handleBeaconCreated(event);

      let beaconId = NETWORK + "-" + typeId.toHexString();
      assert.entityCount("Beacon", 1);
      assert.fieldEquals("Beacon", beaconId, "typeName", "TaskManager");
      assert.fieldEquals("Beacon", beaconId, "beaconAddress", beacon.toHexString());
      assert.fieldEquals("Beacon", beaconId, "currentImplementation", implementation.toHexString());
      assert.fieldEquals("Beacon", beaconId, "version", "v1");
    });

    test("increments beacon count for multiple beacons", () => {
      let typeId1 = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let typeId2 = Bytes.fromHexString("0x2222222222222222222222222222222222222222222222222222222222222222");
      let beacon = Address.fromString("0x0000000000000000000000000000000000000001");
      let implementation = Address.fromString("0x0000000000000000000000000000000000000002");

      let event1 = createBeaconCreatedEvent(typeId1, "TaskManager", beacon, implementation);
      handleBeaconCreated(event1);

      let event2 = createBeaconCreatedEvent(typeId2, "Executor", beacon, implementation);
      handleBeaconCreated(event2);

      assert.entityCount("Beacon", 2);
      assert.fieldEquals(
        "PoaManagerContract",
        DEFAULT_ADDRESS,
        "beaconCount",
        "2"
      );
    });

    test("stores correct typeId as bytes", () => {
      let typeId = Bytes.fromHexString("0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789");
      let typeName = "HybridVoting";
      let beacon = Address.fromString("0x0000000000000000000000000000000000000001");
      let implementation = Address.fromString("0x0000000000000000000000000000000000000002");

      let event = createBeaconCreatedEvent(typeId, typeName, beacon, implementation);
      handleBeaconCreated(event);

      let beaconId = NETWORK + "-" + typeId.toHexString();
      assert.fieldEquals("Beacon", beaconId, "typeId", typeId.toHexString());
    });
  });

  describe("handleBeaconUpgraded", () => {
    test("updates Beacon implementation and version", () => {
      // First create a beacon
      let typeId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let typeName = "TaskManager";
      let beacon = Address.fromString("0x0000000000000000000000000000000000000001");
      let implementation = Address.fromString("0x0000000000000000000000000000000000000002");

      let createEvent = createBeaconCreatedEvent(typeId, typeName, beacon, implementation);
      handleBeaconCreated(createEvent);

      // Now upgrade it
      let newImplementation = Address.fromString("0x0000000000000000000000000000000000000003");
      let upgradeEvent = createBeaconUpgradedEvent(typeId, newImplementation, "v2");
      handleBeaconUpgraded(upgradeEvent);

      let beaconId = NETWORK + "-" + typeId.toHexString();
      assert.fieldEquals("Beacon", beaconId, "currentImplementation", newImplementation.toHexString());
      assert.fieldEquals("Beacon", beaconId, "version", "v2");
    });

    test("creates BeaconUpgradeEvent history record", () => {
      // First create a beacon
      let typeId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let typeName = "TaskManager";
      let beacon = Address.fromString("0x0000000000000000000000000000000000000001");
      let implementation = Address.fromString("0x0000000000000000000000000000000000000002");

      let createEvent = createBeaconCreatedEvent(typeId, typeName, beacon, implementation);
      handleBeaconCreated(createEvent);

      // Now upgrade it
      let newImplementation = Address.fromString("0x0000000000000000000000000000000000000003");
      let upgradeEvent = createBeaconUpgradedEvent(typeId, newImplementation, "v2");
      handleBeaconUpgraded(upgradeEvent);

      assert.entityCount("BeaconUpgradeEvent", 1);
    });

    test("upgrade without existing beacon still creates history", () => {
      let typeId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let newImplementation = Address.fromString("0x0000000000000000000000000000000000000003");

      let upgradeEvent = createBeaconUpgradedEvent(typeId, newImplementation, "v2");
      handleBeaconUpgraded(upgradeEvent);

      // History should still be created even if beacon doesn't exist
      assert.entityCount("BeaconUpgradeEvent", 1);
    });

    test("multiple upgrades create multiple history records", () => {
      // First create a beacon
      let typeId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let typeName = "TaskManager";
      let beacon = Address.fromString("0x0000000000000000000000000000000000000001");
      let implementation = Address.fromString("0x0000000000000000000000000000000000000002");

      let createEvent = createBeaconCreatedEvent(typeId, typeName, beacon, implementation);
      handleBeaconCreated(createEvent);

      // Upgrade to v2
      let newImpl1 = Address.fromString("0x0000000000000000000000000000000000000003");
      let upgradeEvent1 = createBeaconUpgradedEvent(typeId, newImpl1, "v2");
      handleBeaconUpgraded(upgradeEvent1);

      // Upgrade to v3 (need different log index)
      let newImpl2 = Address.fromString("0x0000000000000000000000000000000000000004");
      let upgradeEvent2 = createBeaconUpgradedEvent(typeId, newImpl2, "v3");
      upgradeEvent2.logIndex = BigInt.fromI32(2);
      handleBeaconUpgraded(upgradeEvent2);

      assert.entityCount("BeaconUpgradeEvent", 2);
      
      let beaconId = NETWORK + "-" + typeId.toHexString();
      assert.fieldEquals("Beacon", beaconId, "currentImplementation", newImpl2.toHexString());
      assert.fieldEquals("Beacon", beaconId, "version", "v3");
    });
  });

  describe("handleRegistryUpdated", () => {
    test("creates PoaManagerContract if it doesn't exist", () => {
      let oldRegistry = Address.fromString("0x0000000000000000000000000000000000000001");
      let newRegistry = Address.fromString("0x0000000000000000000000000000000000000002");

      let event = createRegistryUpdatedEvent(oldRegistry, newRegistry);
      handleRegistryUpdated(event);

      assert.entityCount("PoaManagerContract", 1);
      assert.fieldEquals(
        "PoaManagerContract",
        DEFAULT_ADDRESS,
        "registry",
        newRegistry.toHexString()
      );
    });

    test("updates existing PoaManagerContract registry", () => {
      // First create a beacon to set up the PoaManager
      let typeId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let typeName = "TaskManager";
      let beacon = Address.fromString("0x0000000000000000000000000000000000000001");
      let implementation = Address.fromString("0x0000000000000000000000000000000000000002");

      let createEvent = createBeaconCreatedEvent(typeId, typeName, beacon, implementation);
      handleBeaconCreated(createEvent);

      // Now update registry
      let oldRegistry = Address.fromString("0x0000000000000000000000000000000000000003");
      let newRegistry = Address.fromString("0x0000000000000000000000000000000000000004");

      let event = createRegistryUpdatedEvent(oldRegistry, newRegistry);
      handleRegistryUpdated(event);

      assert.fieldEquals(
        "PoaManagerContract",
        DEFAULT_ADDRESS,
        "registry",
        newRegistry.toHexString()
      );
    });

    test("creates RegistryUpdate history record", () => {
      let oldRegistry = Address.fromString("0x0000000000000000000000000000000000000001");
      let newRegistry = Address.fromString("0x0000000000000000000000000000000000000002");

      let event = createRegistryUpdatedEvent(oldRegistry, newRegistry);
      handleRegistryUpdated(event);

      assert.entityCount("RegistryUpdate", 1);
    });

    test("multiple registry updates create multiple history records", () => {
      let oldRegistry1 = Address.fromString("0x0000000000000000000000000000000000000001");
      let newRegistry1 = Address.fromString("0x0000000000000000000000000000000000000002");

      let event1 = createRegistryUpdatedEvent(oldRegistry1, newRegistry1);
      handleRegistryUpdated(event1);

      let oldRegistry2 = Address.fromString("0x0000000000000000000000000000000000000002");
      let newRegistry2 = Address.fromString("0x0000000000000000000000000000000000000003");

      let event2 = createRegistryUpdatedEvent(oldRegistry2, newRegistry2);
      event2.logIndex = BigInt.fromI32(2);
      handleRegistryUpdated(event2);

      assert.entityCount("RegistryUpdate", 2);
      assert.fieldEquals(
        "PoaManagerContract",
        DEFAULT_ADDRESS,
        "registry",
        newRegistry2.toHexString()
      );
    });
  });

  describe("handleInfrastructureDeployed — pre-registration catch-up reads", () => {
    // Every getter below is read at the InfrastructureDeployed block to recover state the
    // deploy script set BEFORE the PaymasterHub template existed. Only the onboarding pair is
    // asserted here; the rest are mocked so the handler runs to completion.

    test("v20 hub: reads the 7-field onboarding tuple including the per-account cap", () => {
      mockHubGetters();
      let cfg = new ethereum.Tuple();
      cfg.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromString("10000000000000000")));
      cfg.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1000)));
      cfg.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))); // attemptsToday
      cfg.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(20607))); // currentDay
      cfg.push(ethereum.Value.fromBoolean(true));
      cfg.push(ethereum.Value.fromAddress(ACCOUNT_REGISTRY));
      cfg.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(3)));
      createMockedFunction(
        HUB,
        "getOnboardingConfig",
        "getOnboardingConfig():((uint128,uint128,uint128,uint32,bool,address,uint8))"
      ).returns([ethereum.Value.fromTuple(cfg)]);

      handleInfrastructureDeployed(
        createInfrastructureDeployedEvent(OTHER, OTHER, OTHER, HUB, OTHER, OTHER)
      );

      assert.fieldEquals("OnboardingConfig", HUB.toHexString(), "maxOnboardingsPerAccount", "3");
      assert.fieldEquals("OnboardingConfig", HUB.toHexString(), "dailyCreationLimit", "1000");
    });

    test("pre-#175 hub: falls back to the 6-field shim and records 0 (== unlimited)", () => {
      // The real case on arbitrum-one (447060027) and gnosis (45408029): the v20 arity cannot
      // decode a 6-field return, so graph-node reports it as reverted and the shim takes over.
      mockHubGetters();
      createMockedFunction(
        HUB,
        "getOnboardingConfig",
        "getOnboardingConfig():((uint128,uint128,uint128,uint32,bool,address,uint8))"
      ).reverts();

      let legacy = new ethereum.Tuple();
      legacy.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromString("10000000000000000")));
      legacy.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1000)));
      legacy.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0)));
      legacy.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0)));
      legacy.push(ethereum.Value.fromBoolean(true));
      legacy.push(ethereum.Value.fromAddress(ACCOUNT_REGISTRY));
      createMockedFunction(
        HUB,
        "getOnboardingConfig",
        "getOnboardingConfig():((uint128,uint128,uint128,uint32,bool,address))"
      ).returns([ethereum.Value.fromTuple(legacy)]);

      handleInfrastructureDeployed(
        createInfrastructureDeployedEvent(OTHER, OTHER, OTHER, HUB, OTHER, OTHER)
      );

      assert.fieldEquals("OnboardingConfig", HUB.toHexString(), "maxOnboardingsPerAccount", "0");
      assert.fieldEquals("OnboardingConfig", HUB.toHexString(), "dailyCreationLimit", "1000");
      assert.fieldEquals(
        "OnboardingConfig",
        HUB.toHexString(),
        "accountRegistry",
        ACCOUNT_REGISTRY.toHexString()
      );
    });

    test("both shapes unavailable leaves no OnboardingConfig rather than a zeroed one", () => {
      mockHubGetters();
      createMockedFunction(
        HUB,
        "getOnboardingConfig",
        "getOnboardingConfig():((uint128,uint128,uint128,uint32,bool,address,uint8))"
      ).reverts();
      createMockedFunction(
        HUB,
        "getOnboardingConfig",
        "getOnboardingConfig():((uint128,uint128,uint128,uint32,bool,address))"
      ).reverts();

      handleInfrastructureDeployed(
        createInfrastructureDeployedEvent(OTHER, OTHER, OTHER, HUB, OTHER, OTHER)
      );

      assert.entityCount("OnboardingConfig", 0);
    });
  });

  describe("Integration tests", () => {
    test("full lifecycle: create beacons, upgrade, update registry", () => {
      // Create first beacon
      let typeId1 = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
      let beacon1 = Address.fromString("0x0000000000000000000000000000000000000001");
      let impl1 = Address.fromString("0x0000000000000000000000000000000000000002");

      let createEvent1 = createBeaconCreatedEvent(typeId1, "TaskManager", beacon1, impl1);
      handleBeaconCreated(createEvent1);

      // Create second beacon
      let typeId2 = Bytes.fromHexString("0x2222222222222222222222222222222222222222222222222222222222222222");
      let beacon2 = Address.fromString("0x0000000000000000000000000000000000000003");
      let impl2 = Address.fromString("0x0000000000000000000000000000000000000004");

      let createEvent2 = createBeaconCreatedEvent(typeId2, "Executor", beacon2, impl2);
      createEvent2.logIndex = BigInt.fromI32(2);
      handleBeaconCreated(createEvent2);

      // Upgrade first beacon
      let newImpl = Address.fromString("0x0000000000000000000000000000000000000005");
      let upgradeEvent = createBeaconUpgradedEvent(typeId1, newImpl, "v2");
      upgradeEvent.logIndex = BigInt.fromI32(3);
      handleBeaconUpgraded(upgradeEvent);

      // Update registry
      let oldRegistry = Address.fromString("0x0000000000000000000000000000000000000006");
      let newRegistry = Address.fromString("0x0000000000000000000000000000000000000007");
      let registryEvent = createRegistryUpdatedEvent(oldRegistry, newRegistry);
      registryEvent.logIndex = BigInt.fromI32(4);
      handleRegistryUpdated(registryEvent);

      // Verify final state
      assert.entityCount("PoaManagerContract", 1);
      assert.entityCount("Beacon", 2);
      assert.entityCount("BeaconUpgradeEvent", 1);
      assert.entityCount("RegistryUpdate", 1);

      assert.fieldEquals(
        "PoaManagerContract",
        DEFAULT_ADDRESS,
        "beaconCount",
        "2"
      );
      assert.fieldEquals(
        "PoaManagerContract",
        DEFAULT_ADDRESS,
        "registry",
        newRegistry.toHexString()
      );

      let beacon1Id = NETWORK + "-" + typeId1.toHexString();
      assert.fieldEquals("Beacon", beacon1Id, "currentImplementation", newImpl.toHexString());
      assert.fieldEquals("Beacon", beacon1Id, "version", "v2");

      let beacon2Id = NETWORK + "-" + typeId2.toHexString();
      assert.fieldEquals("Beacon", beacon2Id, "currentImplementation", impl2.toHexString());
      assert.fieldEquals("Beacon", beacon2Id, "version", "v1");
    });
  });
});
