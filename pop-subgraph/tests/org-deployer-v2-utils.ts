import { newMockEvent } from "matchstick-as";
import { ethereum, Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  OrgDeployed,
  GroupsCreated
} from "../generated/templates/OrgDeployerV2/OrgDeployerV2";

export function createOrgDeployedV2Event(
  orgId: Bytes,
  executor: Address,
  hybridVoting: Address,
  directDemocracyVoting: Address,
  quickJoin: Address,
  participationToken: Address,
  taskManager: Address,
  educationHub: Address,
  paymentManager: Address,
  membershipAuthority: Address,
  adminSubjectId: BigInt,
  roleSubjectIds: BigInt[]
): OrgDeployed {
  let event = changetype<OrgDeployed>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(new ethereum.EventParam("executor", ethereum.Value.fromAddress(executor)));
  event.parameters.push(new ethereum.EventParam("hybridVoting", ethereum.Value.fromAddress(hybridVoting)));
  event.parameters.push(
    new ethereum.EventParam("directDemocracyVoting", ethereum.Value.fromAddress(directDemocracyVoting))
  );
  event.parameters.push(new ethereum.EventParam("quickJoin", ethereum.Value.fromAddress(quickJoin)));
  event.parameters.push(
    new ethereum.EventParam("participationToken", ethereum.Value.fromAddress(participationToken))
  );
  event.parameters.push(new ethereum.EventParam("taskManager", ethereum.Value.fromAddress(taskManager)));
  event.parameters.push(new ethereum.EventParam("educationHub", ethereum.Value.fromAddress(educationHub)));
  event.parameters.push(new ethereum.EventParam("paymentManager", ethereum.Value.fromAddress(paymentManager)));
  event.parameters.push(
    new ethereum.EventParam("membershipAuthority", ethereum.Value.fromAddress(membershipAuthority))
  );
  event.parameters.push(
    new ethereum.EventParam("adminSubjectId", ethereum.Value.fromUnsignedBigInt(adminSubjectId))
  );
  event.parameters.push(
    new ethereum.EventParam("roleSubjectIds", ethereum.Value.fromUnsignedBigIntArray(roleSubjectIds))
  );
  return event;
}

export function createGroupsCreatedV2Event(
  orgId: Bytes,
  subjectIds: BigInt[],
  names: string[],
  memberSubjectIds: BigInt[][]
): GroupsCreated {
  let event = changetype<GroupsCreated>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(
    new ethereum.EventParam("subjectIds", ethereum.Value.fromUnsignedBigIntArray(subjectIds))
  );
  event.parameters.push(new ethereum.EventParam("names", ethereum.Value.fromStringArray(names)));

  let nested = new Array<ethereum.Value>();
  for (let i = 0; i < memberSubjectIds.length; i++) {
    nested.push(ethereum.Value.fromUnsignedBigIntArray(memberSubjectIds[i]));
  }
  event.parameters.push(
    new ethereum.EventParam("memberSubjectIds", ethereum.Value.fromArray(nested))
  );
  return event;
}
