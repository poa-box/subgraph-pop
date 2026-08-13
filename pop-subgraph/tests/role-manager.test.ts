import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  handleRoleManagerInitialized,
  handleModulesWired,
  handleRoleCreated,
  handleGroupCreated,
  handleRoleGroupMembershipChanged,
  handleRoleOffered,
  handleRoleGranted
} from "../src/role-manager";
import { handleContractRegistered } from "../src/org-registry";
import {
  handleWearerEligibilityCleared,
  handleGroupEligibilitySet,
  handleHatClaimed,
  handleRoleManagerSet
} from "../src/eligibility-module";
import {
  handleClassesReplaced,
  handleClassHatSet,
  handleProposalConfigV2,
  handleConfigAdminSet,
  handleNewProposal
} from "../src/hybrid-voting";
import { createContractRegisteredEvent } from "./org-registry-utils";
import {
  createRoleManagerInitializedEvent,
  createModulesWiredEvent,
  createRoleCreatedEvent,
  createGroupCreatedEvent,
  createRoleGroupMembershipChangedEvent,
  createRoleOfferedEvent,
  createRoleGrantedEvent
} from "./role-manager-utils";
import {
  createWearerEligibilityClearedEvent,
  createGroupEligibilitySetEvent,
  createHatClaimedEvent,
  createRoleManagerSetEvent
} from "./eligibility-module-utils";
import {
  createClassesReplacedEvent,
  createClassHatSetEvent,
  createProposalConfigV2Event,
  createConfigAdminSetEvent,
  createNewProposalEvent
} from "./hybrid-voting-utils";
import {
  Organization,
  RoleManagerContract,
  EligibilityModuleContract,
  HybridVotingContract,
  Hat,
  Role
} from "../generated/schema";

const ROLE_MANAGER_ID = "0x3ee833f9a00a5c16c22d680afd944532db30fb8792c5ab006ecf38df07335cb6";
const ORG_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const RM = "0x00000000000000000000000000000000000000cc";
const EM = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a"; // default mock event address
const HV = "0x00000000000000000000000000000000000000d2";
const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const CID = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

function orgIdBytes(): Bytes {
  return Bytes.fromHexString(ORG_ID);
}

function seedOrg(roleHatIds: BigInt[]): void {
  let org = new Organization(orgIdBytes());
  org.roleHatIds = roleHatIds;
  org.deployedAt = BigInt.fromI32(1000);
  org.deployedAtBlock = BigInt.fromI32(100);
  org.save();
}

function seedRoleManager(): void {
  let rm = new RoleManagerContract(Bytes.fromHexString(RM));
  rm.organization = orgIdBytes();
  rm.roleCount = BigInt.fromI32(0);
  rm.groupCount = BigInt.fromI32(0);
  rm.createdAt = BigInt.fromI32(1000);
  rm.lastUpdatedAt = BigInt.fromI32(1000);
  rm.save();
}

function seedEligibilityModule(addr: string): void {
  let em = new EligibilityModuleContract(Address.fromString(addr));
  em.organization = orgIdBytes();
  em.superAdmin = Address.zero();
  em.hatsContract = Address.zero();
  em.toggleModule = Address.zero();
  em.isPaused = false;
  em.createdAt = BigInt.fromI32(1000);
  em.createdAtBlock = BigInt.fromI32(100);
  em.save();
}

function seedHv(): void {
  let hv = new HybridVotingContract(Address.fromString(HV));
  hv.organization = orgIdBytes();
  hv.executor = Address.zero();
  hv.thresholdPct = 50;
  hv.quorum = 20;
  hv.hats = Address.zero();
  hv.classVersion = BigInt.fromI32(0);
  hv.createdAt = BigInt.fromI32(1000);
  hv.createdAtBlock = BigInt.fromI32(100);
  hv.save();
}

