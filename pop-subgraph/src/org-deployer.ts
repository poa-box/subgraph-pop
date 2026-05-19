import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { OrgDeployed, RolesCreated, InitialWearersAssigned } from "../generated/templates/OrgDeployer/OrgDeployer";
import {
  Organization,
  TaskManager as TaskManagerEntity,
  HybridVotingContract,
  DirectDemocracyVotingContract,
  EligibilityModuleContract,
  ParticipationTokenContract,
  QuickJoinContract,
  EducationHubContract,
  PaymentManagerContract,
  ExecutorContract,
  ToggleModuleContract,
  Role,
  Hat,
  WearerEligibility
} from "../generated/schema";
import {
  getOrCreateRole,
  createUserOnJoin,
  getOrCreateRoleWearer,
  shouldCreateRoleWearer,
  recordUserHatChange,
  isSystemContract
} from "./utils";
import {
  TaskManager as TaskManagerTemplate,
  HybridVoting as HybridVotingTemplate,
  DirectDemocracyVoting as DirectDemocracyVotingTemplate,
  EligibilityModule as EligibilityModuleTemplate,
  ParticipationToken as ParticipationTokenTemplate,
  QuickJoin as QuickJoinTemplate,
  EducationHub as EducationHubTemplate,
  PaymentManager as PaymentManagerTemplate,
  Executor as ExecutorTemplate,
  ToggleModule as ToggleModuleTemplate
} from "../generated/templates";

/**
 * Handles the OrgDeployed event from the OrgDeployer contract.
 * Creates an Organization entity, a TaskManager entity, a HybridVotingContract entity,
 * a DirectDemocracyVotingContract entity, an EligibilityModuleContract entity,
 * a ParticipationTokenContract entity, a QuickJoinContract entity, an EducationHubContract entity,
 * a PaymentManagerContract entity, and instantiates data source templates for dynamic contract tracking.
 */
