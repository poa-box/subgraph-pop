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
  handleTransfer,
  handleInitialized,
  handleMemberHatSet,
  handleApproverHatSet,
  handleRequested,
  handleRequestApproved,
  handleRequestCancelled,
  handleTaskManagerSet,
  handleEducationHubSet
} from "../src/participation-token";
import {
  createTransferEvent,
  createMintEvent,
  createBurnEvent,
  createInitializedEvent,
  createMemberHatSetEvent,
  createApproverHatSetEvent,
  createRequestedEvent,
  createRequestApprovedEvent,
  createRequestCancelledEvent,
  createTaskManagerSetEvent,
  createEducationHubSetEvent
} from "./participation-token-utils";
import {
  Organization,
  ParticipationTokenContract,
  User,
  TokenBalance
} from "../generated/schema";

const PARTICIPATION_TOKEN_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000005");
const ORG_ID = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
const USER_1 = Address.fromString("0x0000000000000000000000000000000000000001");
const USER_2 = Address.fromString("0x0000000000000000000000000000000000000002");
const USER_3 = Address.fromString("0x0000000000000000000000000000000000000003");
const ZERO_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000000");
const EXECUTOR = Address.fromString("0x00000000000000000000000000000000000000e0");
// The real Hats protocol singleton, shared by Gnosis and Arbitrum.
const HATS = Address.fromString("0x3bc1A0Ad72417f2d411118085256fC53CBdDd137");

/**
 * Helper function to create a User entity for testing.
 * Users are only created by JOIN events (QuickJoin, HatClaim) in production,
 * so we need to pre-create them for ACTIVITY event tests like token transfers.
 */
function createTestUser(userAddress: Address): void {
  let userId = ORG_ID.toHexString() + "-" + userAddress.toHexString();
  let user = new User(userId);
  user.organization = ORG_ID;
  user.address = userAddress;
  user.account = userAddress;
  user.participationTokenBalance = BigInt.fromI32(0);
  user.totalVotes = BigInt.fromI32(0);
  user.totalTasksCompleted = BigInt.fromI32(0);
  user.totalTasksCancelled = BigInt.fromI32(0);
  user.totalTasksLostToExpiry = BigInt.fromI32(0);
  user.totalTasksReleased = BigInt.fromI32(0);
  user.totalModulesCompleted = BigInt.fromI32(0);
  user.totalClaimsAmount = BigInt.fromI32(0);
  user.totalPaymentsAmount = BigInt.fromI32(0);
  user.totalTokenRequestsAmount = BigInt.fromI32(0);
  user.firstSeenAt = BigInt.fromI32(1000);
  user.firstSeenAtBlock = BigInt.fromI32(100);
  user.lastActiveAt = BigInt.fromI32(1000);
  user.lastActiveAtBlock = BigInt.fromI32(100);
  user.currentHatIds = [];
  user.membershipStatus = "Active";
  user.joinMethod = "QuickJoin";
  user.save();
}

/**
 * Helper function to set up the required entities for participation token tests.
 */
function setupParticipationTokenEntities(): void {
  // Create Organization entity
  let organization = new Organization(ORG_ID);
  organization.topHatId = BigInt.fromI32(1000);
  organization.roleHatIds = [BigInt.fromI32(1001), BigInt.fromI32(1002)];
  organization.deployedAt = BigInt.fromI32(1000);
  organization.deployedAtBlock = BigInt.fromI32(100);
  organization.transactionHash = Bytes.fromHexString("0xabcd");
  organization.participationToken = PARTICIPATION_TOKEN_ADDRESS;
  organization.save();

  // Create ParticipationTokenContract entity
  let participationToken = new ParticipationTokenContract(PARTICIPATION_TOKEN_ADDRESS);
  participationToken.organization = ORG_ID;
  participationToken.name = "Test Token";
  participationToken.symbol = "TEST";
  participationToken.totalSupply = BigInt.fromI32(0);
  participationToken.executor = Address.zero();
  participationToken.hatsContract = Address.zero();
  participationToken.createdAt = BigInt.fromI32(1000);
  participationToken.createdAtBlock = BigInt.fromI32(100);
  participationToken.save();
}

