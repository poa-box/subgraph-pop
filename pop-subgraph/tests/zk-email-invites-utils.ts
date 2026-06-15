import { newMockEvent, createMockedFunction } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  DomainRuleSet,
  DomainRuleRemoved,
  RoleClaimedByDomain
} from "../generated/templates/ZkEmailInvites/ZkEmailInvites";

// Mock the five view getters wireZkEmailInvites reads at registration to seed the module's config.
export function mockZkGetters(
  proxy: Address,
  verifier: Address,
  dkim: Address,
  accountRegistry: Address,
  factory: Address,
  executor: Address
): void {
  createMockedFunction(proxy, "verifier", "verifier():(address)").returns([ethereum.Value.fromAddress(verifier)]);
  createMockedFunction(proxy, "dkimRegistry", "dkimRegistry():(address)").returns([
    ethereum.Value.fromAddress(dkim)
  ]);
  createMockedFunction(proxy, "accountRegistry", "accountRegistry():(address)").returns([
    ethereum.Value.fromAddress(accountRegistry)
  ]);
  createMockedFunction(proxy, "universalFactory", "universalFactory():(address)").returns([
    ethereum.Value.fromAddress(factory)
  ]);
  createMockedFunction(proxy, "executor", "executor():(address)").returns([ethereum.Value.fromAddress(executor)]);
}

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
