import { newMockEvent } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  DomainRuleSet,
  DomainRuleRemoved,
  RoleClaimedByDomain
} from "../generated/templates/ZkEmailInvites/ZkEmailInvites";

export function createDomainRuleSetEvent(
  module: Address,
  domainHash: Bytes,
  hatIds: BigInt[],
  expiry: BigInt
): DomainRuleSet {
  let event = changetype<DomainRuleSet>(newMockEvent());
  event.address = module;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("domainHash", ethereum.Value.fromFixedBytes(domainHash)));
  event.parameters.push(new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds)));
  event.parameters.push(new ethereum.EventParam("expiry", ethereum.Value.fromUnsignedBigInt(expiry)));
  return event;
}

export function createDomainRuleRemovedEvent(module: Address, domainHash: Bytes): DomainRuleRemoved {
  let event = changetype<DomainRuleRemoved>(newMockEvent());
  event.address = module;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("domainHash", ethereum.Value.fromFixedBytes(domainHash)));
  return event;
}

export function createRoleClaimedByDomainEvent(
  module: Address,
  claimer: Address,
  domainHash: Bytes,
  hatIds: BigInt[],
  nullifier: Bytes
): RoleClaimedByDomain {
  let event = changetype<RoleClaimedByDomain>(newMockEvent());
  event.address = module;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("claimer", ethereum.Value.fromAddress(claimer)));
  event.parameters.push(new ethereum.EventParam("domainHash", ethereum.Value.fromFixedBytes(domainHash)));
  event.parameters.push(new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds)));
  event.parameters.push(new ethereum.EventParam("nullifier", ethereum.Value.fromFixedBytes(nullifier)));
  return event;
}
