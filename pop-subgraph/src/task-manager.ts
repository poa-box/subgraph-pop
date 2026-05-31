import { Address, BigInt, Bytes, DataSourceContext } from "@graphprotocol/graph-ts";
import { TaskMetadata as TaskMetadataTemplate, ProjectMetadata as ProjectMetadataTemplate, TaskApplicationMetadata as TaskApplicationMetadataTemplate } from "../generated/templates";
import {
  ProjectCreated,
  ProjectDeleted,
  ProjectCapUpdated,
  ProjectManagerUpdated,
  ProjectRolePermSet,
  BountyCapSet,
  TaskCreated,
  TaskAssigned,
  TaskClaimed,
  TaskSubmitted,
  TaskCompleted,
  TaskCancelled,
  TaskUpdated,
  TaskApplicationSubmitted,
  TaskApplicationApproved,
  TaskRejected,
  FoldersUpdated,
  OrganizerHatAllowed,
  RolePermSet,
  HatSet
} from "../generated/templates/TaskManager/TaskManager";
import {
  Project,
  Task,
  TaskApplication,
  TaskManager,
  Organization,
  ProjectManager,
  ProjectRolePermission,
  GlobalRolePermission,
  ProjectBountyCap,
  ProjectCapChange,
  BountyCapChange,
  FolderRootChange,
  TaskMetadata,
  TaskApplicationMetadata,
  ProjectMetadata,
  TaskRejection
} from "../generated/schema";
import { getUsernameForAddress, loadExistingUser } from "./utils";

/**
 * Helper function to create a composite Project ID.
 * This ensures Projects are unique per TaskManager, preventing cross-org data leakage.
 * Format: taskManagerAddress-projectId
 */
function getProjectEntityId(taskManagerAddress: Address, projectId: Bytes): string {
  return taskManagerAddress.toHexString() + "-" + projectId.toHexString();
}

/**
 * Convert bytes32 sha256 digest to IPFS CIDv0 string.
 * The contract stores only the 32-byte hash, we need to prepend
 * the multihash prefix (0x1220) and base58 encode.
 */
function bytes32ToCid(hash: Bytes): string {
  // Create the multihash by prepending 0x1220 header
  let prefix = Bytes.fromHexString("0x1220");

  // Concatenate prefix + hash (34 bytes total)
  let multihash = new Bytes(34);
  for (let i = 0; i < 2; i++) {
    multihash[i] = prefix[i];
  }
  for (let i = 0; i < 32; i++) {
    multihash[i + 2] = hash[i];
  }

  // Base58 encode to get CIDv0 (starts with "Qm")
  return multihash.toBase58();
}

/**
 * Helper function to create an IPFS file data source for task metadata.
 *
 * Uses DataSourceContext to pass taskId and timestamp to the handler so it can
 * link the metadata back to the task and record when it was indexed.
 */
function createTaskMetadataSource(metadataHash: Bytes, taskId: string, timestamp: BigInt, txHash: Bytes): void {
  // Skip if metadataHash is empty (all zeros)
  let zeroHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");
  if (metadataHash.equals(zeroHash)) {
    return;
  }

  // Convert bytes32 sha256 digest to IPFS CIDv0 string
  let ipfsCid = bytes32ToCid(metadataHash);

  // Entity ID includes tx hash for uniqueness
  let entityId = txHash.toHexString() + "-" + ipfsCid;

  // Skip if TaskMetadata already exists (from previous blocks)
  let existingMetadata = TaskMetadata.load(entityId);
  if (existingMetadata != null) {
    return;
  }

  // Create context to pass taskId, timestamp, and txHash to the IPFS handler
  let context = new DataSourceContext();
  context.setString("taskId", taskId);
  context.setBigInt("timestamp", timestamp);
  context.setBytes("txHash", txHash);

  // Create the file data source with context
  TaskMetadataTemplate.createWithContext(ipfsCid, context);
}

/**
 * Helper function to create an IPFS file data source for project metadata.
 * Uses DataSourceContext to pass the projectId to the handler
 * so it can link the metadata back to the project.
 */
