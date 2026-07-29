import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  KeyHashSet,
  KeyHashRevoked,
  OwnershipTransferred
} from "../generated/PoaDKIMRegistry/PoaDKIMRegistry";

export function createKeyHashSetEvent(
  registry: Address,
  domainHash: Bytes,
  keyHash: Bytes,
  valid: boolean,
  validUntil: BigInt
): KeyHashSet {
  let event = changetype<KeyHashSet>(newMockEvent());
  event.address = registry;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("domainHash", ethereum.Value.fromFixedBytes(domainHash)));
  event.parameters.push(new ethereum.EventParam("keyHash", ethereum.Value.fromFixedBytes(keyHash)));
  event.parameters.push(new ethereum.EventParam("valid", ethereum.Value.fromBoolean(valid)));
  event.parameters.push(new ethereum.EventParam("validUntil", ethereum.Value.fromUnsignedBigInt(validUntil)));

  return event;
}

export function createKeyHashRevokedEvent(
  registry: Address,
  domainHash: Bytes,
  keyHash: Bytes
): KeyHashRevoked {
  let event = changetype<KeyHashRevoked>(newMockEvent());
  event.address = registry;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("domainHash", ethereum.Value.fromFixedBytes(domainHash)));
  event.parameters.push(new ethereum.EventParam("keyHash", ethereum.Value.fromFixedBytes(keyHash)));

  return event;
}

export function createDkimOwnershipTransferredEvent(
  registry: Address,
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let event = changetype<OwnershipTransferred>(newMockEvent());
  event.address = registry;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("previousOwner", ethereum.Value.fromAddress(previousOwner)));
  event.parameters.push(new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner)));

  return event;
}
