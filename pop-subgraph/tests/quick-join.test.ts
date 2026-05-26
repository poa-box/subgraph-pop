import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  handleMemberHatIdsUpdated,
  handleRegisterAndQuickJoined,
  handleRegisterAndQuickJoinedWithPasskey,
  handleRegisterAndQuickJoinedWithPasskeyByMaster
} from "../src/quick-join";
import {
  createMemberHatIdsUpdatedEvent,
  createRegisterAndQuickJoinedEvent,
  createRegisterAndQuickJoinedWithPasskeyEvent,
  createRegisterAndQuickJoinedWithPasskeyByMasterEvent
} from "./quick-join-utils";
import {
  Organization,
  QuickJoinContract,
  PasskeyAccount,
  PasskeyAccountFactory
} from "../generated/schema";

// Default mock event address from matchstick-as
let QUICK_JOIN_ADDRESS = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
let ORG_ID = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");

/**
 * Helper to create Organization and QuickJoinContract entities required for handler tests.
 */
function setupQuickJoinEntities(): void {
  let organization = new Organization(ORG_ID);
  organization.topHatId = BigInt.fromI32(1000);
  organization.roleHatIds = [BigInt.fromI32(1001), BigInt.fromI32(1002)];
  organization.deployedAt = BigInt.fromI32(1000);
  organization.deployedAtBlock = BigInt.fromI32(100);
  organization.transactionHash = Bytes.fromHexString("0xabcd");

  let quickJoin = new QuickJoinContract(QUICK_JOIN_ADDRESS);
  quickJoin.organization = ORG_ID;
  quickJoin.executor = Address.zero();
  quickJoin.hatsContract = Address.zero();
  quickJoin.accountRegistry = Address.zero();
  quickJoin.masterDeployAddress = Address.zero();
  quickJoin.memberHatIds = [];
  quickJoin.createdAt = BigInt.fromI32(1000);
  quickJoin.createdAtBlock = BigInt.fromI32(100);

  organization.quickJoin = QUICK_JOIN_ADDRESS;

  quickJoin.save();
  organization.save();
}

/**
 * Helper to create PasskeyAccountFactory and PasskeyAccount entities for passkey tests.
 */
function setupPasskeyAccount(accountAddress: Address, credentialId: Bytes): void {
  let factoryAddress = Address.fromString("0x0000000000000000000000000000000000000099");
  let factory = new PasskeyAccountFactory(factoryAddress);
  factory.poaManager = factoryAddress;
  factory.poaGuardian = Address.zero();
  factory.recoveryDelay = BigInt.fromI32(604800);
  factory.maxCredentialsPerAccount = 10;
  factory.paused = false;
  factory.createdAt = BigInt.fromI32(1000);
  factory.blockNumber = BigInt.fromI32(100);
  factory.save();

  let account = new PasskeyAccount(accountAddress);
  account.factory = factoryAddress;
  account.initialCredentialId = credentialId;
  account.owner = Address.zero();
  account.guardian = Address.zero();
  account.recoveryDelay = BigInt.fromI32(604800);
  account.createdAt = BigInt.fromI32(1000);
  account.blockNumber = BigInt.fromI32(100);
  account.transactionHash = Bytes.fromHexString("0xabcd");
  account.save();
}