export function handleOrgDeployed(event: OrgDeployed): void {
  // Create TaskManager entity first so we can reference it
  let taskManager = new TaskManagerEntity(event.params.taskManager);
  taskManager.createdAt = event.block.timestamp;
  taskManager.createdAtBlock = event.block.number;
  taskManager.transactionHash = event.transaction.hash;

  // Derive creatorHatIds from roleHatIds
  // Standard config: taskCreatorRoles = 0b110 (executives + admins = all non-member roles)
  // This means roleHatIds[0] = member, roleHatIds[1:] = creator-eligible roles
  let roleHatIds = event.params.roleHatIds;
  let creatorHatIds: BigInt[] = [];
  for (let i = 1; i < roleHatIds.length; i++) {
    creatorHatIds.push(roleHatIds[i]);
  }
  taskManager.creatorHatIds = creatorHatIds;
  taskManager.organizerHatIds = []; // populated by OrganizerHatAllowed events (TaskManager v4)

  // Create HybridVotingContract entity
  let hybridVoting = new HybridVotingContract(event.params.hybridVoting);
  hybridVoting.executor = Address.zero(); // Will be set by Initialized event
  hybridVoting.thresholdPct = 0; // Will be set by ThresholdPctSet event
  hybridVoting.quorum = 0; // Will be set by QuorumSet event
  hybridVoting.hats = Address.zero(); // Will be set by Initialized event
  hybridVoting.classVersion = BigInt.fromI32(0); // Will be set by ClassesReplaced event
  hybridVoting.createdAt = event.block.timestamp;
  hybridVoting.createdAtBlock = event.block.number;

  // Create DirectDemocracyVotingContract entity
  let directDemocracyVoting = new DirectDemocracyVotingContract(event.params.directDemocracyVoting);
  directDemocracyVoting.executor = Address.zero(); // Will be set by ExecutorUpdated event
  directDemocracyVoting.thresholdPct = 0; // Will be set by ThresholdPctSet event
  directDemocracyVoting.quorum = 0; // Will be set by QuorumSet event
  directDemocracyVoting.hats = Address.zero(); // Will be set by Initialized event
  directDemocracyVoting.createdAt = event.block.timestamp;
  directDemocracyVoting.createdAtBlock = event.block.number;

  // Create EligibilityModuleContract entity
  let eligibilityModule = new EligibilityModuleContract(event.params.eligibilityModule);
  eligibilityModule.superAdmin = Address.zero(); // Will be set by EligibilityModuleInitialized event
  eligibilityModule.hatsContract = Address.zero(); // Will be set by EligibilityModuleInitialized event
  eligibilityModule.toggleModule = event.params.toggleModule;
  eligibilityModule.isPaused = false;
  eligibilityModule.createdAt = event.block.timestamp;
  eligibilityModule.createdAtBlock = event.block.number;

  // Create ParticipationTokenContract entity
  let participationToken = new ParticipationTokenContract(event.params.participationToken);
  participationToken.name = ""; // Will be set by Initialized event
  participationToken.symbol = ""; // Will be set by Initialized event
  participationToken.totalSupply = BigInt.fromI32(0);
  participationToken.executor = Address.zero(); // Will be set by Initialized event
  participationToken.hatsContract = Address.zero(); // Will be set by Initialized event
  participationToken.createdAt = event.block.timestamp;
  participationToken.createdAtBlock = event.block.number;

  // Create QuickJoinContract entity
  let quickJoin = new QuickJoinContract(event.params.quickJoin);
  quickJoin.executor = Address.zero(); // Will be set by Initialized event
  quickJoin.hatsContract = Address.zero(); // Will be set by Initialized event
  quickJoin.accountRegistry = Address.zero(); // Will be set by Initialized event
  quickJoin.masterDeployAddress = Address.zero(); // Will be set by Initialized event
  quickJoin.createdAt = event.block.timestamp;
  quickJoin.createdAtBlock = event.block.number;

  // Create EducationHubContract entity
  let educationHub = new EducationHubContract(event.params.educationHub);
  educationHub.token = Address.zero(); // Will be set by Initialized event
  educationHub.hatsContract = Address.zero(); // Will be set by Initialized event
  educationHub.executor = Address.zero(); // Will be set by Initialized event
  educationHub.isPaused = false;
  educationHub.nextModuleId = BigInt.fromI32(0); // Will be incremented as modules are created
  educationHub.createdAt = event.block.timestamp;
  educationHub.createdAtBlock = event.block.number;

  // Create PaymentManagerContract entity
  let paymentManager = new PaymentManagerContract(event.params.paymentManager);
  paymentManager.owner = Address.zero(); // Will be set by Initialized event
  paymentManager.revenueShareToken = Address.zero(); // Will be set by Initialized event
  paymentManager.distributionCounter = BigInt.fromI32(0); // Will be incremented as distributions are created
  paymentManager.createdAt = event.block.timestamp;
  paymentManager.createdAtBlock = event.block.number;

  // Create ExecutorContract entity
  let executor = new ExecutorContract(event.params.executor);
  executor.owner = Address.zero(); // Will be set by OwnershipTransferred event
  executor.allowedCaller = null; // Will be set by CallerSet event
  executor.hatsContract = Address.zero(); // Will be set by HatsSet event
  executor.isPaused = false;
  executor.createdAt = event.block.timestamp;
  executor.createdAtBlock = event.block.number;

  // Create ToggleModuleContract entity
  let toggleModule = new ToggleModuleContract(event.params.toggleModule);
  toggleModule.admin = Address.zero(); // Will be set by ToggleModuleInitialized event
  toggleModule.eligibilityModule = null; // Will be set when eligibility module calls setEligibilityModule
  toggleModule.createdAt = event.block.timestamp;
  toggleModule.createdAtBlock = event.block.number;

  // Load existing Organization (created by OrgRegistered) or create new one
  let organization = Organization.load(event.params.orgId);
  if (!organization) {
    organization = new Organization(event.params.orgId);
  }
  organization.executorContract = executor.id; // Link to ExecutorContract entity
  organization.hybridVoting = hybridVoting.id; // Link to HybridVotingContract entity
  organization.directDemocracyVoting = directDemocracyVoting.id; // Link to DirectDemocracyVotingContract entity
  organization.quickJoin = quickJoin.id; // Link to QuickJoinContract entity
  organization.participationToken = participationToken.id; // Link to ParticipationTokenContract entity
  organization.taskManager = taskManager.id; // Link to TaskManager entity
  organization.educationHub = educationHub.id; // Link to EducationHubContract entity
  organization.paymentManager = paymentManager.id; // Link to PaymentManagerContract entity
  organization.eligibilityModule = eligibilityModule.id; // Link to EligibilityModuleContract entity
  organization.toggleModuleContract = toggleModule.id; // Link to ToggleModuleContract entity
  organization.topHatId = event.params.topHatId;
  organization.roleHatIds = event.params.roleHatIds;
  organization.deployedAt = event.block.timestamp;
  organization.deployedAtBlock = event.block.number;
  organization.transactionHash = event.transaction.hash;

  // Set the reverse relationships
  taskManager.organization = organization.id;
  hybridVoting.organization = organization.id;
  directDemocracyVoting.organization = organization.id;
  eligibilityModule.organization = organization.id;
  participationToken.organization = organization.id;
  quickJoin.organization = organization.id;
  educationHub.organization = organization.id;
  paymentManager.organization = organization.id;
  executor.organization = organization.id;
  toggleModule.organization = organization.id;

  // Save entities
  taskManager.save();
  hybridVoting.save();
  directDemocracyVoting.save();
  eligibilityModule.save();
  participationToken.save();
  quickJoin.save();
  educationHub.save();
  paymentManager.save();
  executor.save();
  toggleModule.save();
  organization.save();

  // Create Role entities for user-defined roleHatIds only (not for topHatId which is a system hat)
  // This allows querying roles before Hat entities are created by EligibilityModule
  // Note: We do NOT create a Role for topHatId as it's a system hat (worn by Executor)
  // roleHatIds is already declared above for creatorHatIds derivation
  for (let i = 0; i < roleHatIds.length; i++) {
    getOrCreateRole(event.params.orgId, roleHatIds[i], event, true, true); // isUserRole = true, setIsUserRole = true
  }

  // Instantiate data source templates for this organization
  TaskManagerTemplate.create(event.params.taskManager);
  HybridVotingTemplate.create(event.params.hybridVoting);
  DirectDemocracyVotingTemplate.create(event.params.directDemocracyVoting);
  EligibilityModuleTemplate.create(event.params.eligibilityModule);
  ParticipationTokenTemplate.create(event.params.participationToken);
  QuickJoinTemplate.create(event.params.quickJoin);
  EducationHubTemplate.create(event.params.educationHub);
  PaymentManagerTemplate.create(event.params.paymentManager);
  ExecutorTemplate.create(event.params.executor);
  ToggleModuleTemplate.create(event.params.toggleModule);
}

