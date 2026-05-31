import { newMockEvent } from "matchstick-as";
import { ethereum, Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  ProjectCreated,
  ProjectDeleted,
  ProjectCapUpdated,
  ProjectManagerUpdated,
  ProjectRolePermSet,
  BountyCapSet,
  TaskCreated,
  TaskAssigned,
  TaskSubmitted,
  TaskCompleted,
  TaskRejected,
  FoldersUpdated,
  OrganizerHatAllowed,
  RolePermSet,
  HatSet
} from "../generated/templates/TaskManager/TaskManager";

export function createProjectCreatedEvent(
  id: Bytes,
  title: Bytes,
  metadataHash: Bytes,
  cap: BigInt
): ProjectCreated {
  let event = changetype<ProjectCreated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  );
  event.parameters.push(
    new ethereum.EventParam("title", ethereum.Value.fromBytes(title))
  );
  event.parameters.push(
    new ethereum.EventParam("metadataHash", ethereum.Value.fromFixedBytes(metadataHash))
  );
  event.parameters.push(
    new ethereum.EventParam("cap", ethereum.Value.fromUnsignedBigInt(cap))
  );

  return event;
}

export function createTaskCreatedEvent(
  id: BigInt,
  project: Bytes,
  payout: BigInt,
  bountyToken: Address,
  bountyPayout: BigInt,
  requiresApplication: boolean,
  title: Bytes,
  metadataHash: Bytes = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")
): TaskCreated {
  let event = changetype<TaskCreated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("project", ethereum.Value.fromFixedBytes(project))
  );
  event.parameters.push(
    new ethereum.EventParam("payout", ethereum.Value.fromUnsignedBigInt(payout))
  );
  event.parameters.push(
    new ethereum.EventParam("bountyToken", ethereum.Value.fromAddress(bountyToken))
  );
  event.parameters.push(
    new ethereum.EventParam("bountyPayout", ethereum.Value.fromUnsignedBigInt(bountyPayout))
  );
  event.parameters.push(
    new ethereum.EventParam("requiresApplication", ethereum.Value.fromBoolean(requiresApplication))
  );
  event.parameters.push(
    new ethereum.EventParam("title", ethereum.Value.fromBytes(title))
  );
  event.parameters.push(
    new ethereum.EventParam("metadataHash", ethereum.Value.fromFixedBytes(metadataHash))
  );

  return event;
}

export function createTaskAssignedEvent(
  id: BigInt,
  assignee: Address,
  assigner: Address
): TaskAssigned {
  let event = changetype<TaskAssigned>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("assignee", ethereum.Value.fromAddress(assignee))
  );
  event.parameters.push(
    new ethereum.EventParam("assigner", ethereum.Value.fromAddress(assigner))
  );

  return event;
}

export function createTaskCompletedEvent(
  id: BigInt,
  completer: Address
): TaskCompleted {
  let event = changetype<TaskCompleted>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("completer", ethereum.Value.fromAddress(completer))
  );

  return event;
}

export function createProjectCapUpdatedEvent(
  id: Bytes,
  oldCap: BigInt,
  newCap: BigInt
): ProjectCapUpdated {
  let event = changetype<ProjectCapUpdated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  );
  event.parameters.push(
    new ethereum.EventParam("oldCap", ethereum.Value.fromUnsignedBigInt(oldCap))
  );
  event.parameters.push(
    new ethereum.EventParam("newCap", ethereum.Value.fromUnsignedBigInt(newCap))
  );

  return event;
}

export function createProjectManagerUpdatedEvent(
  id: Bytes,
  manager: Address,
  isManager: boolean
): ProjectManagerUpdated {
  let event = changetype<ProjectManagerUpdated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  );
  event.parameters.push(
    new ethereum.EventParam("manager", ethereum.Value.fromAddress(manager))
  );
  event.parameters.push(
    new ethereum.EventParam("isManager", ethereum.Value.fromBoolean(isManager))
  );

  return event;
}

export function createProjectRolePermSetEvent(
  id: Bytes,
  hatId: BigInt,
  mask: i32
): ProjectRolePermSet {
  let event = changetype<ProjectRolePermSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  );
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("mask", ethereum.Value.fromI32(mask))
  );

  return event;
}

export function createTaskSubmittedEvent(
  id: BigInt,
  submissionHash: Bytes
): TaskSubmitted {
  let event = changetype<TaskSubmitted>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("submissionHash", ethereum.Value.fromFixedBytes(submissionHash))
  );

  return event;
}

export function createTaskRejectedEvent(
  id: BigInt,
  rejector: Address,
  rejectionHash: Bytes
): TaskRejected {
  let event = changetype<TaskRejected>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("rejector", ethereum.Value.fromAddress(rejector))
  );
  event.parameters.push(
    new ethereum.EventParam("rejectionHash", ethereum.Value.fromFixedBytes(rejectionHash))
  );

  return event;
}

export function createBountyCapSetEvent(
  projectId: Bytes,
  token: Address,
  oldCap: BigInt,
  newCap: BigInt
): BountyCapSet {
  let event = changetype<BountyCapSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("projectId", ethereum.Value.fromFixedBytes(projectId))
  );
  event.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  );
  event.parameters.push(
    new ethereum.EventParam("oldCap", ethereum.Value.fromUnsignedBigInt(oldCap))
  );
  event.parameters.push(
    new ethereum.EventParam("newCap", ethereum.Value.fromUnsignedBigInt(newCap))
  );

  return event;
}

export function createFoldersUpdatedEvent(
  newRoot: Bytes,
  oldRoot: Bytes,
  sender: Address
): FoldersUpdated {
  let event = changetype<FoldersUpdated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("newRoot", ethereum.Value.fromFixedBytes(newRoot))
  );
  event.parameters.push(
    new ethereum.EventParam("oldRoot", ethereum.Value.fromFixedBytes(oldRoot))
  );
  event.parameters.push(
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender))
  );

  return event;
}

export function createOrganizerHatAllowedEvent(
  hatId: BigInt,
  allowed: boolean
): OrganizerHatAllowed {
  let event = changetype<OrganizerHatAllowed>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed))
  );

  return event;
}

export function createRolePermSetEvent(
  hatId: BigInt,
  mask: i32
): RolePermSet {
  let event = changetype<RolePermSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("mask", ethereum.Value.fromI32(mask))
  );

  return event;
}

export function createHatSetEvent(
  hatType: i32,
  hat: BigInt,
  allowed: boolean
): HatSet {
  let event = changetype<HatSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatType", ethereum.Value.fromI32(hatType))
  );
  event.parameters.push(
    new ethereum.EventParam("hat", ethereum.Value.fromUnsignedBigInt(hat))
  );
  event.parameters.push(
    new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed))
  );

  return event;
}
