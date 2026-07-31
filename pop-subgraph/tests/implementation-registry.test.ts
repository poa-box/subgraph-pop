import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  handleImplementationRegistered,
  handleImplementationRegistryOwnershipTransferred
} from "../src/implementation-registry";
import {
  createImplementationRegisteredEvent,
  createRegistryOwnershipTransferredEvent,
  idOf
} from "./implementation-registry-utils";

// The live Gnosis ImplementationRegistry. Using the real address documents which contract these
// entities describe; nothing here depends on it being that particular value.
const REGISTRY = "0x72c16812ae2a6819f4d0d9e432a3818712fa5c63";
const OTHER_REGISTRY = "0x00000000000000000000000000000000000000e2";

const IMPL_A = "0x00000000000000000000000000000000000000a1";
const IMPL_B = "0x00000000000000000000000000000000000000b2";
const IMPL_C = "0x00000000000000000000000000000000000000c3";
const OWNER = "0x0000000000000000000000000000000000000f01";

function typeKey(registry: string, typeName: string): string {
  return registry + "-" + idOf(typeName).toHexString();
}

function register(
  typeName: string,
  version: string,
  impl: string,
  latest: boolean,
  logIndex: i32
): void {
  handleImplementationRegistered(
    createImplementationRegisteredEvent(
      Address.fromString(REGISTRY),
      typeName,
      version,
      Address.fromString(impl),
      latest,
      BigInt.fromI32(1000 + logIndex),
      BigInt.fromI32(45407967 + logIndex),
      BigInt.fromI32(logIndex)
    )
  );
}

