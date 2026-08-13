import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  RoleManagerInitialized,
  ModulesWired,
  RoleCreated,
  GroupCreated,
  RoleGroupMembershipChanged,
  RoleWiringApplied,
  RoleOffered,
  RoleGranted,
  RoleRevoked,
  BudgetSkipped
} from "../generated/templates/RoleManager/RoleManager";

export function createRoleManagerInitializedEvent(
  roleManager: Address,
  executor: Address,
  orgId: Bytes,
  eligibilityModule: Address
): RoleManagerInitialized {
  let event = changetype<RoleManagerInitialized>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("executor", ethereum.Value.fromAddress(executor)));
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(new ethereum.EventParam("eligibilityModule", ethereum.Value.fromAddress(eligibilityModule)));
  return event;
}

export function createModulesWiredEvent(
  roleManager: Address,
  ddVoting: Address,
  hybridVoting: Address,
  taskManager: Address,
  participationToken: Address,
  educationHub: Address,
  quickJoin: Address,
  paymasterHub: Address,
  hats: Address
): ModulesWired {
  let event = changetype<ModulesWired>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("ddVoting", ethereum.Value.fromAddress(ddVoting)));
  event.parameters.push(new ethereum.EventParam("hybridVoting", ethereum.Value.fromAddress(hybridVoting)));
  event.parameters.push(new ethereum.EventParam("taskManager", ethereum.Value.fromAddress(taskManager)));
  event.parameters.push(new ethereum.EventParam("participationToken", ethereum.Value.fromAddress(participationToken)));
  event.parameters.push(new ethereum.EventParam("educationHub", ethereum.Value.fromAddress(educationHub)));
  event.parameters.push(new ethereum.EventParam("quickJoin", ethereum.Value.fromAddress(quickJoin)));
  event.parameters.push(new ethereum.EventParam("paymasterHub", ethereum.Value.fromAddress(paymasterHub)));
  event.parameters.push(new ethereum.EventParam("hats", ethereum.Value.fromAddress(hats)));
  return event;
}

export function createRoleCreatedEvent(
  roleManager: Address,
  roleId: BigInt,
  hatId: BigInt,
  name: string,
  metadataCID: Bytes,
  isExisting: boolean
): RoleCreated {
  let event = changetype<RoleCreated>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("roleId", ethereum.Value.fromUnsignedBigInt(roleId)));
  event.parameters.push(new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId)));
  event.parameters.push(new ethereum.EventParam("name", ethereum.Value.fromString(name)));
  event.parameters.push(new ethereum.EventParam("metadataCID", ethereum.Value.fromFixedBytes(metadataCID)));
  event.parameters.push(new ethereum.EventParam("isExisting", ethereum.Value.fromBoolean(isExisting)));
  return event;
}

export function createGroupCreatedEvent(
  roleManager: Address,
  groupId: BigInt,
  markerHatId: BigInt,
  name: string,
  metadataCID: Bytes
): GroupCreated {
  let event = changetype<GroupCreated>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("groupId", ethereum.Value.fromUnsignedBigInt(groupId)));
  event.parameters.push(new ethereum.EventParam("markerHatId", ethereum.Value.fromUnsignedBigInt(markerHatId)));
  event.parameters.push(new ethereum.EventParam("name", ethereum.Value.fromString(name)));
  event.parameters.push(new ethereum.EventParam("metadataCID", ethereum.Value.fromFixedBytes(metadataCID)));
  return event;
}

export function createRoleGroupMembershipChangedEvent(
  roleManager: Address,
  roleId: BigInt,
  groupId: BigInt,
  added: boolean
): RoleGroupMembershipChanged {
  let event = changetype<RoleGroupMembershipChanged>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("roleId", ethereum.Value.fromUnsignedBigInt(roleId)));
  event.parameters.push(new ethereum.EventParam("groupId", ethereum.Value.fromUnsignedBigInt(groupId)));
  event.parameters.push(new ethereum.EventParam("added", ethereum.Value.fromBoolean(added)));
  return event;
}

export function createRoleWiringAppliedEvent(
  roleManager: Address,
  id: BigInt,
  hatId: BigInt,
  isGroup: boolean
): RoleWiringApplied {
  let event = changetype<RoleWiringApplied>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id)));
  event.parameters.push(new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId)));
  event.parameters.push(new ethereum.EventParam("isGroup", ethereum.Value.fromBoolean(isGroup)));
  return event;
}

export function createRoleOfferedEvent(
  roleManager: Address,
  roleId: BigInt,
  user: Address,
  hatId: BigInt
): RoleOffered {
  let event = changetype<RoleOffered>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("roleId", ethereum.Value.fromUnsignedBigInt(roleId)));
  event.parameters.push(new ethereum.EventParam("user", ethereum.Value.fromAddress(user)));
  event.parameters.push(new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId)));
  return event;
}

export function createRoleGrantedEvent(
  roleManager: Address,
  roleId: BigInt,
  user: Address,
  minted: boolean
): RoleGranted {
  let event = changetype<RoleGranted>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("roleId", ethereum.Value.fromUnsignedBigInt(roleId)));
  event.parameters.push(new ethereum.EventParam("user", ethereum.Value.fromAddress(user)));
  event.parameters.push(new ethereum.EventParam("minted", ethereum.Value.fromBoolean(minted)));
  return event;
}

export function createRoleRevokedEvent(
  roleManager: Address,
  roleId: BigInt,
  user: Address,
  wasWearing: boolean
): RoleRevoked {
  let event = changetype<RoleRevoked>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("roleId", ethereum.Value.fromUnsignedBigInt(roleId)));
  event.parameters.push(new ethereum.EventParam("user", ethereum.Value.fromAddress(user)));
  event.parameters.push(new ethereum.EventParam("wasWearing", ethereum.Value.fromBoolean(wasWearing)));
  return event;
}

export function createBudgetSkippedEvent(roleManager: Address, hatId: BigInt): BudgetSkipped {
  let event = changetype<BudgetSkipped>(newMockEvent());
  event.address = roleManager;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId)));
  return event;
}
