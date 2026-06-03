import {
  assert,
  describe,
  test,
  clearStore,
  beforeEach,
  afterEach
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  handleProjectCreated,
  handleTaskCreated,
  handleTaskAssigned,
  handleTaskSubmitted,
  handleTaskCompleted,
  handleProjectCapUpdated,
  handleProjectManagerUpdated,
  handleProjectRolePermSet,
  handleBountyCapSet,
  handleTaskRejected,
  handleFoldersUpdated,
  handleOrganizerHatAllowed,
  handleRolePermSet
} from "../src/task-manager";
import {
  createProjectCreatedEvent,
  createTaskCreatedEvent,
  createTaskAssignedEvent,
  createTaskSubmittedEvent,
  createTaskCompletedEvent,
  createProjectCapUpdatedEvent,
  createProjectManagerUpdatedEvent,
  createProjectRolePermSetEvent,
  createBountyCapSetEvent,
  createTaskRejectedEvent,
  createFoldersUpdatedEvent,
  createOrganizerHatAllowedEvent,
  createRolePermSetEvent
} from "./task-manager-utils";
import { Task, Organization, TaskManager, HybridVotingContract, DirectDemocracyVotingContract, EligibilityModuleContract, ParticipationTokenContract, QuickJoinContract, EducationHubContract, PaymentManagerContract, ExecutorContract, ToggleModuleContract } from "../generated/schema";

/**
 * Helper function to create necessary entities for task manager tests.
 * Creates an Organization and TaskManager entity since Projects require
 * a TaskManager entity to exist.
 */
function setupTaskManagerEntities(): void {
  // Create Organization entity
  let orgId = Bytes.fromHexString(
    "0x1111111111111111111111111111111111111111111111111111111111111111"
  );
  let organization = new Organization(orgId);
  organization.topHatId = BigInt.fromI32(1000);
  organization.roleHatIds = [BigInt.fromI32(1001), BigInt.fromI32(1002)];
  organization.deployedAt = BigInt.fromI32(1000);
  organization.deployedAtBlock = BigInt.fromI32(100);
  organization.transactionHash = Bytes.fromHexString("0xabcd");

  // Create ExecutorContract entity
  let executorAddress = Address.fromString("0x0000000000000000000000000000000000000001");
  let executor = new ExecutorContract(executorAddress);
  executor.organization = orgId;
  executor.owner = Address.zero();
  executor.allowedCaller = null;
  executor.hatsContract = Address.zero();
  executor.isPaused = false;
  executor.createdAt = BigInt.fromI32(1000);
  executor.createdAtBlock = BigInt.fromI32(100);

  // Create ToggleModuleContract entity
  let toggleModuleAddress = Address.fromString("0x000000000000000000000000000000000000000a");
  let toggleModule = new ToggleModuleContract(toggleModuleAddress);
  toggleModule.organization = orgId;
  toggleModule.admin = Address.zero();
  toggleModule.createdAt = BigInt.fromI32(1000);
  toggleModule.createdAtBlock = BigInt.fromI32(100);

  // Create TaskManager entity with the default mock event address
  let taskManagerAddress = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
  let taskManager = new TaskManager(taskManagerAddress);
  taskManager.organization = orgId;
  taskManager.creatorHatIds = [BigInt.fromI32(1002)]; // Non-member roles that can create projects
  taskManager.organizerHatIds = []; // populated by OrganizerHatAllowed events (v4)
  taskManager.createdAt = BigInt.fromI32(1000);
  taskManager.createdAtBlock = BigInt.fromI32(100);
  taskManager.transactionHash = Bytes.fromHexString("0xabcd");

  // Create HybridVotingContract entity (required by Organization schema)
  let hybridVotingAddress = Address.fromString("0x0000000000000000000000000000000000000002");
  let hybridVoting = new HybridVotingContract(hybridVotingAddress);
  hybridVoting.organization = orgId;
  hybridVoting.executor = Address.zero();
  hybridVoting.thresholdPct = 0;
  hybridVoting.quorum = 0;
  hybridVoting.hats = Address.zero();
  hybridVoting.classVersion = BigInt.fromI32(0);
  hybridVoting.createdAt = BigInt.fromI32(1000);
  hybridVoting.createdAtBlock = BigInt.fromI32(100);

  // Create DirectDemocracyVotingContract entity (required by Organization schema)
  let ddvAddress = Address.fromString("0x0000000000000000000000000000000000000003");
  let ddv = new DirectDemocracyVotingContract(ddvAddress);
  ddv.organization = orgId;
  ddv.executor = Address.zero();
  ddv.thresholdPct = 0;
  ddv.quorum = 0;
  ddv.hats = Address.zero();
  ddv.createdAt = BigInt.fromI32(1000);
  ddv.createdAtBlock = BigInt.fromI32(100);

  // Create EligibilityModuleContract entity (required by Organization schema)
  let eligibilityModuleAddress = Address.fromString("0x0000000000000000000000000000000000000009");
  let eligibilityModule = new EligibilityModuleContract(eligibilityModuleAddress);
  eligibilityModule.organization = orgId;
  eligibilityModule.superAdmin = Address.zero();
  eligibilityModule.hatsContract = Address.zero();
  eligibilityModule.toggleModule = Address.fromString("0x000000000000000000000000000000000000000a");
  eligibilityModule.isPaused = false;
  eligibilityModule.createdAt = BigInt.fromI32(1000);
  eligibilityModule.createdAtBlock = BigInt.fromI32(100);

  // Create ParticipationTokenContract entity (required by Organization schema)
  let participationTokenAddress = Address.fromString("0x0000000000000000000000000000000000000005");
  let participationToken = new ParticipationTokenContract(participationTokenAddress);
  participationToken.organization = orgId;
  participationToken.name = "Test Token";
  participationToken.symbol = "TEST";
  participationToken.totalSupply = BigInt.fromI32(0);
  participationToken.executor = Address.zero();
  participationToken.hatsContract = Address.zero();
  participationToken.createdAt = BigInt.fromI32(1000);
  participationToken.createdAtBlock = BigInt.fromI32(100);

  // Create QuickJoinContract entity (required by Organization schema)
  let quickJoinAddress = Address.fromString("0x0000000000000000000000000000000000000004");
  let quickJoin = new QuickJoinContract(quickJoinAddress);
  quickJoin.organization = orgId;
  quickJoin.executor = Address.zero();
  quickJoin.hatsContract = Address.zero();
  quickJoin.accountRegistry = Address.zero();
  quickJoin.masterDeployAddress = Address.zero();
  quickJoin.memberHatIds = [];
  quickJoin.createdAt = BigInt.fromI32(1000);
  quickJoin.createdAtBlock = BigInt.fromI32(100);

  // Create EducationHubContract entity (required by Organization schema)
  let educationHubAddress = Address.fromString("0x0000000000000000000000000000000000000007");
  let educationHub = new EducationHubContract(educationHubAddress);
  educationHub.organization = orgId;
  educationHub.token = Address.zero();
  educationHub.hatsContract = Address.zero();
  educationHub.executor = Address.zero();
  educationHub.isPaused = false;
  educationHub.nextModuleId = BigInt.fromI32(0);
  educationHub.createdAt = BigInt.fromI32(1000);
  educationHub.createdAtBlock = BigInt.fromI32(100);

  // Create PaymentManagerContract entity (required by Organization schema)
  let paymentManagerAddress = Address.fromString("0x0000000000000000000000000000000000000008");
  let paymentManager = new PaymentManagerContract(paymentManagerAddress);
  paymentManager.organization = orgId;
  paymentManager.owner = Address.zero();
  paymentManager.revenueShareToken = Address.zero();
  paymentManager.distributionCounter = BigInt.fromI32(0);
  paymentManager.createdAt = BigInt.fromI32(1000);
  paymentManager.createdAtBlock = BigInt.fromI32(100);

  // Set the relationships
  organization.executorContract = executorAddress;
  organization.toggleModuleContract = toggleModuleAddress;
  organization.taskManager = taskManagerAddress;
  organization.hybridVoting = hybridVotingAddress;
  organization.directDemocracyVoting = ddvAddress;
  organization.eligibilityModule = eligibilityModuleAddress;
  organization.participationToken = participationTokenAddress;
  organization.quickJoin = quickJoinAddress;
  organization.educationHub = educationHubAddress;
  organization.paymentManager = paymentManagerAddress;

  // Save entities
  executor.save();
  toggleModule.save();
  taskManager.save();
  hybridVoting.save();
  ddv.save();
  eligibilityModule.save();
  participationToken.save();
  quickJoin.save();
  educationHub.save();
  paymentManager.save();
  organization.save();
}