function createProjectMetadataSource(metadataHash: Bytes, projectId: string): void {
  // Skip if metadataHash is empty (all zeros)
  let zeroHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");
  if (metadataHash.equals(zeroHash)) {
    return;
  }

  // Convert bytes32 sha256 digest to IPFS CIDv0 string
  let ipfsCid = bytes32ToCid(metadataHash);

  // Skip if ProjectMetadata already exists - prevents duplicate file data sources
  let existingMetadata = ProjectMetadata.load(ipfsCid);
  if (existingMetadata != null) {
    return;
  }

  // Create context to pass projectId to the IPFS handler
  let context = new DataSourceContext();
  context.setString("projectId", projectId);

  // Create the file data source with context
  ProjectMetadataTemplate.createWithContext(ipfsCid, context);
}

/**
 * Handles the ProjectCreated event from a TaskManager contract.
 * Creates a Project entity and links it to the TaskManager.
 * Uses composite ID (taskManager-projectId) to ensure cross-org isolation.
 */
export function handleProjectCreated(event: ProjectCreated): void {
  let projectEntityId = getProjectEntityId(event.address, event.params.id);

  // Load existing project (may have been created as stub by ProjectManagerUpdated
  // if that event was processed first in the same transaction) or create new
  let project = Project.load(projectEntityId);
  if (project == null) {
    project = new Project(projectEntityId);
  }

  // Store raw project ID for reference
  project.projectId = event.params.id;
  // Link to TaskManager entity (event.address is the TaskManager contract address)
  project.taskManager = event.address;
  project.title = event.params.title.toString();
  project.metadataHash = event.params.metadataHash;
  project.cap = event.params.cap;
  project.createdAt = event.block.timestamp;
  project.createdAtBlock = event.block.number;
  project.deleted = false;

  // Set metadata link (CID) for the ProjectMetadata entity that will be created by IPFS handler
  let metadataCid = bytes32ToCid(event.params.metadataHash);
  project.metadata = metadataCid;

  project.save();

  // Create IPFS data source to fetch and index project metadata
  createProjectMetadataSource(event.params.metadataHash, projectEntityId);
}

export function handleProjectDeleted(event: ProjectDeleted): void {
  let projectEntityId = getProjectEntityId(event.address, event.params.id);
  let project = Project.load(projectEntityId);
  if (project) {
    project.deleted = true;
    project.deletedAt = event.block.timestamp;
    project.save();
  }
}

export function handleTaskCreated(event: TaskCreated): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let id = taskManagerAddress + "-" + taskId;

  let task = Task.load(id);
  if (task == null) {
    task = new Task(id);
  }

  task.taskId = event.params.id;
  task.taskManager = event.address;
  // Use composite Project ID to ensure cross-org isolation
  task.project = getProjectEntityId(event.address, event.params.project);
  task.payout = event.params.payout;
  task.bountyToken = event.params.bountyToken;
  task.bountyPayout = event.params.bountyPayout;
  task.requiresApplication = event.params.requiresApplication;
  task.title = event.params.title.toString();
  task.metadataHash = event.params.metadataHash;
  task.status = "Open";
  task.rejectionCount = 0;
  task.createdAt = event.block.timestamp;
  task.createdAtBlock = event.block.number;

  // Set metadata link using txHash-CID format for uniqueness
  let metadataCid = bytes32ToCid(event.params.metadataHash);
  task.metadata = event.transaction.hash.toHexString() + "-" + metadataCid;

  task.save();

  // Create IPFS data source to fetch and index task metadata
  createTaskMetadataSource(event.params.metadataHash, id, event.block.timestamp, event.transaction.hash);
}

export function handleTaskAssigned(event: TaskAssigned): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let id = taskManagerAddress + "-" + taskId;

  let task = Task.load(id);
  if (task) {
    // Get organization from TaskManager
    let taskManager = TaskManager.load(event.address);
    if (taskManager) {
      let user = loadExistingUser(
        taskManager.organization,
        event.params.assignee,
        event.block.timestamp,
        event.block.number
      );
      if (user) {
        task.assigneeUser = user.id;
      }
    }

    task.assignee = event.params.assignee;
    task.assigneeUsername = getUsernameForAddress(event.params.assignee);
    task.status = "Assigned";
    task.assignedAt = event.block.timestamp;
    task.save();
  }
}