describe("QuickJoin - Register and Join", () => {
  afterEach(() => {
    clearStore();
  });

  describe("handleRegisterAndQuickJoined", () => {
    test("creates QuickJoinEvent with isRegisterAndJoin true and username set", () => {
      setupQuickJoinEntities();

      let user = Address.fromString("0x0000000000000000000000000000000000000001");
      let username = "alice";
      let hatIds: BigInt[] = [BigInt.fromI32(1001), BigInt.fromI32(1002)];

      let event = createRegisterAndQuickJoinedEvent(user, username, hatIds);
      handleRegisterAndQuickJoined(event);

      assert.entityCount("QuickJoinEvent", 1);

      let eventId = QUICK_JOIN_ADDRESS.toHexString() + "-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
      assert.fieldEquals("QuickJoinEvent", eventId, "user", "0x0000000000000000000000000000000000000001");
      assert.fieldEquals("QuickJoinEvent", eventId, "isRegisterAndJoin", "true");
      assert.fieldEquals("QuickJoinEvent", eventId, "isMasterDeployJoin", "false");
      assert.fieldEquals("QuickJoinEvent", eventId, "username", "alice");
      assert.fieldEquals("QuickJoinEvent", eventId, "quickJoin", QUICK_JOIN_ADDRESS.toHexString());
    });
  });

  describe("handleRegisterAndQuickJoinedWithPasskey", () => {
    test("creates PasskeyQuickJoin with username set", () => {
      setupQuickJoinEntities();

      let accountAddress = Address.fromString("0x0000000000000000000000000000000000000001");
      let credentialId = Bytes.fromHexString("0x2222222222222222222222222222222222222222222222222222222222222222");
      let username = "bob";
      let hatIds: BigInt[] = [BigInt.fromI32(1001)];

      setupPasskeyAccount(accountAddress, credentialId);

      let event = createRegisterAndQuickJoinedWithPasskeyEvent(accountAddress, credentialId, username, hatIds);
      handleRegisterAndQuickJoinedWithPasskey(event);

      assert.entityCount("PasskeyQuickJoin", 1);

      let eventId = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
      assert.fieldEquals("PasskeyQuickJoin", eventId, "account", "0x0000000000000000000000000000000000000001");
      assert.fieldEquals("PasskeyQuickJoin", eventId, "username", "bob");
      assert.fieldEquals("PasskeyQuickJoin", eventId, "quickJoinContract", QUICK_JOIN_ADDRESS.toHexString());
      assert.fieldEquals("PasskeyQuickJoin", eventId, "credentialId", credentialId.toHexString());
    });
  });

  describe("handleRegisterAndQuickJoinedWithPasskeyByMaster", () => {
    test("creates PasskeyQuickJoin with master and username set", () => {
      setupQuickJoinEntities();

      let master = Address.fromString("0x0000000000000000000000000000000000000010");
      let accountAddress = Address.fromString("0x0000000000000000000000000000000000000001");
      let credentialId = Bytes.fromHexString("0x2222222222222222222222222222222222222222222222222222222222222222");
      let username = "charlie";
      let hatIds: BigInt[] = [BigInt.fromI32(1001), BigInt.fromI32(1002)];

      setupPasskeyAccount(accountAddress, credentialId);

      let event = createRegisterAndQuickJoinedWithPasskeyByMasterEvent(master, accountAddress, credentialId, username, hatIds);
      handleRegisterAndQuickJoinedWithPasskeyByMaster(event);

      assert.entityCount("PasskeyQuickJoin", 1);

      let eventId = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
      assert.fieldEquals("PasskeyQuickJoin", eventId, "account", "0x0000000000000000000000000000000000000001");
      assert.fieldEquals("PasskeyQuickJoin", eventId, "master", "0x0000000000000000000000000000000000000010");
      assert.fieldEquals("PasskeyQuickJoin", eventId, "username", "charlie");
      assert.fieldEquals("PasskeyQuickJoin", eventId, "quickJoinContract", QUICK_JOIN_ADDRESS.toHexString());
      assert.fieldEquals("PasskeyQuickJoin", eventId, "credentialId", credentialId.toHexString());
    });
  });

  describe("handleMemberHatIdsUpdated", () => {
    // Use unmocked-event sender so QUICK_JOIN_ADDRESS matches the entity created
    // in setupQuickJoinEntities (newMockEvent's default address).
    test("persists the hat list onto QuickJoinContract.memberHatIds", () => {
      setupQuickJoinEntities();

      let hatIds: BigInt[] = [BigInt.fromI32(1001), BigInt.fromI32(1002), BigInt.fromI32(1003)];

      let event = createMemberHatIdsUpdatedEvent(hatIds);
      handleMemberHatIdsUpdated(event);

      assert.fieldEquals(
        "QuickJoinContract",
        QUICK_JOIN_ADDRESS.toHexString(),
        "memberHatIds",
        "[1001, 1002, 1003]"
      );
    });

    test("overwrites previous list when called again", () => {
      setupQuickJoinEntities();

      let first = createMemberHatIdsUpdatedEvent([BigInt.fromI32(1001), BigInt.fromI32(1002)]);
      handleMemberHatIdsUpdated(first);

      let second = createMemberHatIdsUpdatedEvent([BigInt.fromI32(2001)]);
      handleMemberHatIdsUpdated(second);

      assert.fieldEquals(
        "QuickJoinContract",
        QUICK_JOIN_ADDRESS.toHexString(),
        "memberHatIds",
        "[2001]"
      );
    });
  });
});