/**
 * Helper function to set up entities for participation token tests including Users.
 * Use this for tests that expect User entities to be updated.
 */
function setupParticipationTokenEntitiesWithUsers(): void {
  setupParticipationTokenEntities();
  createTestUser(USER_1);
  createTestUser(USER_2);
  createTestUser(USER_3);
}

describe("ParticipationToken", () => {
  afterEach(() => {
    clearStore();
  });

  describe("Initialized", () => {
    // executor and hats are written ONLY inside initialize() — ParticipationToken has no
    // ExecutorUpdated/HatsSet event and no setter — so the getters are the only way to reach
    // them. Before this, both non-null fields sat at the zero address on every live row.
    test("hydrates executor and hats from the getters", () => {
      setupParticipationTokenEntities();

      createMockedFunction(PARTICIPATION_TOKEN_ADDRESS, "name", "name():(string)").returns([
        ethereum.Value.fromString("Argus Token")
      ]);
      createMockedFunction(PARTICIPATION_TOKEN_ADDRESS, "symbol", "symbol():(string)").returns([
        ethereum.Value.fromString("PT")
      ]);
      createMockedFunction(
        PARTICIPATION_TOKEN_ADDRESS,
        "executor",
        "executor():(address)"
      ).returns([ethereum.Value.fromAddress(EXECUTOR)]);
      createMockedFunction(PARTICIPATION_TOKEN_ADDRESS, "hats", "hats():(address)").returns([
        ethereum.Value.fromAddress(HATS)
      ]);

      handleInitialized(createInitializedEvent(BigInt.fromI32(1), PARTICIPATION_TOKEN_ADDRESS));

      let id = PARTICIPATION_TOKEN_ADDRESS.toHexString();
      assert.fieldEquals("ParticipationTokenContract", id, "executor", EXECUTOR.toHexString());
      assert.fieldEquals("ParticipationTokenContract", id, "hatsContract", HATS.toHexString());
      assert.fieldEquals("ParticipationTokenContract", id, "name", "Argus Token");
      assert.fieldEquals("ParticipationTokenContract", id, "symbol", "PT");
    });

    test("a reverting getter leaves the seeded value rather than aborting", () => {
      // Both fields are non-null in the schema, so a revert must not be allowed to leave the
      // entity unsaved — the remaining reads still have to land.
      setupParticipationTokenEntities();

      createMockedFunction(PARTICIPATION_TOKEN_ADDRESS, "name", "name():(string)").returns([
        ethereum.Value.fromString("Argus Token")
      ]);
      createMockedFunction(PARTICIPATION_TOKEN_ADDRESS, "symbol", "symbol():(string)").returns([
        ethereum.Value.fromString("PT")
      ]);
      createMockedFunction(PARTICIPATION_TOKEN_ADDRESS, "executor", "executor():(address)").reverts();
      createMockedFunction(PARTICIPATION_TOKEN_ADDRESS, "hats", "hats():(address)").returns([
        ethereum.Value.fromAddress(HATS)
      ]);

      handleInitialized(createInitializedEvent(BigInt.fromI32(1), PARTICIPATION_TOKEN_ADDRESS));

      let id = PARTICIPATION_TOKEN_ADDRESS.toHexString();
      assert.fieldEquals(
        "ParticipationTokenContract",
        id,
        "executor",
        Address.zero().toHexString()
      );
      assert.fieldEquals("ParticipationTokenContract", id, "hatsContract", HATS.toHexString());
      assert.fieldEquals("ParticipationTokenContract", id, "name", "Argus Token");
    });
  });

  describe("Transfer - Minting (from zero address)", () => {
    test("Mint creates TokenBalance entity for receiver", () => {
      setupParticipationTokenEntities();

      let amount = BigInt.fromI32(1000);
      let event = createMintEvent(USER_1, amount, PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(event);

      // Verify TokenBalance entity was created
      let tokenBalanceId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_1.toHexString();
      assert.entityCount("TokenBalance", 1);
      assert.fieldEquals("TokenBalance", tokenBalanceId, "balance", "1000");
      assert.fieldEquals("TokenBalance", tokenBalanceId, "account", USER_1.toHexString());
    });

    test("Mint increases User.participationTokenBalance", () => {
      setupParticipationTokenEntitiesWithUsers();

      let amount = BigInt.fromI32(1000);
      let event = createMintEvent(USER_1, amount, PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(event);

      // Verify User balance was updated (User was pre-created via JOIN event simulation)
      let userId = ORG_ID.toHexString() + "-" + USER_1.toHexString();
      assert.fieldEquals("User", userId, "participationTokenBalance", "1000");
    });

    test("Mint increases totalSupply on contract", () => {
      setupParticipationTokenEntities();

      let amount = BigInt.fromI32(1000);
      let event = createMintEvent(USER_1, amount, PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(event);

      assert.fieldEquals(
        "ParticipationTokenContract",
        PARTICIPATION_TOKEN_ADDRESS.toHexString(),
        "totalSupply",
        "1000"
      );
    });

    test("Multiple mints to same user accumulate correctly", () => {
      setupParticipationTokenEntitiesWithUsers();

      // First mint
      let event1 = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(event1);

      // Second mint
      let event2 = createMintEvent(USER_1, BigInt.fromI32(500), PARTICIPATION_TOKEN_ADDRESS);
      event2.logIndex = BigInt.fromI32(2);
      handleTransfer(event2);

      // Verify accumulated balance
      let userId = ORG_ID.toHexString() + "-" + USER_1.toHexString();
      assert.fieldEquals("User", userId, "participationTokenBalance", "1500");

      let tokenBalanceId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_1.toHexString();
      assert.fieldEquals("TokenBalance", tokenBalanceId, "balance", "1500");

      // Verify totalSupply
      assert.fieldEquals(
        "ParticipationTokenContract",
        PARTICIPATION_TOKEN_ADDRESS.toHexString(),
        "totalSupply",
        "1500"
      );
    });

    test("Mint to multiple users creates separate User and TokenBalance entities", () => {
      setupParticipationTokenEntitiesWithUsers();

      // Mint to user 1
      let event1 = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(event1);

      // Mint to user 2
      let event2 = createMintEvent(USER_2, BigInt.fromI32(2000), PARTICIPATION_TOKEN_ADDRESS);
      event2.logIndex = BigInt.fromI32(2);
      handleTransfer(event2);

      // Verify separate TokenBalance entities and updated User balances
      // (Users were pre-created; we have 3 users total from setup)
      assert.entityCount("TokenBalance", 2);

      let user1Id = ORG_ID.toHexString() + "-" + USER_1.toHexString();
      let user2Id = ORG_ID.toHexString() + "-" + USER_2.toHexString();
      assert.fieldEquals("User", user1Id, "participationTokenBalance", "1000");
      assert.fieldEquals("User", user2Id, "participationTokenBalance", "2000");
    });
  });

  describe("Transfer - Burning (to zero address)", () => {
    test("Burn decreases User.participationTokenBalance", () => {
      setupParticipationTokenEntitiesWithUsers();

      // First mint to have some balance
      let mintEvent = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mintEvent);

      // Then burn some tokens
      let burnEvent = createBurnEvent(USER_1, BigInt.fromI32(400), PARTICIPATION_TOKEN_ADDRESS);
      burnEvent.logIndex = BigInt.fromI32(2);
      handleTransfer(burnEvent);

      let userId = ORG_ID.toHexString() + "-" + USER_1.toHexString();
      assert.fieldEquals("User", userId, "participationTokenBalance", "600");
    });

    test("Burn decreases TokenBalance", () => {
      setupParticipationTokenEntities();

      // First mint
      let mintEvent = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mintEvent);

      // Then burn
      let burnEvent = createBurnEvent(USER_1, BigInt.fromI32(400), PARTICIPATION_TOKEN_ADDRESS);
      burnEvent.logIndex = BigInt.fromI32(2);
      handleTransfer(burnEvent);

      let tokenBalanceId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_1.toHexString();
      assert.fieldEquals("TokenBalance", tokenBalanceId, "balance", "600");
    });

    test("Burn decreases totalSupply on contract", () => {
      setupParticipationTokenEntities();

      // First mint
      let mintEvent = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mintEvent);

      // Then burn
      let burnEvent = createBurnEvent(USER_1, BigInt.fromI32(400), PARTICIPATION_TOKEN_ADDRESS);
      burnEvent.logIndex = BigInt.fromI32(2);
      handleTransfer(burnEvent);

      assert.fieldEquals(
        "ParticipationTokenContract",
        PARTICIPATION_TOKEN_ADDRESS.toHexString(),
        "totalSupply",
        "600"
      );
    });
  });

  describe("Transfer - User to User", () => {
    test("Transfer updates both sender and receiver User.participationTokenBalance", () => {
      setupParticipationTokenEntitiesWithUsers();

      // First mint to user 1
      let mintEvent = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mintEvent);

      // Transfer from user 1 to user 2
      let transferEvent = createTransferEvent(
        USER_1,
        USER_2,
        BigInt.fromI32(400),
        PARTICIPATION_TOKEN_ADDRESS
      );
      transferEvent.logIndex = BigInt.fromI32(2);
      handleTransfer(transferEvent);

      // Verify both users' balances
      let user1Id = ORG_ID.toHexString() + "-" + USER_1.toHexString();
      let user2Id = ORG_ID.toHexString() + "-" + USER_2.toHexString();
      assert.fieldEquals("User", user1Id, "participationTokenBalance", "600");
      assert.fieldEquals("User", user2Id, "participationTokenBalance", "400");
    });

    test("Transfer updates both sender and receiver TokenBalance", () => {
      setupParticipationTokenEntities();

      // First mint to user 1
      let mintEvent = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mintEvent);

      // Transfer from user 1 to user 2
      let transferEvent = createTransferEvent(
        USER_1,
        USER_2,
        BigInt.fromI32(400),
        PARTICIPATION_TOKEN_ADDRESS
      );
      transferEvent.logIndex = BigInt.fromI32(2);
      handleTransfer(transferEvent);

      // Verify both TokenBalance entities
      let balance1Id = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_1.toHexString();
      let balance2Id = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_2.toHexString();
      assert.fieldEquals("TokenBalance", balance1Id, "balance", "600");
      assert.fieldEquals("TokenBalance", balance2Id, "balance", "400");
    });

    test("Transfer does not change totalSupply", () => {
      setupParticipationTokenEntities();

      // First mint to user 1
      let mintEvent = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mintEvent);

      // Transfer from user 1 to user 2
      let transferEvent = createTransferEvent(
        USER_1,
        USER_2,
        BigInt.fromI32(400),
        PARTICIPATION_TOKEN_ADDRESS
      );
      transferEvent.logIndex = BigInt.fromI32(2);
      handleTransfer(transferEvent);

      // Total supply should remain unchanged
      assert.fieldEquals(
        "ParticipationTokenContract",
        PARTICIPATION_TOKEN_ADDRESS.toHexString(),
        "totalSupply",
        "1000"
      );
    });

    test("Multiple transfers between users track correctly", () => {
      setupParticipationTokenEntitiesWithUsers();

      // Mint to user 1
      let mint1 = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mint1);

      // Mint to user 2
      let mint2 = createMintEvent(USER_2, BigInt.fromI32(500), PARTICIPATION_TOKEN_ADDRESS);
      mint2.logIndex = BigInt.fromI32(2);
      handleTransfer(mint2);

      // User 1 transfers to user 2
      let transfer1 = createTransferEvent(USER_1, USER_2, BigInt.fromI32(300), PARTICIPATION_TOKEN_ADDRESS);
      transfer1.logIndex = BigInt.fromI32(3);
      handleTransfer(transfer1);

      // User 2 transfers to user 3
      let transfer2 = createTransferEvent(USER_2, USER_3, BigInt.fromI32(200), PARTICIPATION_TOKEN_ADDRESS);
      transfer2.logIndex = BigInt.fromI32(4);
      handleTransfer(transfer2);

      // Verify final balances
      let user1Id = ORG_ID.toHexString() + "-" + USER_1.toHexString();
      let user2Id = ORG_ID.toHexString() + "-" + USER_2.toHexString();
      let user3Id = ORG_ID.toHexString() + "-" + USER_3.toHexString();

      // User 1: 1000 - 300 = 700
      assert.fieldEquals("User", user1Id, "participationTokenBalance", "700");
      // User 2: 500 + 300 - 200 = 600
      assert.fieldEquals("User", user2Id, "participationTokenBalance", "600");
      // User 3: 0 + 200 = 200
      assert.fieldEquals("User", user3Id, "participationTokenBalance", "200");
    });
  });

  describe("Transfer - Edge cases", () => {
    test("Transfer without ParticipationTokenContract entity creates TokenBalance but not User", () => {
      // Create only the organization, not the ParticipationTokenContract
      let organization = new Organization(ORG_ID);
      organization.topHatId = BigInt.fromI32(1000);
      organization.roleHatIds = [];
      organization.deployedAt = BigInt.fromI32(1000);
      organization.deployedAtBlock = BigInt.fromI32(100);
      organization.transactionHash = Bytes.fromHexString("0xabcd");
      organization.save();

      // Try to mint - should create TokenBalance but not update User (no contract to get org from)
      let mintEvent = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mintEvent);

      // TokenBalance should still be created
      let tokenBalanceId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_1.toHexString();
      assert.entityCount("TokenBalance", 1);
      assert.fieldEquals("TokenBalance", tokenBalanceId, "balance", "1000");

      // User should NOT be created since we couldn't get org from contract
      assert.entityCount("User", 0);
    });

    test("Large amount transfers work correctly", () => {
      setupParticipationTokenEntitiesWithUsers();

      // Mint a large amount (e.g., 1 trillion tokens with 18 decimals)
      let largeAmount = BigInt.fromString("1000000000000000000000000000000");
      let mintEvent = createMintEvent(USER_1, largeAmount, PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mintEvent);

      let userId = ORG_ID.toHexString() + "-" + USER_1.toHexString();
      assert.fieldEquals("User", userId, "participationTokenBalance", "1000000000000000000000000000000");
    });
  });

  describe("Token Requests", () => {
    test("Requested creates TokenRequest with Pending status", () => {
      setupParticipationTokenEntities();

      let requestId = BigInt.fromI32(1);
      let amount = BigInt.fromI32(1000);
      let ipfsHash = "QmTest123";
      let event = createRequestedEvent(requestId, USER_1, amount, ipfsHash, PARTICIPATION_TOKEN_ADDRESS);
      handleRequested(event);

      let tokenRequestId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + requestId.toString();
      assert.entityCount("TokenRequest", 1);
      assert.fieldEquals("TokenRequest", tokenRequestId, "status", "Pending");
      assert.fieldEquals("TokenRequest", tokenRequestId, "requester", USER_1.toHexString());
      assert.fieldEquals("TokenRequest", tokenRequestId, "amount", "1000");
      assert.fieldEquals("TokenRequest", tokenRequestId, "ipfsHash", "QmTest123");
    });

    test("RequestApproved updates TokenRequest status to Approved", () => {
      setupParticipationTokenEntities();

      // First create a request
      let requestId = BigInt.fromI32(1);
      let requestEvent = createRequestedEvent(
        requestId,
        USER_1,
        BigInt.fromI32(1000),
        "QmTest123",
        PARTICIPATION_TOKEN_ADDRESS
      );
      handleRequested(requestEvent);

      // Then approve it
      let approveEvent = createRequestApprovedEvent(requestId, USER_2, PARTICIPATION_TOKEN_ADDRESS);
      approveEvent.logIndex = BigInt.fromI32(2);
      handleRequestApproved(approveEvent);

      let tokenRequestId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + requestId.toString();
      assert.fieldEquals("TokenRequest", tokenRequestId, "status", "Approved");
      assert.fieldEquals("TokenRequest", tokenRequestId, "approver", USER_2.toHexString());
    });

    test("RequestCancelled updates TokenRequest status to Cancelled", () => {
      setupParticipationTokenEntities();

      // First create a request
      let requestId = BigInt.fromI32(1);
      let requestEvent = createRequestedEvent(
        requestId,
        USER_1,
        BigInt.fromI32(1000),
        "QmTest123",
        PARTICIPATION_TOKEN_ADDRESS
      );
      handleRequested(requestEvent);

      // Then cancel it
      let cancelEvent = createRequestCancelledEvent(requestId, PARTICIPATION_TOKEN_ADDRESS);
      cancelEvent.logIndex = BigInt.fromI32(2);
      handleRequestCancelled(cancelEvent);

      let tokenRequestId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + requestId.toString();
      assert.fieldEquals("TokenRequest", tokenRequestId, "status", "Cancelled");
    });

    test("Multiple token requests tracked separately", () => {
      setupParticipationTokenEntities();

      // Create first request
      let event1 = createRequestedEvent(
        BigInt.fromI32(1),
        USER_1,
        BigInt.fromI32(1000),
        "QmTest1",
        PARTICIPATION_TOKEN_ADDRESS
      );
      handleRequested(event1);

      // Create second request
      let event2 = createRequestedEvent(
        BigInt.fromI32(2),
        USER_2,
        BigInt.fromI32(2000),
        "QmTest2",
        PARTICIPATION_TOKEN_ADDRESS
      );
      event2.logIndex = BigInt.fromI32(2);
      handleRequested(event2);

      assert.entityCount("TokenRequest", 2);

      let request1Id = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-1";
      let request2Id = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-2";
      assert.fieldEquals("TokenRequest", request1Id, "amount", "1000");
      assert.fieldEquals("TokenRequest", request2Id, "amount", "2000");
    });
  });

  describe("Hat Permissions", () => {
    test("MemberHatSet creates HatPermission with Member role", () => {
      setupParticipationTokenEntities();

      let hatId = BigInt.fromI32(1001);
      let event = createMemberHatSetEvent(hatId, true, PARTICIPATION_TOKEN_ADDRESS);
      handleMemberHatSet(event);

      let permissionId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + hatId.toString() + "-Member";
      assert.entityCount("HatPermission", 1);
      assert.fieldEquals("HatPermission", permissionId, "permissionRole", "Member");
      assert.fieldEquals("HatPermission", permissionId, "allowed", "true");
      assert.fieldEquals("HatPermission", permissionId, "contractType", "ParticipationToken");
    });

    test("ApproverHatSet creates HatPermission with Approver role", () => {
      setupParticipationTokenEntities();

      let hatId = BigInt.fromI32(1002);
      let event = createApproverHatSetEvent(hatId, true, PARTICIPATION_TOKEN_ADDRESS);
      handleApproverHatSet(event);

      let permissionId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + hatId.toString() + "-Approver";
      assert.entityCount("HatPermission", 1);
      assert.fieldEquals("HatPermission", permissionId, "permissionRole", "Approver");
      assert.fieldEquals("HatPermission", permissionId, "allowed", "true");
    });

    test("Hat permission can be revoked", () => {
      setupParticipationTokenEntities();

      let hatId = BigInt.fromI32(1001);

      // First enable
      let enableEvent = createMemberHatSetEvent(hatId, true, PARTICIPATION_TOKEN_ADDRESS);
      handleMemberHatSet(enableEvent);

      // Then disable
      let disableEvent = createMemberHatSetEvent(hatId, false, PARTICIPATION_TOKEN_ADDRESS);
      disableEvent.logIndex = BigInt.fromI32(2);
      handleMemberHatSet(disableEvent);

      let permissionId = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + hatId.toString() + "-Member";
      assert.fieldEquals("HatPermission", permissionId, "allowed", "false");
    });
  });

  describe("Contract Configuration", () => {
    test("TaskManagerSet updates contract taskManagerAddress", () => {
      setupParticipationTokenEntities();

      let taskManagerAddress = Address.fromString("0x0000000000000000000000000000000000000006");
      let event = createTaskManagerSetEvent(taskManagerAddress, PARTICIPATION_TOKEN_ADDRESS);
      handleTaskManagerSet(event);

      assert.fieldEquals(
        "ParticipationTokenContract",
        PARTICIPATION_TOKEN_ADDRESS.toHexString(),
        "taskManagerAddress",
        taskManagerAddress.toHexString()
      );
    });

    test("EducationHubSet updates contract educationHubAddress", () => {
      setupParticipationTokenEntities();

      let educationHubAddress = Address.fromString("0x0000000000000000000000000000000000000007");
      let event = createEducationHubSetEvent(educationHubAddress, PARTICIPATION_TOKEN_ADDRESS);
      handleEducationHubSet(event);

      assert.fieldEquals(
        "ParticipationTokenContract",
        PARTICIPATION_TOKEN_ADDRESS.toHexString(),
        "educationHubAddress",
        educationHubAddress.toHexString()
      );
    });
  });

  describe("Integration - Full Token Lifecycle", () => {
    test("Complete mint, transfer, burn lifecycle maintains correct balances", () => {
      setupParticipationTokenEntitiesWithUsers();

      // 1. Mint 1000 tokens to user 1
      let mint = createMintEvent(USER_1, BigInt.fromI32(1000), PARTICIPATION_TOKEN_ADDRESS);
      handleTransfer(mint);

      // 2. User 1 transfers 300 to user 2
      let transfer1 = createTransferEvent(USER_1, USER_2, BigInt.fromI32(300), PARTICIPATION_TOKEN_ADDRESS);
      transfer1.logIndex = BigInt.fromI32(2);
      handleTransfer(transfer1);

      // 3. User 2 transfers 100 to user 3
      let transfer2 = createTransferEvent(USER_2, USER_3, BigInt.fromI32(100), PARTICIPATION_TOKEN_ADDRESS);
      transfer2.logIndex = BigInt.fromI32(3);
      handleTransfer(transfer2);

      // 4. User 1 burns 200
      let burn = createBurnEvent(USER_1, BigInt.fromI32(200), PARTICIPATION_TOKEN_ADDRESS);
      burn.logIndex = BigInt.fromI32(4);
      handleTransfer(burn);

      // Verify final state
      let user1Id = ORG_ID.toHexString() + "-" + USER_1.toHexString();
      let user2Id = ORG_ID.toHexString() + "-" + USER_2.toHexString();
      let user3Id = ORG_ID.toHexString() + "-" + USER_3.toHexString();

      // User 1: 1000 - 300 - 200 = 500
      assert.fieldEquals("User", user1Id, "participationTokenBalance", "500");
      // User 2: 300 - 100 = 200
      assert.fieldEquals("User", user2Id, "participationTokenBalance", "200");
      // User 3: 100
      assert.fieldEquals("User", user3Id, "participationTokenBalance", "100");

      // Total supply: 1000 - 200 = 800
      assert.fieldEquals(
        "ParticipationTokenContract",
        PARTICIPATION_TOKEN_ADDRESS.toHexString(),
        "totalSupply",
        "800"
      );

      // Verify TokenBalance entities match User balances
      let balance1Id = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_1.toHexString();
      let balance2Id = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_2.toHexString();
      let balance3Id = PARTICIPATION_TOKEN_ADDRESS.toHexString() + "-" + USER_3.toHexString();
      assert.fieldEquals("TokenBalance", balance1Id, "balance", "500");
      assert.fieldEquals("TokenBalance", balance2Id, "balance", "200");
      assert.fieldEquals("TokenBalance", balance3Id, "balance", "100");
    });
  });
});