export function handleTaskClaimed(event: TaskClaimed): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let id = taskManagerAddress + "-" + taskId;

  let task = Task.load(id);
  if (task) {
    task.assignee = event.params.claimer;
    task.assigneeUsername = getUsernameForAddress(event.params.claimer);
    task.status = "Assigned";
    task.assignedAt = event.block.timestamp;
    task.save();
  }
}

export function handleTaskSubmitted(event: TaskSubmitted): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let id = taskManagerAddress + "-" + taskId;

  let task = Task.load(id);
  if (task) {
    task.status = "Submitted";
    task.submittedAt = event.block.timestamp;
    task.submissionHash = event.params.submissionHash;

    // Update metadata link to submission content using txHash-CID format
    let submissionCid = bytes32ToCid(event.params.submissionHash);
    task.metadata = event.transaction.hash.toHexString() + "-" + submissionCid;

    task.save();

    // Create IPFS data source to fetch and parse submission metadata
    createTaskMetadataSource(event.params.submissionHash, id, event.block.timestamp, event.transaction.hash);
  }
}

export function handleTaskCompleted(event: TaskCompleted): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let id = taskManagerAddress + "-" + taskId;

  let task = Task.load(id);
  if (task) {
    // Get organization from TaskManager
    let taskManager = TaskManager.load(event.address);
    if (taskManager) {
      let user = loadExistingUser(
        taskManager.organization,
        event.params.completer,
        event.block.timestamp,
        event.block.number
      );
      if (user) {
        task.completerUser = user.id;

        // Increment totalTasksCompleted
        user.totalTasksCompleted = user.totalTasksCompleted.plus(BigInt.fromI32(1));
        user.save();
      }
    }

    // Set assignee to completer if not already set
    // This handles cases where task is completed without explicit assignment
    if (!task.assignee) {
      task.assignee = event.params.completer;
      task.assigneeUsername = getUsernameForAddress(event.params.completer);
    }
    task.completer = event.params.completer;
    task.completerUsername = getUsernameForAddress(event.params.completer);
    task.status = "Completed";
    task.completedAt = event.block.timestamp;
    task.save();
  }
}

export function handleTaskCancelled(event: TaskCancelled): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let id = taskManagerAddress + "-" + taskId;

  let task = Task.load(id);
  if (task) {
    // Get organization from TaskManager
    let taskManager = TaskManager.load(event.address);
    if (taskManager) {
      let user = loadExistingUser(
        taskManager.organization,
        event.params.canceller,
        event.block.timestamp,
        event.block.number
      );
      if (user) {
        task.cancellerUser = user.id;

        // Increment totalTasksCancelled
        user.totalTasksCancelled = user.totalTasksCancelled.plus(BigInt.fromI32(1));
        user.save();
      }
    }

    task.canceller = event.params.canceller;
    task.cancellerUsername = getUsernameForAddress(event.params.canceller);
    task.status = "Cancelled";
    task.cancelledAt = event.block.timestamp;
    task.save();
  }
}

export function handleTaskUpdated(event: TaskUpdated): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let id = taskManagerAddress + "-" + taskId;

  let task = Task.load(id);
  if (task) {
    // Check if metadata changed before updating
    let metadataChanged = !task.metadataHash.equals(event.params.metadataHash);

    task.payout = event.params.payout;
    task.bountyToken = event.params.bountyToken;
    task.bountyPayout = event.params.bountyPayout;
    task.title = event.params.title.toString();
    task.metadataHash = event.params.metadataHash;
    task.updatedAt = event.block.timestamp;

    // Update metadata link if changed - uses txHash-CID as entity ID
    if (metadataChanged) {
      let metadataCid = bytes32ToCid(event.params.metadataHash);
      task.metadata = event.transaction.hash.toHexString() + "-" + metadataCid;
    }

    task.save();

    // Re-fetch metadata from IPFS if it changed
    if (metadataChanged) {
      createTaskMetadataSource(event.params.metadataHash, id, event.block.timestamp, event.transaction.hash);
    }
  }
}