describe("TaskManager", () => {
  afterEach(() => {
    clearStore();
  });

  test("Project created and stored with composite ID", () => {
    // Setup Organization and TaskManager entities first
    setupTaskManagerEntities();

    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);

    let event = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(event);

    // Project ID should be composite: taskManager-projectId
    let expectedProjectId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    assert.entityCount("Project", 1);
    assert.fieldEquals(
      "Project",
      expectedProjectId,
      "cap",
      "1000"
    );
    assert.fieldEquals(
      "Project",
      expectedProjectId,
      "deleted",
      "false"
    );
    // Verify Project links to TaskManager entity
    assert.fieldEquals(
      "Project",
      expectedProjectId,
      "taskManager",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a"
    );
    // Verify raw projectId is stored
    assert.fieldEquals(
      "Project",
      expectedProjectId,
      "projectId",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
  });

  test("Task created and stored with composite project reference", () => {
    // Setup Organization and TaskManager entities first
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let projectTitle = Bytes.fromHexString("0xabcd");
    let projectMetadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, projectTitle, projectMetadataHash, cap);
    handleProjectCreated(projectEvent);

    // Now create a task
    let taskId = BigInt.fromI32(1);
    let payout = BigInt.fromI32(100);
    let bountyToken = Address.fromString("0x0000000000000000000000000000000000000001");
    let bountyPayout = BigInt.fromI32(50);
    let title = Bytes.fromHexString("0x1234");

    let event = createTaskCreatedEvent(
      taskId,
      projectId,
      payout,
      bountyToken,
      bountyPayout,
      true,
      title
    );
    handleTaskCreated(event);

    assert.entityCount("Task", 1);
    // Task ID is formatted as taskManager-taskId
    let expectedTaskId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1";
    // Task.project should reference composite Project ID
    let expectedProjectId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    assert.fieldEquals("Task", expectedTaskId, "taskId", "1");
    assert.fieldEquals("Task", expectedTaskId, "payout", "100");
    assert.fieldEquals("Task", expectedTaskId, "status", "Open");
    assert.fieldEquals("Task", expectedTaskId, "requiresApplication", "true");
    // Verify task links to composite project ID
    assert.fieldEquals("Task", expectedTaskId, "project", expectedProjectId);
  });

  test("Batch-created tasks with identical metadata get distinct, task-scoped metadata links", () => {
    // Regression test for the graph-node indexing error:
    //   "can not append operations that go backwards from Insert { TaskMetadata[...] }"
    // Tasks created in ONE batch transaction share a tx hash, and tasks with
    // identical metadata (e.g. the same title) produce an identical IPFS CID.
    // The old txHash-CID entity id collided across those tasks, spawning two file
    // data sources that wrote the same TaskMetadata id in the same block. The id
    // is now scoped by taskId (taskManager-taskId), so the links must differ.
    setupTaskManagerEntities();

    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let projectEvent = createProjectCreatedEvent(
      projectId,
      Bytes.fromHexString("0xabcd"),
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234"),
      BigInt.fromI32(1000)
    );
    handleProjectCreated(projectEvent);

    // Same title + same metadata hash => same CID. createTaskCreatedEvent reuses
    // newMockEvent()'s default transaction hash, so both share a tx hash (batch).
    let sharedTitle = Bytes.fromHexString("0x48656c70206d6f7665"); // "Help move"
    let sharedMetadataHash = Bytes.fromHexString(
      "0x00000000000000000000000000000000000000000000000000000000deadbeef"
    );
    let bountyToken = Address.fromString("0x0000000000000000000000000000000000000001");

    let event2 = createTaskCreatedEvent(
      BigInt.fromI32(2), projectId, BigInt.fromI32(100), bountyToken,
      BigInt.fromI32(0), false, sharedTitle, sharedMetadataHash
    );
    handleTaskCreated(event2);

    let event3 = createTaskCreatedEvent(
      BigInt.fromI32(3), projectId, BigInt.fromI32(100), bountyToken,
      BigInt.fromI32(0), false, sharedTitle, sharedMetadataHash
    );
    handleTaskCreated(event3);

    assert.entityCount("Task", 2);

    let id2 = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-2";
    let id3 = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-3";
    let task2 = Task.load(id2);
    let task3 = Task.load(id3);
    assert.assertTrue(task2 != null);
    assert.assertTrue(task3 != null);

    let meta2 = task2!.metadata;
    let meta3 = task3!.metadata;
    assert.assertTrue(meta2 != null);
    assert.assertTrue(meta3 != null);

    // Core guard: identical-metadata batch tasks must NOT share a TaskMetadata id.
    assert.assertTrue(meta2 != meta3);

    // Each link is scoped by its own task id and shares the same CID suffix.
    let cid2 = meta2!.substring((id2 + "-").length);
    let cid3 = meta3!.substring((id3 + "-").length);
    assert.assertTrue(cid2 == cid3);
    assert.fieldEquals("Task", id2, "metadata", id2 + "-" + cid2);
    assert.fieldEquals("Task", id3, "metadata", id3 + "-" + cid2);
  });

  test("Same task re-referencing identical metadata across txs keeps a stable link", () => {
    // Regression test for the second graph-node indexing error:
    //   "impossible combination of entity operations: Insert { TaskMetadata[...] }
    //    and then Insert { ... }"
    // A task can re-reference the SAME metadata in a LATER tx/block (TaskRejected
    // restores the original description). The file data source then runs again;
    // graph-node dedupes file data sources by (template, CID, context), so the
    // context carries ONLY taskId (no per-block timestamp) and the metadata link id
    // is identical to the one set at creation, regardless of tx/block. With the old
    // txHash-CID id the restored link differed, producing a duplicate insert.
    setupTaskManagerEntities();

    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let projectEvent = createProjectCreatedEvent(
      projectId,
      Bytes.fromHexString("0xabcd"),
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234"),
      BigInt.fromI32(1000)
    );
    handleProjectCreated(projectEvent);

    let taskId = BigInt.fromI32(0);
    let title = Bytes.fromHexString("0x4164646578656373"); // "Addexecs"
    let metadataHash = Bytes.fromHexString(
      "0x00000000000000000000000000000000000000000000000000000000deadbeef"
    );
    let bountyToken = Address.fromString("0x0000000000000000000000000000000000000001");

    // Create the task in tx 0xaa...
    let createEvent = createTaskCreatedEvent(
      taskId, projectId, BigInt.fromI32(100), bountyToken,
      BigInt.fromI32(0), false, title, metadataHash
    );
    createEvent.transaction.hash = Bytes.fromHexString(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    handleTaskCreated(createEvent);

    let entityId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0";
    let taskAfterCreate = Task.load(entityId);
    assert.assertTrue(taskAfterCreate != null);
    let linkAfterCreate = taskAfterCreate!.metadata;
    assert.assertTrue(linkAfterCreate != null);
    // Link is task-scoped (starts with the task entity id), never tx-scoped.
    assert.assertTrue(linkAfterCreate!.substring(0, (entityId + "-").length) == entityId + "-");

    // Reject in a DIFFERENT tx 0xbb... -> restores task.metadata to the original
    // description metadata (re-referencing the same CID at a later block).
    let rejector = Address.fromString("0x0000000000000000000000000000000000000003");
    let rejectionHash = Bytes.fromHexString(
      "0x00000000000000000000000000000000000000000000000000000000feedface"
    );
    let rejectEvent = createTaskRejectedEvent(taskId, rejector, rejectionHash);
    rejectEvent.transaction.hash = Bytes.fromHexString(
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    );
    rejectEvent.logIndex = BigInt.fromI32(1);
    handleTaskRejected(rejectEvent);

    // Restored link must be byte-identical to the creation link: stable across txs.
    // (Old txHash-CID id would differ here, since the two events have different hashes.)
    assert.fieldEquals("Task", entityId, "metadata", linkAfterCreate!);
  });

  test("Task assigned updates status", () => {
    // Setup Organization and TaskManager entities first
    setupTaskManagerEntities();

    // Create project and task
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let projectTitle = Bytes.fromHexString("0xabcd");
    let projectMetadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, projectTitle, projectMetadataHash, cap);
    handleProjectCreated(projectEvent);

    let taskId = BigInt.fromI32(1);
    let payout = BigInt.fromI32(100);
    let bountyToken = Address.fromString("0x0000000000000000000000000000000000000001");
    let bountyPayout = BigInt.fromI32(50);
    let title = Bytes.fromHexString("0x1234");

    let createEvent = createTaskCreatedEvent(
      taskId,
      projectId,
      payout,
      bountyToken,
      bountyPayout,
      false,
      title
    );
    handleTaskCreated(createEvent);

    // Assign the task
    let assignee = Address.fromString("0x0000000000000000000000000000000000000002");
    let assigner = Address.fromString("0x0000000000000000000000000000000000000003");
    let assignEvent = createTaskAssignedEvent(taskId, assignee, assigner);
    handleTaskAssigned(assignEvent);

    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1";
    assert.fieldEquals("Task", expectedId, "status", "Assigned");
    assert.fieldEquals(
      "Task",
      expectedId,
      "assignee",
      "0x0000000000000000000000000000000000000002"
    );
  });

  test("Task completed updates status", () => {
    // Setup Organization and TaskManager entities first
    setupTaskManagerEntities();

    // Create project and task
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let projectTitle = Bytes.fromHexString("0xabcd");
    let projectMetadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, projectTitle, projectMetadataHash, cap);
    handleProjectCreated(projectEvent);

    let taskId = BigInt.fromI32(1);
    let payout = BigInt.fromI32(100);
    let bountyToken = Address.fromString("0x0000000000000000000000000000000000000001");
    let bountyPayout = BigInt.fromI32(50);
    let title = Bytes.fromHexString("0x1234");

    let createEvent = createTaskCreatedEvent(
      taskId,
      projectId,
      payout,
      bountyToken,
      bountyPayout,
      false,
      title
    );
    handleTaskCreated(createEvent);

    // Complete the task
    let completer = Address.fromString("0x0000000000000000000000000000000000000002");
    let completeEvent = createTaskCompletedEvent(taskId, completer);
    handleTaskCompleted(completeEvent);

    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1";
    assert.fieldEquals("Task", expectedId, "status", "Completed");
  });

  test("Task rejected updates status and creates rejection record", () => {
    setupTaskManagerEntities();

    // Create project and task
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let projectTitle = Bytes.fromHexString("0xabcd");
    let projectMetadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, projectTitle, projectMetadataHash, cap);
    handleProjectCreated(projectEvent);

    let taskId = BigInt.fromI32(1);
    let payout = BigInt.fromI32(100);
    let bountyToken = Address.fromString("0x0000000000000000000000000000000000000001");
    let bountyPayout = BigInt.fromI32(50);
    let title = Bytes.fromHexString("0x1234");
    let taskMetadataHash = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");

    let createEvent = createTaskCreatedEvent(
      taskId,
      projectId,
      payout,
      bountyToken,
      bountyPayout,
      false,
      title,
      taskMetadataHash
    );
    handleTaskCreated(createEvent);

    // Assign the task first
    let assignee = Address.fromString("0x0000000000000000000000000000000000000002");
    let assigner = Address.fromString("0x0000000000000000000000000000000000000003");
    let assignEvent = createTaskAssignedEvent(taskId, assignee, assigner);
    handleTaskAssigned(assignEvent);

    // Submit the task (sets submissionHash, submittedAt, overwrites metadata)
    let submissionHash = Bytes.fromHexString(
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    );
    let submitEvent = createTaskSubmittedEvent(taskId, submissionHash);
    handleTaskSubmitted(submitEvent);

    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1";

    // Verify submission data is set before rejection
    assert.fieldEquals("Task", expectedId, "status", "Submitted");
    assert.fieldEquals(
      "Task",
      expectedId,
      "submissionHash",
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    );

    // Reject the task
    let rejector = Address.fromString("0x0000000000000000000000000000000000000003");
    let rejectionHash = Bytes.fromHexString(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );
    let rejectEvent = createTaskRejectedEvent(taskId, rejector, rejectionHash);
    rejectEvent.logIndex = BigInt.fromI32(3);
    handleTaskRejected(rejectEvent);

    assert.fieldEquals("Task", expectedId, "status", "Assigned");
    assert.fieldEquals("Task", expectedId, "rejectionCount", "1");
    assert.fieldEquals(
      "Task",
      expectedId,
      "rejectionHash",
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );
    // Stale submission data should be cleared after rejection
    assert.fieldEquals("Task", expectedId, "submissionHash", "null");
    assert.fieldEquals("Task", expectedId, "submittedAt", "null");
    assert.entityCount("TaskRejection", 1);
  });

  // ========================================
  // ProjectCapUpdated Tests
  // ========================================

  test("ProjectCapUpdated updates project cap and creates history", () => {
    setupTaskManagerEntities();

    // Create a project first
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let initialCap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, initialCap);
    handleProjectCreated(projectEvent);

    // Update the cap
    let oldCap = BigInt.fromI32(1000);
    let newCap = BigInt.fromI32(2000);
    let capUpdateEvent = createProjectCapUpdatedEvent(projectId, oldCap, newCap);
    handleProjectCapUpdated(capUpdateEvent);

    // Composite Project ID
    let expectedProjectId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    // Verify project cap was updated
    assert.fieldEquals(
      "Project",
      expectedProjectId,
      "cap",
      "2000"
    );

    // Verify history record was created
    assert.entityCount("ProjectCapChange", 1);
  });

  test("ProjectCapUpdated on non-existent project does not create history", () => {
    setupTaskManagerEntities();

    // Try to update cap on non-existent project
    let projectId = Bytes.fromHexString(
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    );
    let oldCap = BigInt.fromI32(1000);
    let newCap = BigInt.fromI32(2000);
    let capUpdateEvent = createProjectCapUpdatedEvent(projectId, oldCap, newCap);
    handleProjectCapUpdated(capUpdateEvent);

    // No history should be created
    assert.entityCount("ProjectCapChange", 0);
  });

  // ========================================
  // ProjectManagerUpdated Tests
  // ========================================

  test("ProjectManagerUpdated adds a new manager", () => {
    setupTaskManagerEntities();

    // Create a project first
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    // Add a manager
    let managerAddress = Address.fromString("0x0000000000000000000000000000000000000099");
    let addManagerEvent = createProjectManagerUpdatedEvent(projectId, managerAddress, true);
    handleProjectManagerUpdated(addManagerEvent);

    // Verify manager entity was created with composite ID
    assert.entityCount("ProjectManager", 1);
    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-0x0000000000000000000000000000000000000099";
    assert.fieldEquals("ProjectManager", expectedId, "isActive", "true");
    assert.fieldEquals(
      "ProjectManager",
      expectedId,
      "manager",
      "0x0000000000000000000000000000000000000099"
    );
  });

  test("ProjectManagerUpdated removes a manager", () => {
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    // Add a manager
    let managerAddress = Address.fromString("0x0000000000000000000000000000000000000099");
    let addManagerEvent = createProjectManagerUpdatedEvent(projectId, managerAddress, true);
    handleProjectManagerUpdated(addManagerEvent);

    // Remove the manager
    let removeManagerEvent = createProjectManagerUpdatedEvent(projectId, managerAddress, false);
    handleProjectManagerUpdated(removeManagerEvent);

    // Verify manager is now inactive (uses composite ID)
    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-0x0000000000000000000000000000000000000099";
    assert.fieldEquals("ProjectManager", expectedId, "isActive", "false");
  });

  // ========================================
  // ProjectRolePermSet Tests
  // ========================================

  test("ProjectRolePermSet creates permission with full permissions (mask=15)", () => {
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    // Set permissions with mask=15 (all permissions)
    let hatId = BigInt.fromI32(1001);
    let mask: i32 = 15; // 0b1111 = all permissions
    let permEvent = createProjectRolePermSetEvent(projectId, hatId, mask);
    handleProjectRolePermSet(permEvent);

    // Verify permission entity with composite ID
    assert.entityCount("ProjectRolePermission", 1);
    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-1001";
    assert.fieldEquals("ProjectRolePermission", expectedId, "mask", "15");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canCreate", "true");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canClaim", "true");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canReview", "true");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canAssign", "true");
    // mask=15 has bits 16 and 32 unset
    assert.fieldEquals("ProjectRolePermission", expectedId, "canSelfReview", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canBudget", "false");
  });

  test("ProjectRolePermSet creates permission with no permissions (mask=0)", () => {
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    // Set permissions with mask=0 (no permissions)
    let hatId = BigInt.fromI32(1002);
    let mask: i32 = 0;
    let permEvent = createProjectRolePermSetEvent(projectId, hatId, mask);
    handleProjectRolePermSet(permEvent);

    // Verify all permissions are false (using composite ID)
    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-1002";
    assert.fieldEquals("ProjectRolePermission", expectedId, "mask", "0");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canCreate", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canClaim", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canReview", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canAssign", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canSelfReview", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canBudget", "false");
  });

  test("ProjectRolePermSet decodes per-project BUDGET-only mask (32) — v4", () => {
    setupTaskManagerEntities();

    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    handleProjectCreated(createProjectCreatedEvent(
      projectId,
      Bytes.fromHexString("0xabcd"),
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234"),
      BigInt.fromI32(1000)
    ));

    // mask=32 = TaskPerm.BUDGET only — granted per-project (overrides any global mask).
    handleProjectRolePermSet(createProjectRolePermSetEvent(projectId, BigInt.fromI32(2001), 32));

    let id = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-2001";
    assert.fieldEquals("ProjectRolePermission", id, "mask", "32");
    assert.fieldEquals("ProjectRolePermission", id, "canCreate", "false");
    assert.fieldEquals("ProjectRolePermission", id, "canClaim", "false");
    assert.fieldEquals("ProjectRolePermission", id, "canReview", "false");
    assert.fieldEquals("ProjectRolePermission", id, "canAssign", "false");
    assert.fieldEquals("ProjectRolePermission", id, "canSelfReview", "false");
    assert.fieldEquals("ProjectRolePermission", id, "canBudget", "true");
  });

  test("ProjectRolePermSet decodes per-project SELF_REVIEW-only mask (16) — v4", () => {
    setupTaskManagerEntities();

    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    handleProjectCreated(createProjectCreatedEvent(
      projectId,
      Bytes.fromHexString("0xabcd"),
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234"),
      BigInt.fromI32(1000)
    ));

    handleProjectRolePermSet(createProjectRolePermSetEvent(projectId, BigInt.fromI32(2002), 16));

    let id = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-2002";
    assert.fieldEquals("ProjectRolePermission", id, "canSelfReview", "true");
    assert.fieldEquals("ProjectRolePermission", id, "canBudget", "false");
    assert.fieldEquals("ProjectRolePermission", id, "canCreate", "false");
  });

  test("ProjectRolePermSet decodes individual permission bits correctly", () => {
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    // Set permissions with mask=5 (canCreate=true, canReview=true)
    // 5 = 0b0101 = CREATE(1) + REVIEW(4)
    let hatId = BigInt.fromI32(1003);
    let mask: i32 = 5;
    let permEvent = createProjectRolePermSetEvent(projectId, hatId, mask);
    handleProjectRolePermSet(permEvent);

    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-1003";
    assert.fieldEquals("ProjectRolePermission", expectedId, "mask", "5");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canCreate", "true");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canClaim", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canReview", "true");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canAssign", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canSelfReview", "false");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canBudget", "false");
  });

  test("ProjectRolePermSet updates existing permission", () => {
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    let hatId = BigInt.fromI32(1004);

    // First set mask=1 (only create)
    let permEvent1 = createProjectRolePermSetEvent(projectId, hatId, 1);
    handleProjectRolePermSet(permEvent1);

    // Then update to mask=15 (all permissions)
    let permEvent2 = createProjectRolePermSetEvent(projectId, hatId, 15);
    handleProjectRolePermSet(permEvent2);

    // Should still have only 1 entity, but with updated values (using composite ID)
    assert.entityCount("ProjectRolePermission", 1);
    let expectedId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-1004";
    assert.fieldEquals("ProjectRolePermission", expectedId, "mask", "15");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canCreate", "true");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canClaim", "true");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canReview", "true");
    assert.fieldEquals("ProjectRolePermission", expectedId, "canAssign", "true");
  });

  // ========================================
  // BountyCapSet Tests
  // ========================================

  test("BountyCapSet creates bounty cap and history", () => {
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    // Set bounty cap
    let token = Address.fromString("0x0000000000000000000000000000000000000088");
    let oldCap = BigInt.fromI32(0);
    let newCap = BigInt.fromI32(5000);
    let bountyCapEvent = createBountyCapSetEvent(projectId, token, oldCap, newCap);
    handleBountyCapSet(bountyCapEvent);

    // Verify ProjectBountyCap entity with composite ID
    assert.entityCount("ProjectBountyCap", 1);
    let expectedCapId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-0x0000000000000000000000000000000000000088";
    assert.fieldEquals("ProjectBountyCap", expectedCapId, "cap", "5000");
    assert.fieldEquals(
      "ProjectBountyCap",
      expectedCapId,
      "token",
      "0x0000000000000000000000000000000000000088"
    );

    // Verify BountyCapChange history
    assert.entityCount("BountyCapChange", 1);
  });

  test("BountyCapSet creates separate entities for different tokens", () => {
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    // Set bounty cap for token 1
    let token1 = Address.fromString("0x0000000000000000000000000000000000000088");
    let bountyCapEvent1 = createBountyCapSetEvent(
      projectId,
      token1,
      BigInt.fromI32(0),
      BigInt.fromI32(5000)
    );
    handleBountyCapSet(bountyCapEvent1);

    // Set bounty cap for token 2
    let token2 = Address.fromString("0x0000000000000000000000000000000000000099");
    let bountyCapEvent2 = createBountyCapSetEvent(
      projectId,
      token2,
      BigInt.fromI32(0),
      BigInt.fromI32(10000)
    );
    handleBountyCapSet(bountyCapEvent2);

    // Should have 2 ProjectBountyCap entities
    assert.entityCount("ProjectBountyCap", 2);

    // Verify each cap with composite IDs
    let expectedCapId1 = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-0x0000000000000000000000000000000000000088";
    let expectedCapId2 = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-0x0000000000000000000000000000000000000099";
    assert.fieldEquals("ProjectBountyCap", expectedCapId1, "cap", "5000");
    assert.fieldEquals("ProjectBountyCap", expectedCapId2, "cap", "10000");
  });

  test("BountyCapSet updates existing cap and creates new history", () => {
    setupTaskManagerEntities();

    // Create a project
    let projectId = Bytes.fromHexString(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
    let title = Bytes.fromHexString("0xabcd");
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");
    let cap = BigInt.fromI32(1000);
    let projectEvent = createProjectCreatedEvent(projectId, title, metadataHash, cap);
    handleProjectCreated(projectEvent);

    let token = Address.fromString("0x0000000000000000000000000000000000000088");

    // Initial cap
    let bountyCapEvent1 = createBountyCapSetEvent(
      projectId,
      token,
      BigInt.fromI32(0),
      BigInt.fromI32(5000)
    );
    handleBountyCapSet(bountyCapEvent1);

    // Update cap - use different transaction hash to create separate history record
    let bountyCapEvent2 = createBountyCapSetEvent(
      projectId,
      token,
      BigInt.fromI32(5000),
      BigInt.fromI32(7500)
    );
    // Set different transaction hash for second event to ensure unique history ID
    bountyCapEvent2.transaction.hash = Bytes.fromHexString("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    handleBountyCapSet(bountyCapEvent2);

    // Should still have 1 ProjectBountyCap entity with updated value (using composite ID)
    assert.entityCount("ProjectBountyCap", 1);
    let expectedCapId = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-0x0000000000000000000000000000000000000088";
    assert.fieldEquals("ProjectBountyCap", expectedCapId, "cap", "7500");

    // Should have 2 history records (different tx hashes)
    assert.entityCount("BountyCapChange", 2);
  });

  // ========================================
  // Cross-Organization Isolation Tests
  // ========================================

  test("Projects with same ID from different TaskManagers are stored separately", () => {
    // Setup first organization with TaskManager 1
    let orgId1 = Bytes.fromHexString(
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );
    let taskManager1Address = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");

    let org1 = new Organization(orgId1);
    org1.topHatId = BigInt.fromI32(1000);
    org1.roleHatIds = [BigInt.fromI32(1001)];
    org1.deployedAt = BigInt.fromI32(1000);
    org1.deployedAtBlock = BigInt.fromI32(100);
    org1.transactionHash = Bytes.fromHexString("0xabcd");
    org1.save();

    let taskManager1 = new TaskManager(taskManager1Address);
    taskManager1.organization = orgId1;
    taskManager1.creatorHatIds = [BigInt.fromI32(1001)];
    taskManager1.organizerHatIds = [];
    taskManager1.createdAt = BigInt.fromI32(1000);
    taskManager1.createdAtBlock = BigInt.fromI32(100);
    taskManager1.transactionHash = Bytes.fromHexString("0xabcd");
    taskManager1.save();

    // Setup second organization with TaskManager 2 (DIFFERENT address)
    let orgId2 = Bytes.fromHexString(
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    );
    let taskManager2Address = Address.fromString("0xb27182f471e4948107dc771caf2d6c2f28fc3d3b");

    let org2 = new Organization(orgId2);
    org2.topHatId = BigInt.fromI32(2000);
    org2.roleHatIds = [BigInt.fromI32(2001)];
    org2.deployedAt = BigInt.fromI32(2000);
    org2.deployedAtBlock = BigInt.fromI32(200);
    org2.transactionHash = Bytes.fromHexString("0xdcba");
    org2.save();

    let taskManager2 = new TaskManager(taskManager2Address);
    taskManager2.organization = orgId2;
    taskManager2.creatorHatIds = [BigInt.fromI32(2001)];
    taskManager2.organizerHatIds = [];
    taskManager2.createdAt = BigInt.fromI32(2000);
    taskManager2.createdAtBlock = BigInt.fromI32(200);
    taskManager2.transactionHash = Bytes.fromHexString("0xdcba");
    taskManager2.save();

    // Use the SAME project ID for both organizations
    let sameProjectId = Bytes.fromHexString(
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");

    // Create project in Org 1
    let projectEvent1 = createProjectCreatedEvent(
      sameProjectId,
      Bytes.fromHexString("0x4f726731"), // "Org1"
      metadataHash,
      BigInt.fromI32(1000)
    );
    // Set event address to TaskManager 1
    projectEvent1.address = taskManager1Address;
    handleProjectCreated(projectEvent1);

    // Create project in Org 2 with SAME project ID
    let projectEvent2 = createProjectCreatedEvent(
      sameProjectId,
      Bytes.fromHexString("0x4f726732"), // "Org2"
      metadataHash,
      BigInt.fromI32(2000)
    );
    // Set event address to TaskManager 2
    projectEvent2.address = taskManager2Address;
    handleProjectCreated(projectEvent2);

    // CRITICAL: Should have 2 separate Project entities, NOT 1
    assert.entityCount("Project", 2);

    // Verify Org 1's project
    let expectedProjectId1 = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x0000000000000000000000000000000000000000000000000000000000000001";
    assert.fieldEquals("Project", expectedProjectId1, "cap", "1000");
    assert.fieldEquals("Project", expectedProjectId1, "taskManager", taskManager1Address.toHexString());

    // Verify Org 2's project (should NOT have been overwritten)
    let expectedProjectId2 = "0xb27182f471e4948107dc771caf2d6c2f28fc3d3b-0x0000000000000000000000000000000000000000000000000000000000000001";
    assert.fieldEquals("Project", expectedProjectId2, "cap", "2000");
    assert.fieldEquals("Project", expectedProjectId2, "taskManager", taskManager2Address.toHexString());
  });

  test("Tasks with same ID from different TaskManagers reference correct org-specific projects", () => {
    // Setup two organizations with different TaskManagers
    let orgId1 = Bytes.fromHexString(
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );
    let taskManager1Address = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");

    let org1 = new Organization(orgId1);
    org1.topHatId = BigInt.fromI32(1000);
    org1.roleHatIds = [BigInt.fromI32(1001)];
    org1.deployedAt = BigInt.fromI32(1000);
    org1.deployedAtBlock = BigInt.fromI32(100);
    org1.transactionHash = Bytes.fromHexString("0xabcd");
    org1.save();

    let taskManager1 = new TaskManager(taskManager1Address);
    taskManager1.organization = orgId1;
    taskManager1.creatorHatIds = [BigInt.fromI32(1001)];
    taskManager1.organizerHatIds = [];
    taskManager1.createdAt = BigInt.fromI32(1000);
    taskManager1.createdAtBlock = BigInt.fromI32(100);
    taskManager1.transactionHash = Bytes.fromHexString("0xabcd");
    taskManager1.save();

    let orgId2 = Bytes.fromHexString(
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    );
    let taskManager2Address = Address.fromString("0xb27182f471e4948107dc771caf2d6c2f28fc3d3b");

    let org2 = new Organization(orgId2);
    org2.topHatId = BigInt.fromI32(2000);
    org2.roleHatIds = [BigInt.fromI32(2001)];
    org2.deployedAt = BigInt.fromI32(2000);
    org2.deployedAtBlock = BigInt.fromI32(200);
    org2.transactionHash = Bytes.fromHexString("0xdcba");
    org2.save();

    let taskManager2 = new TaskManager(taskManager2Address);
    taskManager2.organization = orgId2;
    taskManager2.creatorHatIds = [BigInt.fromI32(2001)];
    taskManager2.organizerHatIds = [];
    taskManager2.createdAt = BigInt.fromI32(2000);
    taskManager2.createdAtBlock = BigInt.fromI32(200);
    taskManager2.transactionHash = Bytes.fromHexString("0xdcba");
    taskManager2.save();

    // Same project ID in both orgs
    let sameProjectId = Bytes.fromHexString(
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
    let metadataHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000001234");

    // Create projects
    let projectEvent1 = createProjectCreatedEvent(sameProjectId, Bytes.fromHexString("0x4f726731"), metadataHash, BigInt.fromI32(1000));
    projectEvent1.address = taskManager1Address;
    handleProjectCreated(projectEvent1);

    let projectEvent2 = createProjectCreatedEvent(sameProjectId, Bytes.fromHexString("0x4f726732"), metadataHash, BigInt.fromI32(2000));
    projectEvent2.address = taskManager2Address;
    handleProjectCreated(projectEvent2);

    // Create tasks with same task ID in both projects
    let sameTaskId = BigInt.fromI32(1);
    let bountyToken = Address.fromString("0x0000000000000000000000000000000000000001");

    let taskEvent1 = createTaskCreatedEvent(
      sameTaskId,
      sameProjectId,
      BigInt.fromI32(100), // Org 1 payout
      bountyToken,
      BigInt.fromI32(50),
      false,
      Bytes.fromHexString("0x5461736b31") // "Task1"
    );
    taskEvent1.address = taskManager1Address;
    handleTaskCreated(taskEvent1);

    let taskEvent2 = createTaskCreatedEvent(
      sameTaskId,
      sameProjectId,
      BigInt.fromI32(200), // Org 2 payout (different)
      bountyToken,
      BigInt.fromI32(100),
      true,
      Bytes.fromHexString("0x5461736b32") // "Task2"
    );
    taskEvent2.address = taskManager2Address;
    handleTaskCreated(taskEvent2);

    // Should have 2 separate Task entities
    assert.entityCount("Task", 2);

    // Verify Task 1 from Org 1 references Org 1's project
    let expectedTask1Id = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1";
    let expectedProject1Id = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-0x0000000000000000000000000000000000000000000000000000000000000001";
    assert.fieldEquals("Task", expectedTask1Id, "payout", "100");
    assert.fieldEquals("Task", expectedTask1Id, "project", expectedProject1Id);

    // Verify Task 1 from Org 2 references Org 2's project (NOT Org 1's project!)
    let expectedTask2Id = "0xb27182f471e4948107dc771caf2d6c2f28fc3d3b-1";
    let expectedProject2Id = "0xb27182f471e4948107dc771caf2d6c2f28fc3d3b-0x0000000000000000000000000000000000000000000000000000000000000001";
    assert.fieldEquals("Task", expectedTask2Id, "payout", "200");
    assert.fieldEquals("Task", expectedTask2Id, "project", expectedProject2Id);
  });

  // ========================================
  // FoldersUpdated Tests (TaskManager v4)
  // ========================================

  test("FoldersUpdated stores root on Organization and creates FolderRootChange", () => {
    setupTaskManagerEntities();

    let orgId = "0x1111111111111111111111111111111111111111111111111111111111111111";
    let newRoot = Bytes.fromHexString("0xaaaa000000000000000000000000000000000000000000000000000000000001");
    let oldRoot = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");
    let sender = Address.fromString("0x00000000000000000000000000000000000000ff");

    let event = createFoldersUpdatedEvent(newRoot, oldRoot, sender);
    handleFoldersUpdated(event);

    assert.fieldEquals("Organization", orgId, "foldersRoot", newRoot.toHexString());
    assert.fieldEquals("Organization", orgId, "foldersUpdatedBy", sender.toHexString());
    assert.entityCount("FolderRootChange", 1);
  });

  test("FoldersUpdated chains revisions via oldRoot", () => {
    setupTaskManagerEntities();

    let root1 = Bytes.fromHexString("0xaaaa000000000000000000000000000000000000000000000000000000000001");
    let root2 = Bytes.fromHexString("0xbbbb000000000000000000000000000000000000000000000000000000000002");
    let zero = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");
    let sender = Address.fromString("0x00000000000000000000000000000000000000ff");

    // Distinct logIndex so each FolderRootChange (immutable, ID=txHash-logIndex) is unique.
    let event1 = createFoldersUpdatedEvent(root1, zero, sender);
    event1.logIndex = BigInt.fromI32(1);
    handleFoldersUpdated(event1);
    let event2 = createFoldersUpdatedEvent(root2, root1, sender);
    event2.logIndex = BigInt.fromI32(2);
    handleFoldersUpdated(event2);

    let orgId = "0x1111111111111111111111111111111111111111111111111111111111111111";
    assert.fieldEquals("Organization", orgId, "foldersRoot", root2.toHexString());
    assert.entityCount("FolderRootChange", 2);
  });

  // ========================================
  // OrganizerHatAllowed Tests (TaskManager v4)
  // ========================================

  test("OrganizerHatAllowed adds hat to organizerHatIds when allowed=true", () => {
    setupTaskManagerEntities();

    let tmAddr = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a";
    let hatId = BigInt.fromI32(42);

    handleOrganizerHatAllowed(createOrganizerHatAllowedEvent(hatId, true));

    assert.fieldEquals("TaskManager", tmAddr, "organizerHatIds", "[42]");
  });

  test("OrganizerHatAllowed is idempotent on duplicate add", () => {
    setupTaskManagerEntities();

    let tmAddr = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a";
    let hatId = BigInt.fromI32(42);

    handleOrganizerHatAllowed(createOrganizerHatAllowedEvent(hatId, true));
    handleOrganizerHatAllowed(createOrganizerHatAllowedEvent(hatId, true));

    assert.fieldEquals("TaskManager", tmAddr, "organizerHatIds", "[42]");
  });

  test("OrganizerHatAllowed removes hat when allowed=false", () => {
    setupTaskManagerEntities();

    let tmAddr = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a";
    let hat1 = BigInt.fromI32(42);
    let hat2 = BigInt.fromI32(43);

    handleOrganizerHatAllowed(createOrganizerHatAllowedEvent(hat1, true));
    handleOrganizerHatAllowed(createOrganizerHatAllowedEvent(hat2, true));
    handleOrganizerHatAllowed(createOrganizerHatAllowedEvent(hat1, false));

    assert.fieldEquals("TaskManager", tmAddr, "organizerHatIds", "[43]");
  });

  test("OrganizerHatAllowed remove on absent hat is a no-op", () => {
    setupTaskManagerEntities();

    let tmAddr = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a";
    let hatId = BigInt.fromI32(42);

    handleOrganizerHatAllowed(createOrganizerHatAllowedEvent(hatId, false));

    assert.fieldEquals("TaskManager", tmAddr, "organizerHatIds", "[]");
  });

  // ========================================
  // RolePermSet (Global) Tests (TaskManager v4)
  // ========================================

  test("RolePermSet creates GlobalRolePermission with all 6 bits decoded", () => {
    setupTaskManagerEntities();

    let hatId = BigInt.fromI32(1001);
    let mask: i32 = 63; // 0b111111 = all bits

    handleRolePermSet(createRolePermSetEvent(hatId, mask));

    let id = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1001";
    assert.entityCount("GlobalRolePermission", 1);
    assert.fieldEquals("GlobalRolePermission", id, "mask", "63");
    assert.fieldEquals("GlobalRolePermission", id, "canCreate", "true");
    assert.fieldEquals("GlobalRolePermission", id, "canClaim", "true");
    assert.fieldEquals("GlobalRolePermission", id, "canReview", "true");
    assert.fieldEquals("GlobalRolePermission", id, "canAssign", "true");
    assert.fieldEquals("GlobalRolePermission", id, "canSelfReview", "true");
    assert.fieldEquals("GlobalRolePermission", id, "canBudget", "true");
  });

  test("RolePermSet decodes BUDGET-only mask (32)", () => {
    setupTaskManagerEntities();

    let hatId = BigInt.fromI32(1002);
    let mask: i32 = 32; // BUDGET only

    handleRolePermSet(createRolePermSetEvent(hatId, mask));

    let id = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1002";
    assert.fieldEquals("GlobalRolePermission", id, "canCreate", "false");
    assert.fieldEquals("GlobalRolePermission", id, "canClaim", "false");
    assert.fieldEquals("GlobalRolePermission", id, "canReview", "false");
    assert.fieldEquals("GlobalRolePermission", id, "canAssign", "false");
    assert.fieldEquals("GlobalRolePermission", id, "canSelfReview", "false");
    assert.fieldEquals("GlobalRolePermission", id, "canBudget", "true");
  });

  test("RolePermSet revoke (mask=0) is preserved verbatim, not deleted", () => {
    setupTaskManagerEntities();

    let hatId = BigInt.fromI32(1003);

    handleRolePermSet(createRolePermSetEvent(hatId, 32)); // grant BUDGET
    handleRolePermSet(createRolePermSetEvent(hatId, 0)); // revoke

    let id = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1003";
    assert.entityCount("GlobalRolePermission", 1); // not deleted
    assert.fieldEquals("GlobalRolePermission", id, "mask", "0");
    assert.fieldEquals("GlobalRolePermission", id, "canBudget", "false");
  });
});