describe("ImplementationRegistry", () => {
  afterEach(() => {
    clearStore();
  });

  test("first registration creates registry, type, version and audit rows", () => {
    register("TaskManager", "v1", IMPL_A, true, 0);

    assert.entityCount("ImplementationRegistryContract", 1);
    assert.entityCount("ImplementationType", 1);
    assert.entityCount("ImplementationVersion", 1);
    assert.entityCount("ImplementationRegistration", 1);

    // The whole point of the entity: address in, version + typeName out, with no join.
    assert.fieldEquals("ImplementationVersion", IMPL_A, "version", "v1");
    assert.fieldEquals("ImplementationVersion", IMPL_A, "typeName", "TaskManager");
    assert.fieldEquals("ImplementationVersion", IMPL_A, "latest", "true");
    assert.fieldEquals(
      "ImplementationVersion",
      IMPL_A,
      "typeId",
      idOf("TaskManager").toHexString()
    );
    assert.fieldEquals(
      "ImplementationVersion",
      IMPL_A,
      "versionId",
      idOf("v1").toHexString()
    );
    assert.fieldEquals("ImplementationVersion", IMPL_A, "registrationCount", "1");
    assert.fieldEquals("ImplementationVersion", IMPL_A, "registeredAt", "1000");
    assert.fieldEquals("ImplementationVersion", IMPL_A, "registeredAtBlock", "45407967");

    let tk = typeKey(REGISTRY, "TaskManager");
    assert.fieldEquals("ImplementationType", tk, "typeName", "TaskManager");
    assert.fieldEquals("ImplementationType", tk, "latestVersion", "v1");
    assert.fieldEquals("ImplementationType", tk, "latestImplementation", IMPL_A);
    assert.fieldEquals("ImplementationType", tk, "versionCount", "1");

    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "typeCount", "1");
    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "registrationCount", "1");
  });

  test("registering a newer version flips latest off the incumbent", () => {
    register("TaskManager", "v1", IMPL_A, true, 0);
    register("TaskManager", "v6", IMPL_B, true, 1);

    // Without the handover a client reading `latest` would see two current versions of the same
    // type and have no way to pick one.
    assert.fieldEquals("ImplementationVersion", IMPL_A, "latest", "false");
    assert.fieldEquals("ImplementationVersion", IMPL_B, "latest", "true");

    // The demoted row keeps its own identity — it is still v1, and still resolvable. This is the
    // case Beacon.currentImplementation cannot answer: a pinned SwitchableBeacon still points at
    // IMPL_A, and asking "what version is that?" must still return v1.
    assert.fieldEquals("ImplementationVersion", IMPL_A, "version", "v1");
    assert.fieldEquals("ImplementationVersion", IMPL_A, "typeName", "TaskManager");

    let tk = typeKey(REGISTRY, "TaskManager");
    assert.fieldEquals("ImplementationType", tk, "latestVersion", "v6");
    assert.fieldEquals("ImplementationType", tk, "latestImplementation", IMPL_B);
    assert.fieldEquals("ImplementationType", tk, "versionCount", "2");
    // One type, two versions — not two types.
    assert.entityCount("ImplementationType", 1);
    assert.entityCount("ImplementationVersion", 2);
  });

  test("registering with latest=false leaves the incumbent latest", () => {
    register("TaskManager", "v6", IMPL_A, true, 0);
    // A backfilled or staged version: registered, but explicitly not promoted.
    register("TaskManager", "v7", IMPL_B, false, 1);

    assert.fieldEquals("ImplementationVersion", IMPL_A, "latest", "true");
    assert.fieldEquals("ImplementationVersion", IMPL_B, "latest", "false");
    assert.fieldEquals(
      "ImplementationType",
      typeKey(REGISTRY, "TaskManager"),
      "latestVersion",
      "v6"
    );
  });

  test("re-registering the same address under a new version overwrites, keeping history", () => {
    register("TaskManager", "v6", IMPL_A, true, 0);
    // The registry rejects a duplicate (typeId, versionId) pair, but the same bytecode may be
    // registered again under a NEW version — e.g. re-publishing an unchanged module.
    register("TaskManager", "v7", IMPL_A, true, 1);

    assert.entityCount("ImplementationVersion", 1);
    assert.fieldEquals("ImplementationVersion", IMPL_A, "version", "v7");
    assert.fieldEquals("ImplementationVersion", IMPL_A, "registrationCount", "2");
    // Re-registering the address that is ALREADY latest must not demote itself.
    assert.fieldEquals("ImplementationVersion", IMPL_A, "latest", "true");
    // firstRegisteredAt is provenance and is never rewritten; registeredAt tracks the latest.
    assert.fieldEquals("ImplementationVersion", IMPL_A, "firstRegisteredAt", "1000");
    assert.fieldEquals("ImplementationVersion", IMPL_A, "registeredAt", "1001");

    // Nothing is lost: the immutable log still holds both registrations.
    assert.entityCount("ImplementationRegistration", 2);
    assert.fieldEquals(
      "ImplementationType",
      typeKey(REGISTRY, "TaskManager"),
      "versionCount",
      "2"
    );
  });

  test("two types sharing a version string stay independent", () => {
    // Every module is versioned in the same "vN" namespace, so "v6" is registered once per type.
    // Keying anything by version string alone would collapse these into one row.
    register("TaskManager", "v6", IMPL_A, true, 0);
    register("HybridVoting", "v6", IMPL_B, true, 1);

    assert.entityCount("ImplementationType", 2);
    assert.entityCount("ImplementationVersion", 2);

    assert.fieldEquals("ImplementationVersion", IMPL_A, "typeName", "TaskManager");
    assert.fieldEquals("ImplementationVersion", IMPL_B, "typeName", "HybridVoting");
    // Promoting HybridVoting v6 must not retire TaskManager v6.
    assert.fieldEquals("ImplementationVersion", IMPL_A, "latest", "true");
    assert.fieldEquals("ImplementationVersion", IMPL_B, "latest", "true");

    assert.fieldEquals(
      "ImplementationType",
      typeKey(REGISTRY, "TaskManager"),
      "latestImplementation",
      IMPL_A
    );
    assert.fieldEquals(
      "ImplementationType",
      typeKey(REGISTRY, "HybridVoting"),
      "latestImplementation",
      IMPL_B
    );
    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "typeCount", "2");
  });

  test("one address registered under two types does not retire the other type's latest", () => {
    register("TaskManager", "v1", IMPL_A, true, 0);
    // Same bytecode adopted by a second type. The address-keyed row now describes EducationHub,
    // so TaskManager's stale latestImplementation pointer must not be followed blindly.
    register("EducationHub", "v1", IMPL_A, true, 1);
    register("TaskManager", "v2", IMPL_C, true, 2);

    assert.fieldEquals("ImplementationVersion", IMPL_A, "typeName", "EducationHub");
    // IMPL_A is still EducationHub's current version — promoting TaskManager v2 must not clear it.
    assert.fieldEquals("ImplementationVersion", IMPL_A, "latest", "true");
    assert.fieldEquals("ImplementationVersion", IMPL_C, "latest", "true");
    assert.fieldEquals(
      "ImplementationType",
      typeKey(REGISTRY, "EducationHub"),
      "latestImplementation",
      IMPL_A
    );
    assert.fieldEquals(
      "ImplementationType",
      typeKey(REGISTRY, "TaskManager"),
      "latestImplementation",
      IMPL_C
    );
  });

  test("the same log delivered twice is ignored", () => {
    // The static dataSource and a template spawned by handleRegistryUpdated can both watch the
    // same registry, and graph-node delivers the log once per dataSource. Counters increment
    // here, so replay must be a no-op rather than a double count.
    let event = createImplementationRegisteredEvent(
      Address.fromString(REGISTRY),
      "TaskManager",
      "v6",
      Address.fromString(IMPL_A),
      true,
      BigInt.fromI32(1000),
      BigInt.fromI32(45407967),
      BigInt.fromI32(3)
    );
    handleImplementationRegistered(event);
    handleImplementationRegistered(event);

    assert.entityCount("ImplementationRegistration", 1);
    assert.fieldEquals("ImplementationVersion", IMPL_A, "registrationCount", "1");
    assert.fieldEquals(
      "ImplementationType",
      typeKey(REGISTRY, "TaskManager"),
      "versionCount",
      "1"
    );
    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "registrationCount", "1");
    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "typeCount", "1");
  });

  test("types are scoped per registry so a repoint cannot collide", () => {
    register("TaskManager", "v6", IMPL_A, true, 0);
    handleImplementationRegistered(
      createImplementationRegisteredEvent(
        Address.fromString(OTHER_REGISTRY),
        "TaskManager",
        "v6",
        Address.fromString(IMPL_B),
        true,
        BigInt.fromI32(2000),
        BigInt.fromI32(46000000),
        // Must differ from the logIndex above: newMockEvent() hands out a CONSTANT transaction
        // hash, so two fixtures sharing a logIndex also share the txHash+logIndex dedupe key and
        // the second would be dropped as a replay. On a real chain that key is unique per log.
        BigInt.fromI32(9)
      )
    );

    assert.entityCount("ImplementationRegistryContract", 2);
    // Same typeName, same version, different registry — two rows, not one overwritten row.
    assert.entityCount("ImplementationType", 2);
    assert.fieldEquals(
      "ImplementationType",
      typeKey(REGISTRY, "TaskManager"),
      "latestImplementation",
      IMPL_A
    );
    assert.fieldEquals(
      "ImplementationType",
      typeKey(OTHER_REGISTRY, "TaskManager"),
      "latestImplementation",
      IMPL_B
    );
  });

  test("OwnershipTransferred records the owner and creates the registry row", () => {
    handleImplementationRegistryOwnershipTransferred(
      createRegistryOwnershipTransferredEvent(
        Address.fromString(REGISTRY),
        Address.zero(),
        Address.fromString(OWNER)
      )
    );

    assert.entityCount("ImplementationRegistryContract", 1);
    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "owner", OWNER);
    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "registrationCount", "0");

    // The row already existing must not reset counters on the first real registration.
    register("TaskManager", "v6", IMPL_A, true, 0);
    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "owner", OWNER);
    assert.fieldEquals("ImplementationRegistryContract", REGISTRY, "registrationCount", "1");
  });
});