export function handleTaskApplicationSubmitted(event: TaskApplicationSubmitted): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let taskEntityId = taskManagerAddress + "-" + taskId;
  let applicantAddress = event.params.applicant.toHexString();
  let id = taskManagerAddress + "-" + taskId + "-" + applicantAddress;

  let application = TaskApplication.load(id);
  if (application == null) {
    application = new TaskApplication(id);
  }

  application.task = taskEntityId;
  application.applicant = event.params.applicant;
  application.applicantUsername = getUsernameForAddress(event.params.applicant);

  // Link to User entity
  let taskManager = TaskManager.load(event.address);
  if (taskManager) {
    let user = loadExistingUser(
      taskManager.organization,
      event.params.applicant,
      event.block.timestamp,
      event.block.number
    );
    if (user) {
      application.applicantUser = user.id;
    }
  }

  application.applicationHash = event.params.applicationHash;
  application.approved = false;
  application.appliedAt = event.block.timestamp;
  application.appliedAtBlock = event.block.number;

  // Set metadata link and create IPFS data source for application content
  let zeroHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");
  if (!event.params.applicationHash.equals(zeroHash)) {
    let applicationCid = bytes32ToCid(event.params.applicationHash);
    application.metadata = applicationCid;

    // TaskApplicationMetadata is immutable — skip if already indexed
    let existingAppMeta = TaskApplicationMetadata.load(applicationCid);
    if (existingAppMeta == null) {
      let context = new DataSourceContext();
      context.setBigInt("timestamp", event.block.timestamp);

      TaskApplicationMetadataTemplate.createWithContext(applicationCid, context);
    }
  }

  application.save();
}

export function handleTaskApplicationApproved(event: TaskApplicationApproved): void {
  let taskId = event.params.id.toString();
  let taskManagerAddress = event.address.toHexString();
  let applicantAddress = event.params.applicant.toHexString();
  let applicationId = taskManagerAddress + "-" + taskId + "-" + applicantAddress;

  // Update the TaskApplication entity
  let application = TaskApplication.load(applicationId);
  if (application) {
    let taskManager = TaskManager.load(event.address);
    if (taskManager) {
      let user = loadExistingUser(
        taskManager.organization,
        event.params.approver,
        event.block.timestamp,
        event.block.number
      );
      if (user) {
        application.approverUser = user.id;
      }
    }

    application.approved = true;
    application.approver = event.params.approver;
    application.approverUsername = getUsernameForAddress(event.params.approver);
    application.approvedAt = event.block.timestamp;
    application.save();
  }

  // Update the Task entity — contract sets status to CLAIMED and claimer to applicant
  let taskEntityId = taskManagerAddress + "-" + taskId;
  let task = Task.load(taskEntityId);
  if (task) {
    let taskManager = TaskManager.load(event.address);
    if (taskManager) {
      let assigneeUser = loadExistingUser(
        taskManager.organization,
        event.params.applicant,
        event.block.timestamp,
        event.block.number
      );
      if (assigneeUser) {
        task.assigneeUser = assigneeUser.id;
      }
    }

    task.assignee = event.params.applicant;
    task.assigneeUsername = getUsernameForAddress(event.params.applicant);
    task.status = "Assigned";
    task.assignedAt = event.block.timestamp;
    task.save();
  }
}

/**
 * Handles the ProjectCapUpdated event from a TaskManager contract.
 * Updates the Project's participation token cap and creates a historical record.
 */
export function handleProjectCapUpdated(event: ProjectCapUpdated): void {
  let projectEntityId = getProjectEntityId(event.address, event.params.id);
  let project = Project.load(projectEntityId);
  if (project) {
    // Update current cap on project
    project.cap = event.params.newCap;
    project.save();

    // Create historical record
    let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
    let change = new ProjectCapChange(changeId);
    change.project = projectEntityId;
    change.oldCap = event.params.oldCap;
    change.newCap = event.params.newCap;
    change.changedAt = event.block.timestamp;
    change.changedAtBlock = event.block.number;
    change.transactionHash = event.transaction.hash;
    change.save();
  }
}

/**
 * Handles the ProjectManagerUpdated event from a TaskManager contract.
 * Creates or updates a ProjectManager entity to track manager assignments.
 *
 * Note: This event may be emitted BEFORE ProjectCreated in the same transaction
 * (due to event ordering). If the Project doesn't exist yet, we create a stub
 * that will be properly filled in when handleProjectCreated runs.
 */