describe("RoleManager", () => {
  afterEach(() => {
    clearStore();
  });

  describe("org-registry wiring", () => {
    test("ContractRegistered with the RoleManager typeId wires the module + Organization pointer", () => {
      seedOrg([]);
      let contractId = Bytes.fromHexString(
        "0x8888888888888888888888888888888888888888888888888888888888888888"
      );
      let ev = createContractRegisteredEvent(
        contractId,
        orgIdBytes(),
        Bytes.fromHexString(ROLE_MANAGER_ID),
        Address.fromString(RM),
        Address.fromString("0x00000000000000000000000000000000000000bb"),
        true,
        Address.fromString("0x0000000000000000000000000000000000000001")
      );
      handleContractRegistered(ev);

      assert.fieldEquals("Organization", ORG_ID, "roleManager", RM);
      assert.entityCount("RoleManagerContract", 1);
      assert.fieldEquals("RoleManagerContract", RM, "organization", ORG_ID);
      assert.fieldEquals("RoleManagerContract", RM, "roleCount", "0");
    });
  });

  describe("initialize", () => {
    test("RoleManagerInitialized + ModulesWired populate the wiring pointers", () => {
      seedOrg([]);
      seedRoleManager();

      handleRoleManagerInitialized(
        createRoleManagerInitializedEvent(
          Address.fromString(RM),
          Address.fromString("0x0000000000000000000000000000000000000001"),
          orgIdBytes(),
          Address.fromString(EM)
        )
      );
      handleModulesWired(
        createModulesWiredEvent(
          Address.fromString(RM),
          Address.fromString("0x0000000000000000000000000000000000000003"),
          Address.fromString(HV),
          Address.fromString("0x0000000000000000000000000000000000000006"),
          Address.fromString("0x0000000000000000000000000000000000000004"),
          Address.fromString("0x0000000000000000000000000000000000000007"),
          Address.fromString("0x0000000000000000000000000000000000000005"),
          Address.fromString("0x0000000000000000000000000000000000000008"),
          Address.fromString("0x0000000000000000000000000000000000000009")
        )
      );

      assert.fieldEquals("RoleManagerContract", RM, "executor", "0x0000000000000000000000000000000000000001");
      assert.fieldEquals("RoleManagerContract", RM, "eligibilityModule", EM);
      assert.fieldEquals("RoleManagerContract", RM, "hybridVoting", HV);
    });
  });

  describe("createRole", () => {
    test("RoleCreated attaches naming + builds the roleId->role index and bumps roleCount", () => {
      seedOrg([BigInt.fromI32(1001)]);
      seedRoleManager();

      handleRoleCreated(
        createRoleCreatedEvent(
          Address.fromString(RM),
          BigInt.fromI32(1),
          BigInt.fromI32(1001),
          "President",
          Bytes.fromHexString(CID),
          false
        )
      );

      let roleId = ORG_ID + "-1001";
      assert.fieldEquals("Role", roleId, "name", "President");
      assert.fieldEquals("Role", roleId, "roleManagerRoleId", "1");
      assert.fieldEquals("Role", roleId, "isUserRole", "true");
      assert.fieldEquals("Role", roleId, "isGroupMarker", "false");

      let refId = RM + "-1";
      assert.fieldEquals("ManagedRoleRef", refId, "hatId", "1001");
      assert.fieldEquals("ManagedRoleRef", refId, "role", roleId);
      assert.fieldEquals("RoleManagerContract", RM, "roleCount", "1");
    });
  });

  describe("createGroup marker exclusion", () => {
    test("GroupCreated flags the marker role, un-flags it as a user role and removes it from roleHatIds", () => {
      // Simulate the earlier same-tx HatCreatedWithEligibility: the marker hat is a user role in
      // the org's role-picker list before GroupCreated runs.
      seedOrg([BigInt.fromI32(2001), BigInt.fromI32(1001)]);
      seedRoleManager();

      handleGroupCreated(
        createGroupCreatedEvent(
          Address.fromString(RM),
          BigInt.fromI32(1),
          BigInt.fromI32(2001),
          "Executives",
          Bytes.fromHexString(ZERO32)
        )
      );

      let markerRoleId = ORG_ID + "-2001";
      assert.fieldEquals("Role", markerRoleId, "isGroupMarker", "true");
      assert.fieldEquals("Role", markerRoleId, "isUserRole", "false");
      // Marker hat pruned from the org role-picker list; the genuine role (1001) survives.
      assert.fieldEquals("Organization", ORG_ID, "roleHatIds", "[1001]");

      let groupId = ORG_ID + "-1";
      assert.entityCount("RoleGroup", 1);
      assert.fieldEquals("RoleGroup", groupId, "name", "Executives");
      assert.fieldEquals("RoleGroup", groupId, "markerHatId", "2001");
      assert.fieldEquals("RoleGroup", groupId, "markerRole", markerRoleId);
      assert.fieldEquals("RoleManagerContract", RM, "groupCount", "1");
    });
  });

  describe("group membership", () => {
    test("RoleGroupMembershipChanged adds then deactivates a membership without deleting it", () => {
      seedOrg([BigInt.fromI32(1001), BigInt.fromI32(2001)]);
      seedRoleManager();
      // Register the member role + the group first (event ordering the contract guarantees).
      handleRoleCreated(
        createRoleCreatedEvent(
          Address.fromString(RM),
          BigInt.fromI32(1),
          BigInt.fromI32(1001),
          "President",
          Bytes.fromHexString(ZERO32),
          false
        )
      );
      handleGroupCreated(
        createGroupCreatedEvent(
          Address.fromString(RM),
          BigInt.fromI32(1),
          BigInt.fromI32(2001),
          "Executives",
          Bytes.fromHexString(ZERO32)
        )
      );

      handleRoleGroupMembershipChanged(
        createRoleGroupMembershipChangedEvent(Address.fromString(RM), BigInt.fromI32(1), BigInt.fromI32(1), true)
      );

      let membershipId = ORG_ID + "-1-1";
      assert.entityCount("RoleGroupMembership", 1);
      assert.fieldEquals("RoleGroupMembership", membershipId, "isActive", "true");
      assert.fieldEquals("RoleGroupMembership", membershipId, "role", ORG_ID + "-1001");

      handleRoleGroupMembershipChanged(
        createRoleGroupMembershipChangedEvent(Address.fromString(RM), BigInt.fromI32(1), BigInt.fromI32(1), false)
      );
      assert.entityCount("RoleGroupMembership", 1);
      assert.fieldEquals("RoleGroupMembership", membershipId, "isActive", "false");
    });
  });

  describe("offer / accept", () => {
    test("RoleOffered records an offer that EM HatClaimed on the identity hat flips to Accepted", () => {
      seedOrg([BigInt.fromI32(1001)]);
      seedRoleManager();
      seedEligibilityModule(EM);

      let user = Address.fromString("0x00000000000000000000000000000000000000aa");

      handleRoleOffered(
        createRoleOfferedEvent(Address.fromString(RM), BigInt.fromI32(1), user, BigInt.fromI32(1001))
      );

      let offerId = ORG_ID + "-1001-" + user.toHexString();
      assert.entityCount("RoleOffer", 1);
      assert.fieldEquals("RoleOffer", offerId, "status", "Offered");
      assert.fieldEquals("RoleOffer", offerId, "roleManagerRoleId", "1");

      // Acceptance = claiming the identity hat via EligibilityModule.
      let claim = createHatClaimedEvent(user, BigInt.fromI32(1001));
      claim.address = Address.fromString(EM);
      handleHatClaimed(claim);

      assert.fieldEquals("RoleOffer", offerId, "status", "Accepted");
    });

    test("RoleGranted (in-org direct mint) also marks a matching offer Accepted", () => {
      seedOrg([BigInt.fromI32(1001)]);
      seedRoleManager();
      seedEligibilityModule(EM);
      let user = Address.fromString("0x00000000000000000000000000000000000000ab");

      handleRoleCreated(
        createRoleCreatedEvent(
          Address.fromString(RM),
          BigInt.fromI32(1),
          BigInt.fromI32(1001),
          "President",
          Bytes.fromHexString(ZERO32),
          false
        )
      );
      handleRoleOffered(
        createRoleOfferedEvent(Address.fromString(RM), BigInt.fromI32(1), user, BigInt.fromI32(1001))
      );
      handleRoleGranted(createRoleGrantedEvent(Address.fromString(RM), BigInt.fromI32(1), user, true));

      let offerId = ORG_ID + "-1001-" + user.toHexString();
      assert.fieldEquals("RoleOffer", offerId, "status", "Accepted");
    });
  });

  describe("EligibilityModule derived-eligibility + clears", () => {
    test("RoleManagerSet records the scoped admin on the module", () => {
      seedOrg([]);
      seedEligibilityModule(EM);
      let ev = createRoleManagerSetEvent(Address.fromString(RM));
      ev.address = Address.fromString(EM);
      handleRoleManagerSet(ev);
      assert.fieldEquals("EligibilityModuleContract", EM, "roleManager", RM);
    });

    test("GroupEligibilitySet records the derived member-hat list on the marker Hat", () => {
      seedOrg([]);
      seedEligibilityModule(EM);
      // Marker Hat must exist (createHatWithEligibility ran first).
      let hat = new Hat(EM + "-2001");
      hat.hatId = BigInt.fromI32(2001);
      hat.parentHatId = BigInt.fromI32(0);
      hat.level = 1;
      hat.eligibilityModule = Address.fromString(EM);
      hat.creator = Address.zero();
      hat.defaultEligible = false;
      hat.defaultStanding = true;
      hat.mintedCount = BigInt.fromI32(0);
      hat.active = true;
      hat.createdAt = BigInt.fromI32(1000);
      hat.createdAtBlock = BigInt.fromI32(100);
      hat.transactionHash = Bytes.fromHexString("0xabcd");
      hat.save();

      let ev = createGroupEligibilitySetEvent(BigInt.fromI32(2001), [BigInt.fromI32(1001), BigInt.fromI32(1002)]);
      ev.address = Address.fromString(EM);
      handleGroupEligibilitySet(ev);

      assert.fieldEquals("Hat", EM + "-2001", "groupMemberHats", "[1001, 1002]");
      assert.fieldEquals("Hat", EM + "-2001", "isDerivedGroup", "true");
    });

    test("WearerEligibilityCleared drops the specific rule WITHOUT recording a ban", () => {
      seedOrg([]);
      seedEligibilityModule(EM);
      let wearer = Address.fromString("0x00000000000000000000000000000000000000a1");
      let admin = Address.fromString("0x0000000000000000000000000000000000000001");
      let ev = createWearerEligibilityClearedEvent(wearer, BigInt.fromI32(1001), admin);
      ev.address = Address.fromString(EM);
      handleWearerEligibilityCleared(ev);

      let weId = EM + "-1001-" + wearer.toHexString();
      assert.fieldEquals("WearerEligibility", weId, "hasSpecificRules", "false");
      // Not a ban: eligible/standing are permissive, distinct from WearerEligibilityUpdated(false,false).
      assert.fieldEquals("WearerEligibility", weId, "eligible", "true");
      assert.fieldEquals("WearerEligibility", weId, "standing", "true");
    });
  });

  describe("HybridVoting v2 config", () => {
    test("ProposalConfigV2 sets quorumOverride + equalWeight on an existing proposal", () => {
      seedOrg([]);
      seedHv();
      let np = createNewProposalEvent(
        BigInt.fromI32(7),
        Bytes.fromUTF8("Poll"),
        Bytes.fromHexString(ZERO32),
        2,
        2000,
        1000
      );
      np.address = Address.fromString(HV);
      handleNewProposal(np);

      let cfg = createProposalConfigV2Event(BigInt.fromI32(7), BigInt.fromI32(75), true);
      cfg.address = Address.fromString(HV);
      handleProposalConfigV2(cfg);

      let proposalId = HV + "-7";
      assert.fieldEquals("Proposal", proposalId, "quorumOverride", "75");
      assert.fieldEquals("Proposal", proposalId, "equalWeight", "true");
    });

    test("ConfigAdminSet records the scoped config admin", () => {
      seedOrg([]);
      seedHv();
      let ev = createConfigAdminSetEvent(Address.fromString(RM));
      ev.address = Address.fromString(HV);
      handleConfigAdminSet(ev);
      assert.fieldEquals("HybridVotingContract", HV, "configAdmin", RM);
    });

    test("ClassHatSet incrementally edits a class's hats against the live snapshot", () => {
      seedOrg([]);
      seedHv();
      // Seed two classes via ClassesReplaced (class 0 hats=[1001], class 1 hats=[1002]).
      let repl = createClassesReplacedEvent(BigInt.fromI32(200), Bytes.fromHexString(CID), 1000);
      repl.address = Address.fromString(HV);
      repl.block.number = BigInt.fromI32(200);
      repl.logIndex = BigInt.fromI32(0);
      handleClassesReplaced(repl);

      // Add hat 5005 to class 0.
      let che = createClassHatSetEvent(0, BigInt.fromI32(5005), true);
      che.address = Address.fromString(HV);
      che.block.number = BigInt.fromI32(210);
      che.logIndex = BigInt.fromI32(3);
      handleClassHatSet(che);

      // The new snapshot's class 0 row carries the added hat; a fresh VotingClassChange was written.
      let newClass0 = HV + "-210-3-0";
      assert.fieldEquals("VotingClass", newClass0, "hatIds", "[1001, 5005]");
      assert.fieldEquals("VotingClass", newClass0, "isActive", "true");
      assert.fieldEquals("HybridVotingContract", HV, "classVersion", "210");
      // 2 rows from ClassesReplaced (now superseded) + 2 from the edit = 4 total; 2 active.
      assert.entityCount("VotingClass", 4);
    });
  });
});
