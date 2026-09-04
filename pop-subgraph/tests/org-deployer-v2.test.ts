import { assert, describe, test, clearStore, afterEach } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { handleOrgDeployedV2, handleGroupsCreatedV2 } from "../src/org-deployer-v2";
import {
  handleRolesCreated,
  handleInitialWearersAssigned
} from "../src/org-deployer";
import {
  handleSubjectCreated,
  handleAuthorityTransferSingle
} from "../src/membership-authority";
import {
  createOrgDeployedV2Event,
  createGroupsCreatedV2Event
} from "./org-deployer-v2-utils";
import {
  createRolesCreatedEvent,
  createInitialWearersAssignedEvent
} from "./org-deployer-utils";
import {
  createSubjectCreatedEvent,
  createTransferSingleEvent
} from "./membership-authority-utils";

const ORG_ID = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const AUTHORITY = "0x000000000000000000000000000000000000000a";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function deployV2(): void {
  handleOrgDeployedV2(
    createOrgDeployedV2Event(
      Bytes.fromHexString(ORG_ID),
      Address.fromString("0x0000000000000000000000000000000000000001"),
      Address.fromString("0x0000000000000000000000000000000000000002"),
      Address.fromString("0x0000000000000000000000000000000000000003"),
      Address.fromString("0x0000000000000000000000000000000000000004"),
      Address.fromString("0x0000000000000000000000000000000000000005"),
      Address.fromString("0x0000000000000000000000000000000000000006"),
      Address.fromString("0x0000000000000000000000000000000000000007"),
      Address.fromString("0x0000000000000000000000000000000000000008"),
      Address.fromString(AUTHORITY),
      BigInt.fromI32(10),
      [BigInt.fromI32(11), BigInt.fromI32(12)]
    )
  );
}