export function handleProjectManagerUpdated(event: ProjectManagerUpdated): void {
  let projectId = event.params.id;
  let managerAddress = event.params.manager;
  let isManager = event.params.isManager;

  // Use composite Project ID for cross-org isolation
  let projectEntityId = getProjectEntityId(event.address, projectId);

  // ProjectCreated now fires before ProjectManagerUpdated (event ordering fixed in contract)
  let project = Project.load(projectEntityId);
  if (!project) return;

  let id = projectEntityId + "-" + managerAddress.toHexString();
  let manager = ProjectManager.load(id);

  if (manager == null) {
    manager = new ProjectManager(id);
    manager.project = projectEntityId;
    manager.manager = managerAddress;
    manager.addedAt = event.block.timestamp;
    manager.addedAtBlock = event.block.number;

    // Link to User entity if TaskManager has organization context
    let taskManager = TaskManager.load(event.address);
    if (taskManager) {
      let user = loadExistingUser(
        taskManager.organization,
        managerAddress,
        event.block.timestamp,
        event.block.number
      );
      if (user) {
        manager.managerUser = user.id;
      }
    }
  }

  manager.isActive = isManager;
  manager.lastUpdatedAt = event.block.timestamp;
  manager.transactionHash = event.transaction.hash;

  if (!isManager) {
    manager.removedAt = event.block.timestamp;
    manager.removedAtBlock = event.block.number;
  }

  manager.save();
}

/**
 * Handles the ProjectRolePermSet event from a TaskManager contract.
 * Creates or updates a ProjectRolePermission entity to track hat-based permissions.
 * Permission bitmask: CREATE=1, CLAIM=2, REVIEW=4, ASSIGN=8, SELF_REVIEW=16, BUDGET=32.
 * SELF_REVIEW and BUDGET were added in TaskManager v4 — the contract permits both
 * bits in per-project masks, so decoding them here keeps `where: { canBudget: true }`
 * queries working without forcing frontends to bit-AND raw masks.
 *
 * Note: This event may be emitted BEFORE ProjectCreated in the same transaction.
 */
export function handleProjectRolePermSet(event: ProjectRolePermSet): void {
  let projectId = event.params.id;
  let hatId = event.params.hatId;
  let mask = event.params.mask;

  // Use composite Project ID for cross-org isolation
  let projectEntityId = getProjectEntityId(event.address, projectId);

  // ProjectCreated now fires before ProjectRolePermSet (event ordering fixed in contract)
  let project = Project.load(projectEntityId);
  if (!project) return;

  let id = projectEntityId + "-" + hatId.toString();
  let perm = ProjectRolePermission.load(id);

  if (perm == null) {
    perm = new ProjectRolePermission(id);
    perm.project = projectEntityId;
    perm.hatId = hatId;
  }

  perm.mask = mask;
  perm.canCreate = (mask & 1) != 0;
  perm.canClaim = (mask & 2) != 0;
  perm.canReview = (mask & 4) != 0;
  perm.canAssign = (mask & 8) != 0;
  perm.canSelfReview = (mask & 16) != 0;
  perm.canBudget = (mask & 32) != 0;
  perm.canEditMeta = (mask & 64) != 0;
  perm.canEditFull = (mask & 128) != 0;
  perm.setAt = event.block.timestamp;
  perm.setAtBlock = event.block.number;
  perm.transactionHash = event.transaction.hash;

  perm.save();
}

/**
 * Handles the BountyCapSet event from a TaskManager contract.
 * Creates or updates a ProjectBountyCap entity and creates a historical record.
 *
 * Note: This event may be emitted BEFORE ProjectCreated in the same transaction.
 */