/**
 * Handles the RolesCreated event from the OrgDeployer contract.
 * Updates Role entities with name, image, metadataCID, and canVote fields.
 * Also updates corresponding Hat entities with name and metadataCID.
 */
export function handleRolesCreated(event: RolesCreated): void {
  let orgId = event.params.orgId;
  let hatIds = event.params.hatIds;
  let names = event.params.names;
  let images = event.params.images;
  let metadataCIDs = event.params.metadataCIDs;
  let canVoteFlags = event.params.canVote;

  // Load the organization to get the eligibilityModule address for Hat lookups
  let org = Organization.load(orgId);
  let eligibilityModuleAddress: Bytes | null = null;
  if (org && org.eligibilityModule) {
    eligibilityModuleAddress = org.eligibilityModule;
  }

  for (let i = 0; i < hatIds.length; i++) {
    let hatId = hatIds[i];
    let roleId = orgId.toHexString() + "-" + hatId.toString();

    // Load or create the Role entity (RolesCreated is always for user-defined roles)
    let role = Role.load(roleId);
    if (role == null) {
      role = getOrCreateRole(orgId, hatId, event, true, true); // isUserRole = true, setIsUserRole = true
    }

    // Update Role with metadata from RolesCreated event
    if (i < names.length) {
      role.name = names[i];
    }
    if (i < images.length) {
      role.image = images[i];
    }
    if (i < metadataCIDs.length) {
      // Only set metadataCID if it's not empty (bytes32(0))
      let cid = metadataCIDs[i];
      if (cid != Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")) {
        role.metadataCID = cid;
      }
    }
    if (i < canVoteFlags.length) {
      role.canVote = canVoteFlags[i];
    }
    // Ensure isUserRole is set for roles from RolesCreated event
    role.isUserRole = true;

    role.save();

    // Also update the corresponding Hat entity if it exists
    if (eligibilityModuleAddress) {
      let hatEntityId = eligibilityModuleAddress.toHexString() + "-" + hatId.toString();
      let hat = Hat.load(hatEntityId);
      if (hat != null) {
        // Update Hat with name if Role has it
        if (i < names.length && names[i].length > 0) {
          hat.name = names[i];
        }
        // Update Hat with metadataCID if Role has it
        if (i < metadataCIDs.length) {
          let cid = metadataCIDs[i];
          if (cid != Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")) {
            hat.metadataCID = cid;
          }
        }
        hat.save();
      }
    }
  }
}

/**
 * Handles the InitialWearersAssigned event from the OrgDeployer contract.
 * This event is emitted AFTER OrgDeployed, ensuring EligibilityModuleContract exists.
 * Creates User entities for initial wearers (from mintToDeployer, mintToExecutor, additionalWearers).
 */
export function handleInitialWearersAssigned(event: InitialWearersAssigned): void {
  let orgId = event.params.orgId;
  let eligibilityModuleAddr = event.params.eligibilityModule;
  let wearers = event.params.wearers;
  let hatIds = event.params.hatIds;

  for (let i = 0; i < wearers.length; i++) {
    let wearerAddress = wearers[i];
    let hatId = hatIds[i];

    // Skip system contracts (executor, etc.)
    if (isSystemContract(orgId, wearerAddress)) {
      continue;
    }

    // Create User entity using the join handler (this is a deployment mint)
    let user = createUserOnJoin(
      orgId,
      wearerAddress,
      "DeploymentMint",
      event.block.timestamp,
      event.block.number
    );

    if (user) {
      // Update WearerEligibility with User link (if it exists from earlier WearerEligibilityUpdated event)
      let wearerEligibilityId = eligibilityModuleAddr.toHexString() + "-" +
        hatId.toString() + "-" + wearerAddress.toHexString();
      let wearerEligibility = WearerEligibility.load(wearerEligibilityId);

      if (wearerEligibility && !wearerEligibility.wearerUser) {
        wearerEligibility.wearerUser = user.id;
        wearerEligibility.save();
      }

      // Create RoleWearer if appropriate
      if (shouldCreateRoleWearer(orgId, hatId, wearerAddress)) {
        getOrCreateRoleWearer(orgId, hatId, wearerAddress, event);
        recordUserHatChange(user, hatId, true, event);
      }
    }
  }
}