describe("OrgDeployer Kyoto Access v2", () => {
  afterEach(() => {
    clearStore();
  });

  test("OrgDeployedV2 wires native authority and fixed modules without legacy access entities", () => {
    deployV2();

    assert.fieldEquals("Organization", ORG_ID, "membershipAuthority", AUTHORITY);
    assert.fieldEquals("Organization", ORG_ID, "topHatId", "10");
    assert.fieldEquals("Organization", ORG_ID, "roleHatIds", "[11, 12]");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "organization", ORG_ID);
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "paused", "false");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "isRouterBound", "true");
    assert.fieldEquals(
      "MembershipAuthorityContract",
      AUTHORITY,
      "cutoverAt",
      "1"
    );

    assert.entityCount("TaskManager", 1);
    assert.entityCount("HybridVotingContract", 1);
    assert.entityCount("DirectDemocracyVotingContract", 1);
    assert.entityCount("ParticipationTokenContract", 1);
    assert.entityCount("QuickJoinContract", 1);
    assert.entityCount("EducationHubContract", 1);
    assert.entityCount("PaymentManagerContract", 1);
    assert.entityCount("ExecutorContract", 1);
    assert.entityCount("EligibilityModuleContract", 0);
    assert.entityCount("ToggleModuleContract", 0);

    assert.entityCount("Subject", 3);
    assert.fieldEquals("Subject", "10", "name", "ADMIN");
    assert.fieldEquals("Subject", "10", "kind", "Role");
    assert.fieldEquals("Role", ORG_ID + "-10", "isUserRole", "false");
    assert.fieldEquals("Role", ORG_ID + "-11", "isUserRole", "true");
    assert.fieldEquals(
      "ExecutorContract",
      "0x0000000000000000000000000000000000000001",
      "hatsContract",
      AUTHORITY
    );
  });

  test("shared deployment summaries enrich Subjects and never create Hats for v2 ids", () => {
    deployV2();

    let metadataCID = Bytes.fromHexString(
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );
    handleRolesCreated(
      createRolesCreatedEvent(
        Bytes.fromHexString(ORG_ID),
        [BigInt.fromI32(11), BigInt.fromI32(12)],
        ["Builder", "Reviewer"],
        ["ipfs://builder.png", "ipfs://reviewer.png"],
        [metadataCID, Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")],
        [true, false]
      )
    );

    assert.fieldEquals("Subject", "11", "name", "Builder");
    assert.fieldEquals("Subject", "11", "imageURI", "ipfs://builder.png");
    assert.fieldEquals("Subject", "11", "metadataCID", metadataCID.toHexString());
    assert.fieldEquals("Role", ORG_ID + "-11", "name", "Builder");
    assert.fieldEquals("Role", ORG_ID + "-11", "image", "ipfs://builder.png");
    assert.entityCount("Hat", 0);

    // Same-block dynamic-source replay may deliver the earlier seed event after RolesCreated. Its
    // zero metadata placeholder must not erase the deployment summary's image/CID.
    handleSubjectCreated(
      createSubjectCreatedEvent(
        Address.fromString(AUTHORITY),
        BigInt.fromI32(11),
        0,
        "Builder",
        Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"),
        25
      )
    );
    assert.fieldEquals("Subject", "11", "maxMembers", "25");
    assert.fieldEquals("Subject", "11", "imageURI", "ipfs://builder.png");
    assert.fieldEquals("Subject", "11", "metadataCID", metadataCID.toHexString());
  });

  test("GroupsCreated builds group composition without polluting continuity Roles", () => {
    deployV2();
    handleGroupsCreatedV2(
      createGroupsCreatedV2Event(
        Bytes.fromHexString(ORG_ID),
        [BigInt.fromI32(20)],
        ["Operations"],
        [[BigInt.fromI32(11), BigInt.fromI32(12)]]
      )
    );

    assert.fieldEquals("Subject", "20", "kind", "Group");
    assert.fieldEquals("Subject", "20", "name", "Operations");
    assert.fieldEquals("GroupComposition", "20-11", "isActive", "true");
    assert.fieldEquals("GroupComposition", "20-12", "isActive", "true");
    assert.notInStore("Role", ORG_ID + "-20");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "subjectCount", "4");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "roleSubjectCount", "3");
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "groupSubjectCount", "1");
  });

  test("InitialWearersAssigned uses subject continuity and skips legacy eligibility rows", () => {
    deployV2();
    let wearer = Address.fromString("0x0000000000000000000000000000000000000099");
    handleInitialWearersAssigned(
      createInitialWearersAssignedEvent(
        Bytes.fromHexString(ORG_ID),
        Address.fromString(AUTHORITY),
        [wearer],
        [BigInt.fromI32(11)]
      )
    );

    let userId = ORG_ID + "-" + wearer.toHexString();
    assert.fieldEquals("User", userId, "joinMethod", "DeploymentMint");
    assert.fieldEquals("User", userId, "currentHatIds", "[11]");
    assert.fieldEquals("RoleWearer", ORG_ID + "-11-" + wearer.toHexString(), "isActive", "true");
    assert.entityCount("WearerEligibility", 0);
  });

  test("authority mint plus InitialWearersAssigned produces one continuity membership", () => {
    deployV2();
    let wearer = Address.fromString("0x0000000000000000000000000000000000000099");
    let subjectId = BigInt.fromI32(11);

    // A newly registered authority replays its earlier same-block mint logs. Depending on the
    // dynamic-source causality round, this may reach the shared deployment summary first. Both
    // paths use idempotent continuity helpers, and the summary upgrades the temporary origin label.
    handleAuthorityTransferSingle(
      createTransferSingleEvent(
        Address.fromString(AUTHORITY),
        Address.fromString("0x0000000000000000000000000000000000000001"),
        Address.fromString(ZERO_ADDRESS),
        wearer,
        subjectId,
        BigInt.fromI32(1)
      )
    );
    handleInitialWearersAssigned(
      createInitialWearersAssignedEvent(
        Bytes.fromHexString(ORG_ID),
        Address.fromString(AUTHORITY),
        [wearer],
        [subjectId]
      )
    );

    let userId = ORG_ID + "-" + wearer.toHexString();
    assert.fieldEquals("User", userId, "joinMethod", "DeploymentMint");
    assert.fieldEquals("User", userId, "currentHatIds", "[11]");
    assert.entityCount("RoleWearer", 1);
    assert.entityCount("UserHatChange", 1);
    assert.entityCount("SubjectMembership", 1);
    assert.fieldEquals("MembershipAuthorityContract", AUTHORITY, "acceptedMembershipCount", "1");
  });
});