export function handleBountyCapSet(event: BountyCapSet): void {
  let projectId = event.params.projectId;
  let token = event.params.token;

  // Use composite Project ID for cross-org isolation
  let projectEntityId = getProjectEntityId(event.address, projectId);

  // ProjectCreated now fires before BountyCapSet (event ordering fixed in contract)
  let project = Project.load(projectEntityId);
  if (!project) return;

  let capId = projectEntityId + "-" + token.toHexString();
  let bountyCap = ProjectBountyCap.load(capId);

  if (bountyCap == null) {
    bountyCap = new ProjectBountyCap(capId);
    bountyCap.project = projectEntityId;
    bountyCap.token = token;
  }

  bountyCap.cap = event.params.newCap;
  bountyCap.setAt = event.block.timestamp;
  bountyCap.setAtBlock = event.block.number;
  bountyCap.transactionHash = event.transaction.hash;
  bountyCap.save();

  // Create historical record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new BountyCapChange(changeId);
  change.bountyCap = capId;
  change.project = projectEntityId;
  change.token = token;
  change.oldCap = event.params.oldCap;
  change.newCap = event.params.newCap;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

/**
 * Handles the TaskRejected event from a TaskManager contract.
 * Updates the task status back to Assigned and creates a rejection record.
 */
export function handleTaskRejected(event: TaskRejected): void {
  let taskEntityId = event.address.toHexString() + "-" + event.params.id.toString();
  let task = Task.load(taskEntityId);
  if (!task) return;

  task.status = "Assigned";
  task.rejectionHash = event.params.rejectionHash;
  task.rejectionCount = task.rejectionCount + 1;
  task.updatedAt = event.block.timestamp;

  // Clear stale submission data — task is no longer submitted after rejection
  task.submissionHash = null;
  task.submittedAt = null;

  // Restore task.metadata to the original creation/update metadata.
  // handleTaskSubmitted overwrites task.metadata to point at submission content;
  // on rejection we need to point it back to the task description metadata.
  let originalCid = bytes32ToCid(task.metadataHash);
  task.metadata = event.transaction.hash.toHexString() + "-" + originalCid;

  task.save();

  // Re-fetch original task description metadata from IPFS so the restored link resolves
  createTaskMetadataSource(task.metadataHash, taskEntityId, event.block.timestamp, event.transaction.hash);

  // Create IPFS data source to fetch and parse rejection metadata
  createTaskMetadataSource(event.params.rejectionHash, taskEntityId, event.block.timestamp, event.transaction.hash);

  // Create rejection record
  let rejectionId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let rejection = new TaskRejection(rejectionId);
  rejection.task = taskEntityId;
  rejection.rejector = event.params.rejector;
  rejection.rejectorUsername = getUsernameForAddress(event.params.rejector);
  rejection.rejectionHash = event.params.rejectionHash;

  // Link to rejection metadata entity (will be created by IPFS data source)
  let rejectionCid = bytes32ToCid(event.params.rejectionHash);
  rejection.metadata = event.transaction.hash.toHexString() + "-" + rejectionCid;
  rejection.rejectedAt = event.block.timestamp;
  rejection.rejectedAtBlock = event.block.number;
  rejection.transactionHash = event.transaction.hash;

  // Link to User entity
  let taskManager = TaskManager.load(event.address);
  if (taskManager) {
    let user = loadExistingUser(
      taskManager.organization,
      event.params.rejector,
      event.block.timestamp,
      event.block.number
    );
    if (user) {
      rejection.rejectorUser = user.id;
    }
  }

  rejection.save();
}

/**
 * Handles the FoldersUpdated event from a TaskManager contract (v4).
 * Stores the new IPFS root on the Organization and appends a FolderRootChange
 * record so frontends can render a revision log. The subgraph does not resolve
 * the folder-tree JSON itself — the frontend fetches IPFS at the root.
 */
export function handleFoldersUpdated(event: FoldersUpdated): void {
  let taskManager = TaskManager.load(event.address);
  if (!taskManager) return;

  let organization = Organization.load(taskManager.organization);
  if (!organization) return;

  organization.foldersRoot = event.params.newRoot;
  organization.foldersUpdatedAt = event.block.timestamp;
  organization.foldersUpdatedBy = event.params.sender;
  organization.save();

  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new FolderRootChange(changeId);
  change.organization = organization.id;
  change.newRoot = event.params.newRoot;
  change.oldRoot = event.params.oldRoot;
  change.sender = event.params.sender;
  change.senderUsername = getUsernameForAddress(event.params.sender);

  let user = loadExistingUser(
    organization.id,
    event.params.sender,
    event.block.timestamp,
    event.block.number
  );
  if (user) {
    change.senderUser = user.id;
  }

  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

/**
 * Handles the OrganizerHatAllowed event from a TaskManager contract (v4).
 * Mutates the denormalized organizerHatIds array on the TaskManager entity.
 * Mirrors the contract's HatManager.setHatInArray semantics: add if allowed
 * and not already present; remove if revoked and present. No-op otherwise.
 */
export function handleOrganizerHatAllowed(event: OrganizerHatAllowed): void {
  let taskManager = TaskManager.load(event.address);
  if (!taskManager) return;

  let hatId = event.params.hatId;
  let allowed = event.params.allowed;

  // Copy-mutate-reassign — AssemblyScript array fields don't mutate in place.
  let current = taskManager.organizerHatIds;
  let next: BigInt[] = [];
  let found = false;
  for (let i = 0; i < current.length; i++) {
    if (current[i].equals(hatId)) {
      found = true;
      if (allowed) {
        next.push(current[i]); // keep
      }
      // if !allowed, drop
    } else {
      next.push(current[i]);
    }
  }
  if (allowed && !found) {
    next.push(hatId);
  }

  taskManager.organizerHatIds = next;
  taskManager.save();
}

/**
 * Handles the RolePermSet event from a TaskManager contract (v4).
 * Upserts a GlobalRolePermission entity keyed by (taskManager, hatId).
 * Writes the mask verbatim — mask=0 (revoke) is intentionally preserved so
 * frontends can distinguish "never granted" (no entity) from "explicitly revoked"
 * (entity with mask=0). Decodes all 6 TaskPerm bits for query convenience.
 */
export function handleRolePermSet(event: RolePermSet): void {
  let taskManager = TaskManager.load(event.address);
  if (!taskManager) return;

  let hatId = event.params.hatId;
  let mask = event.params.mask;

  let id = event.address.toHexString() + "-" + hatId.toString();
  let perm = GlobalRolePermission.load(id);
  if (perm == null) {
    perm = new GlobalRolePermission(id);
    perm.taskManager = event.address;
    perm.hatId = hatId;
  }

  perm.mask = mask;
  perm.canCreate = (mask & 1) != 0;
  perm.canClaim = (mask & 2) != 0;
  perm.canReview = (mask & 4) != 0;
  perm.canAssign = (mask & 8) != 0;
  perm.canSelfReview = (mask & 16) != 0;
  perm.canBudget = (mask & 32) != 0;
  perm.canEditMeta = (mask & 64) != 0;
  perm.canEditFull = (mask & 128) != 0;
  perm.setAt = event.block.timestamp;
  perm.setAtBlock = event.block.number;
  perm.transactionHash = event.transaction.hash;
  perm.save();
}

/**
 * Handler for HatSet (TaskManager).
 *
 * The TaskManager emits HatSet(HatType.CREATOR, hat, allowed) for PROJECT-creator hats —
 * once per hat inside initialize() (deploy time) and again on
 * setConfig(CREATOR_HAT_ALLOWED, ...). handleOrgDeployed seeds taskManager.creatorHatIds
 * from a roleHatIds[1:] heuristic, which is wrong for orgs that don't follow the
 * "index 0 is the only non-creator" convention (e.g. a member role that CAN create
 * projects, or a non-member role that can't — and the array also goes stale as roleHatIds
 * grows post-deploy). Reconciling against the events the contract actually emits keeps
 * creatorHatIds — and the org-structure "Create Project" column — aligned with chain.
 *
 * hatType is always CREATOR (0) for the TaskManager; guard defensively anyway. Idempotent:
 * adds the hat when allowed and absent, drops it when revoked, leaves the array otherwise.
 */
export function handleHatSet(event: HatSet): void {
  if (event.params.hatType != 0) {
    return;
  }

  let taskManager = TaskManager.load(event.address);
  if (!taskManager) {
    return;
  }

  let hat = event.params.hat;
  let current = taskManager.creatorHatIds;
  let next: BigInt[] = [];
  let present = false;
  for (let i = 0; i < current.length; i++) {
    if (current[i].equals(hat)) {
      present = true;
      // Keep it only while the grant is active; a revoke (allowed=false) drops it.
      if (event.params.allowed) {
        next.push(current[i]);
      }
    } else {
      next.push(current[i]);
    }
  }
  if (event.params.allowed && !present) {
    next.push(hat);
  }

  taskManager.creatorHatIds = next;
  taskManager.save();
}
