import { Address, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";
import {
  OrgDeployed as OrgDeployedV2Event,
  GroupsCreated as GroupsCreatedV2Event
} from "../generated/templates/OrgDeployerV2/OrgDeployerV2";
import {
  Organization,
  TaskManager as TaskManagerEntity,
  HybridVotingContract,
  DirectDemocracyVotingContract,
  ParticipationTokenContract,
  QuickJoinContract,
  EducationHubContract,
  PaymentManagerContract,
  ExecutorContract,
  MembershipAuthorityContract,
  Subject,
  GroupComposition
} from "../generated/schema";
import {
  TaskManager as TaskManagerTemplate,
  HybridVoting as HybridVotingTemplate,
  DirectDemocracyVoting as DirectDemocracyVotingTemplate,
  ParticipationToken as ParticipationTokenTemplate,
  QuickJoin as QuickJoinTemplate,
  EducationHub as EducationHubTemplate,
  PaymentManager as PaymentManagerTemplate,
  Executor as ExecutorTemplate,
  MembershipAuthority as MembershipAuthorityTemplate
} from "../generated/templates";
import { getOrCreateRole } from "./utils";

const ZERO_ADDRESS: Address = Address.zero();

function subjectEntityId(subjectId: BigInt): string {
  return subjectId.toString();
}

function groupCompositionId(groupId: BigInt, roleId: BigInt): string {
  return groupId.toString() + "-" + roleId.toString();
}

function hatsNamespaceFloor(): BigInt {
  return BigInt.fromI32(2).pow(224);
}

/**
 * Upsert a subject from the deployer's summary events.
 *
 * MembershipAuthority is a dynamic data source created by ContractRegistered. graph-node replays
 * earlier logs from the same block for that new source, but those replayed SubjectCreated events can
 * execute after the already-live OrgDeployer source handles RolesCreated / GroupsCreated. Seeding a
 * complete minimal row here makes that ordering deterministic; SubjectCreated later fills the
 * authoritative max/default fields without double-counting because it sees the existing id.
 */
export function ensureV2DeploymentSubject(
  authority: MembershipAuthorityContract,
  subjectId: BigInt,
  isGroup: boolean,
  isUserRole: boolean,
  event: ethereum.Event
): Subject {
  let id = subjectEntityId(subjectId);
  let subject = Subject.load(id);
  let isNew = subject == null;
  let kindChanged = false;

  if (subject == null) {
    subject = new Subject(id);
    subject.authority = authority.id;
    subject.organization = authority.organization;
    subject.subjectId = subjectId;
    subject.maxMembers = 0;
    subject.memberCount = 0;
    subject.activeMemberCount = 0;
    subject.acceptedUsers = [];
    subject.defaultAllow = false;
    subject.isLegacyAdopted = subjectId.ge(hatsNamespaceFloor());
    subject.createdAt = event.block.timestamp;
    subject.createdAtBlock = event.block.number;
  } else {
    let wasGroup = subject.kind == "Group";
    kindChanged = wasGroup != isGroup;
    if (kindChanged) {
      if (wasGroup) {
        if (authority.groupSubjectCount > 0) {
          authority.groupSubjectCount = authority.groupSubjectCount - 1;
        }
        authority.roleSubjectCount = authority.roleSubjectCount + 1;
      } else {
        if (authority.roleSubjectCount > 0) {
          authority.roleSubjectCount = authority.roleSubjectCount - 1;
        }
        authority.groupSubjectCount = authority.groupSubjectCount + 1;
      }
    }
  }

  subject.authority = authority.id;
  subject.organization = authority.organization;
  subject.kind = isGroup ? "Group" : "Role";
  subject.lastUpdatedAt = event.block.timestamp;
  subject.transactionHash = event.transaction.hash;

  if (isGroup) {
    subject.role = null;
  } else {
    let orgId = changetype<Bytes>(authority.organization);
    let role = getOrCreateRole(orgId, subjectId, event, isUserRole, true);
    subject.role = role.id;
  }
  subject.save();

  if (isNew) {
    authority.subjectCount = authority.subjectCount + 1;
    if (isGroup) {
      authority.groupSubjectCount = authority.groupSubjectCount + 1;
    } else {
      authority.roleSubjectCount = authority.roleSubjectCount + 1;
    }
  }
  if (isNew || kindChanged) {
    authority.lastUpdatedAt = event.block.timestamp;
    authority.save();
  }

  return subject;
}

/**
 * Kyoto Access-v2 OrgDeployed. Its topic is intentionally handled by a separate template so the
 * legacy OrgDeployed ABI and all historical Hats-based deployments remain indexable.
 */
export function handleOrgDeployedV2(event: OrgDeployedV2Event): void {
  let orgId = event.params.orgId;
  let organization = Organization.load(orgId);
  if (organization == null) {
    organization = new Organization(orgId);
  }

  let taskManager = new TaskManagerEntity(event.params.taskManager);
  taskManager.organization = orgId;
  taskManager.creatorHatIds = [];
  taskManager.organizerHatIds = [];
  taskManager.createdAt = event.block.timestamp;
  taskManager.createdAtBlock = event.block.number;
  taskManager.transactionHash = event.transaction.hash;

  let hybridVoting = new HybridVotingContract(event.params.hybridVoting);
  hybridVoting.organization = orgId;
  hybridVoting.executor = ZERO_ADDRESS;
  hybridVoting.thresholdPct = 0;
  hybridVoting.quorum = BigInt.zero();
  hybridVoting.hats = ZERO_ADDRESS;
  hybridVoting.classVersion = BigInt.zero();
  hybridVoting.createdAt = event.block.timestamp;
  hybridVoting.createdAtBlock = event.block.number;

  let directDemocracyVoting = new DirectDemocracyVotingContract(event.params.directDemocracyVoting);
  directDemocracyVoting.organization = orgId;
  directDemocracyVoting.executor = ZERO_ADDRESS;
  directDemocracyVoting.thresholdPct = 0;
  directDemocracyVoting.quorum = BigInt.zero();
  directDemocracyVoting.hats = ZERO_ADDRESS;
  directDemocracyVoting.createdAt = event.block.timestamp;
  directDemocracyVoting.createdAtBlock = event.block.number;

  let participationToken = new ParticipationTokenContract(event.params.participationToken);
  participationToken.organization = orgId;
  participationToken.name = "";
  participationToken.symbol = "";
  participationToken.totalSupply = BigInt.zero();
  participationToken.executor = event.params.executor;
  participationToken.hatsContract = ZERO_ADDRESS;
  participationToken.createdAt = event.block.timestamp;
  participationToken.createdAtBlock = event.block.number;

  let quickJoin = new QuickJoinContract(event.params.quickJoin);
  quickJoin.organization = orgId;
  quickJoin.executor = ZERO_ADDRESS;
  quickJoin.hatsContract = ZERO_ADDRESS;
  quickJoin.accountRegistry = ZERO_ADDRESS;
  quickJoin.masterDeployAddress = ZERO_ADDRESS;
  quickJoin.memberHatIds = [];
  quickJoin.createdAt = event.block.timestamp;
  quickJoin.createdAtBlock = event.block.number;

  let paymentManager = new PaymentManagerContract(event.params.paymentManager);
  paymentManager.organization = orgId;
  paymentManager.owner = ZERO_ADDRESS;
  paymentManager.revenueShareToken = ZERO_ADDRESS;
  paymentManager.distributionCounter = BigInt.zero();
  paymentManager.createdAt = event.block.timestamp;
  paymentManager.createdAtBlock = event.block.number;

  let executor = new ExecutorContract(event.params.executor);
  executor.organization = orgId;
  executor.owner = ZERO_ADDRESS;
  executor.allowedCaller = null;
  // Final deployment state: Executor's IHats-compatible surface has already been repointed to the
  // MembershipAuthority. HatsRepointed keeps this current and wins over the earlier HatsSet replay.
  executor.hatsContract = event.params.membershipAuthority;
  executor.isPaused = false;
  executor.createdAt = event.block.timestamp;
  executor.createdAtBlock = event.block.number;

  taskManager.save();
  hybridVoting.save();
  directDemocracyVoting.save();
  participationToken.save();
  quickJoin.save();
  paymentManager.save();
  executor.save();

  organization.executorContract = executor.id;
  organization.hybridVoting = hybridVoting.id;
  organization.directDemocracyVoting = directDemocracyVoting.id;
  organization.quickJoin = quickJoin.id;
  organization.participationToken = participationToken.id;
  organization.taskManager = taskManager.id;
  organization.paymentManager = paymentManager.id;

  let hasEducationHub = !event.params.educationHub.equals(ZERO_ADDRESS);
  if (hasEducationHub) {
    let educationHub = new EducationHubContract(event.params.educationHub);
    educationHub.organization = orgId;
    educationHub.token = ZERO_ADDRESS;
    educationHub.hatsContract = ZERO_ADDRESS;
    educationHub.executor = ZERO_ADDRESS;
    educationHub.isPaused = false;
    educationHub.nextModuleId = BigInt.zero();
    educationHub.createdAt = event.block.timestamp;
    educationHub.createdAtBlock = event.block.number;
    educationHub.save();
    organization.educationHub = educationHub.id;
  } else {
    organization.educationHub = null;
  }

  // Keep the legacy compatibility fields populated with SUBJECT ids. roleHatIds contains ROLE
  // subjects only (never groups); topHatId carries the non-user-facing ADMIN subject.
  organization.topHatId = event.params.adminSubjectId;
  organization.roleHatIds = event.params.roleSubjectIds;
  organization.deployedAt = event.block.timestamp;
  organization.deployedAtBlock = event.block.number;
  organization.transactionHash = event.transaction.hash;

  let authority = MembershipAuthorityContract.load(event.params.membershipAuthority);
  let authorityWasMissing = authority == null;
  if (authority == null) {
    authority = new MembershipAuthorityContract(event.params.membershipAuthority);
    authority.maxDailyVouches = 0;
    authority.subjectCount = 0;
    authority.roleSubjectCount = 0;
    authority.groupSubjectCount = 0;
    authority.acceptedMembershipCount = 0;
    authority.isRouterBound = true;
    authority.registeredAt = event.block.timestamp;
    authority.registeredAtBlock = event.block.number;
    authority.transactionHash = event.transaction.hash;
    authority.initConfigDerived = true;
  }
  authority.organization = orgId;
  authority.executor = event.params.executor;
  authority.orgIdHash = orgId;
  // OrgDeployed is emitted only after _activateAuthority has unpaused the genesis authority.
  authority.paused = false;
  // A native-v2 org routes through its embedded subject ids from genesis; there is no legacy
  // AuthorityRouter cutover transaction and therefore no AuthorityBound event/RouterBinding row.
  // Expose the equivalent active state explicitly so clients do not classify it as pending forever.
  authority.isRouterBound = true;
  authority.cutoverAt = event.block.timestamp;
  authority.lastUpdatedAt = event.block.timestamp;
  authority.save();

  organization.membershipAuthority = authority.id;
  organization.lastUpdatedAt = event.block.timestamp;
  organization.save();

  // The deploy summary identifies the ADMIN and every user-facing ROLE even if the authority's
  // same-block dynamic-source replay has not run yet.
  let admin = ensureV2DeploymentSubject(
    authority,
    event.params.adminSubjectId,
    false,
    false,
    event
  );
  admin.name = "ADMIN";
  admin.save();
  let roleSubjectIds = event.params.roleSubjectIds;
  for (let i = 0; i < roleSubjectIds.length; i++) {
    ensureV2DeploymentSubject(authority, roleSubjectIds[i], false, true, event);
  }

  TaskManagerTemplate.create(event.params.taskManager);
  HybridVotingTemplate.create(event.params.hybridVoting);
  DirectDemocracyVotingTemplate.create(event.params.directDemocracyVoting);
  ParticipationTokenTemplate.create(event.params.participationToken);
  QuickJoinTemplate.create(event.params.quickJoin);
  PaymentManagerTemplate.create(event.params.paymentManager);
  ExecutorTemplate.create(event.params.executor);
  if (hasEducationHub) {
    EducationHubTemplate.create(event.params.educationHub);
  }
  // Normally ContractRegistered already created this source. Only backfill it here when that event
  // was absent, otherwise duplicate sources would process every authority event twice.
  if (authorityWasMissing) {
    MembershipAuthorityTemplate.create(event.params.membershipAuthority);
  }
}

/** Index Kyoto's deployment-only group summary without creating legacy Hat rows for groups. */
export function handleGroupsCreatedV2(event: GroupsCreatedV2Event): void {
  let organization = Organization.load(event.params.orgId);
  if (organization == null || organization.membershipAuthority === null) {
    log.warning("GroupsCreated missing Access-v2 organization/authority for org {}", [
      event.params.orgId.toHexString()
    ]);
    return;
  }
  let authorityId = changetype<Bytes>(organization.membershipAuthority);
  let authority = MembershipAuthorityContract.load(authorityId);
  if (authority == null) {
    log.warning("GroupsCreated missing MembershipAuthority {} for org {}", [
      authorityId.toHexString(),
      event.params.orgId.toHexString()
    ]);
    return;
  }

  let subjectIds = event.params.subjectIds;
  let names = event.params.names;
  let members = event.params.memberSubjectIds;
  if (subjectIds.length != names.length || subjectIds.length != members.length) {
    log.warning("GroupsCreated length mismatch for org {}: {} ids, {} names, {} member arrays", [
      event.params.orgId.toHexString(),
      subjectIds.length.toString(),
      names.length.toString(),
      members.length.toString()
    ]);
  }

  for (let i = 0; i < subjectIds.length; i++) {
    let groupId = subjectIds[i];
    let group = ensureV2DeploymentSubject(authority, groupId, true, false, event);
    if (i < names.length) {
      group.name = names[i];
      group.lastUpdatedAt = event.block.timestamp;
      group.save();
    }
    if (i >= members.length) {
      continue;
    }

    let memberRoleIds = members[i];
    for (let j = 0; j < memberRoleIds.length; j++) {
      let roleId = memberRoleIds[j];
      let role = ensureV2DeploymentSubject(authority, roleId, false, true, event);
      let id = groupCompositionId(groupId, roleId);
      let row = GroupComposition.load(id);
      if (row == null) {
        row = new GroupComposition(id);
        row.group = group.id;
        row.role = role.id;
        row.authority = authority.id;
        row.organization = authority.organization;
        row.groupSubjectId = groupId;
        row.roleSubjectId = roleId;
        row.addedAt = event.block.timestamp;
        row.addedAtBlock = event.block.number;
      }
      row.isActive = true;
      row.updatedAt = event.block.timestamp;
      row.transactionHash = event.transaction.hash;
      row.save();
    }
  }
}
