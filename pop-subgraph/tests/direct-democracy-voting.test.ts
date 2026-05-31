import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  createMockedFunction
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  handleInitialized,
  handleCreatorHatSet
} from "../src/direct-democracy-voting";
import {
  createInitializedEvent,
  createCreatorHatSetEvent
} from "./direct-democracy-voting-utils";
import {
  Organization,
  DirectDemocracyVotingContract
} from "../generated/schema";

/**
 * Minimal setup: handleInitialized only needs the Organization (for the org
 * link + roleHatIds) and the DirectDemocracyVotingContract entity that
 * handleOrgDeployed would have created. Organization's contract links are
 * nullable in the schema, so no sibling contracts are required.
 */
function setupDDVContract(contractAddress: Address): void {
  let orgId = Bytes.fromHexString(
    "0x2222222222222222222222222222222222222222222222222222222222222222"
  );
  let organization = new Organization(orgId);
  organization.roleHatIds = [BigInt.fromI32(1001), BigInt.fromI32(1002)];
  organization.directDemocracyVoting = contractAddress;
  organization.save();

  let ddv = new DirectDemocracyVotingContract(contractAddress);
  ddv.organization = orgId;
  ddv.executor = Address.zero();
  ddv.thresholdPct = 0;
  ddv.quorum = 0;
  ddv.hats = Address.zero();
  ddv.createdAt = BigInt.fromI32(1000);
  ddv.createdAtBlock = BigInt.fromI32(100);
  ddv.save();
}

/**
 * Mock a uint256[] getter (creatorHats() / votingHats()) — the on-chain
 * enumerations handleInitialized reads to backfill hats that initialize()
 * seeded without events.
 */
function mockHatArray(contractAddress: Address, fnName: string, hatIds: BigInt[]): void {
  createMockedFunction(
    contractAddress,
    fnName,
    fnName + "():(uint256[])"
  ).returns([ethereum.Value.fromUnsignedBigIntArray(hatIds)]);
}

describe("DirectDemocracyVoting", () => {
  afterEach(() => {
    clearStore();
  });

  describe("Initialized backfill", () => {
    test("Creator and voting hats backfilled from on-chain enumerations", () => {
      let event = createInitializedEvent(BigInt.fromI32(1));
      setupDDVContract(event.address);
      mockHatArray(event.address, "creatorHats", [BigInt.fromI32(1002)]);
      mockHatArray(event.address, "votingHats", [
        BigInt.fromI32(1001),
        BigInt.fromI32(1002)
      ]);

      handleInitialized(event);

      // 1 creator + 2 voter rows
      assert.entityCount("HatPermission", 3);

      let creator = event.address.toHexString() + "-1002-Creator";
      assert.fieldEquals("HatPermission", creator, "permissionRole", "Creator");
      assert.fieldEquals("HatPermission", creator, "contractType", "DirectDemocracyVoting");
      assert.fieldEquals("HatPermission", creator, "allowed", "true");

      let voter1 = event.address.toHexString() + "-1001-Voter";
      assert.fieldEquals("HatPermission", voter1, "permissionRole", "Voter");
      assert.fieldEquals("HatPermission", voter1, "allowed", "true");

      let voter2 = event.address.toHexString() + "-1002-Voter";
      assert.fieldEquals("HatPermission", voter2, "permissionRole", "Voter");
    });

    test("Same hat can hold both Creator and Voter rows", () => {
      let event = createInitializedEvent(BigInt.fromI32(1));
      setupDDVContract(event.address);
      mockHatArray(event.address, "creatorHats", [BigInt.fromI32(1002)]);
      mockHatArray(event.address, "votingHats", [BigInt.fromI32(1002)]);

      handleInitialized(event);

      assert.entityCount("HatPermission", 2);
      assert.fieldEquals(
        "HatPermission",
        event.address.toHexString() + "-1002-Creator",
        "allowed",
        "true"
      );
      assert.fieldEquals(
        "HatPermission",
        event.address.toHexString() + "-1002-Voter",
        "allowed",
        "true"
      );
    });

    test("Backfill leaves an event-sourced creator row untouched", () => {
      let event = createInitializedEvent(BigInt.fromI32(1));
      setupDDVContract(event.address);

      // CreatorHatSet arrives first (post-deploy grant)...
      handleCreatorHatSet(createCreatorHatSetEvent(BigInt.fromI32(1002), true));
      // ...then the backfill reads the same hat — must not duplicate or overwrite.
      mockHatArray(event.address, "creatorHats", [BigInt.fromI32(1002)]);
      mockHatArray(event.address, "votingHats", []);
      handleInitialized(event);

      assert.entityCount("HatPermission", 1);
      assert.fieldEquals(
        "HatPermission",
        event.address.toHexString() + "-1002-Creator",
        "allowed",
        "true"
      );
    });

    test("Reverting getters are tolerated — no crash, no permissions", () => {
      let event = createInitializedEvent(BigInt.fromI32(1));
      setupDDVContract(event.address);
      createMockedFunction(
        event.address,
        "creatorHats",
        "creatorHats():(uint256[])"
      ).reverts();
      createMockedFunction(
        event.address,
        "votingHats",
        "votingHats():(uint256[])"
      ).reverts();

      handleInitialized(event);

      assert.entityCount("DirectDemocracyVotingContract", 1);
      assert.entityCount("HatPermission", 0);
    });
  });
});
