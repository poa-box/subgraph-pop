// Mock-event factory for the canonical Hats Protocol dataSource. Used by the Access-v2 ceremony
// test to prove entity-id CONTINUITY: a RoleWearer written by the legacy Hats source is the same
// row the authority's own TransferSingle mirror later updates.

import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts";
import { TransferSingle, HatStatusChanged } from "../generated/Hats/Hats";

let nextLogIndex: i32 = 1;

export function createTransferSingleEvent(
  hats: Address,
  operator: Address,
  from: Address,
  to: Address,
  id: BigInt,
  value: BigInt
): TransferSingle {
  let event = changetype<TransferSingle>(newMockEvent());
  event.address = hats;
  event.logIndex = BigInt.fromI32(nextLogIndex);
  nextLogIndex = nextLogIndex + 1;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator)));
  event.parameters.push(new ethereum.EventParam("from", ethereum.Value.fromAddress(from)));
  event.parameters.push(new ethereum.EventParam("to", ethereum.Value.fromAddress(to)));
  event.parameters.push(new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id)));
  event.parameters.push(new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(value)));
  return event;
}

export function createHatStatusChangedEvent(
  hats: Address,
  hatId: BigInt,
  newStatus: boolean
): HatStatusChanged {
  let event = changetype<HatStatusChanged>(newMockEvent());
  event.address = hats;
  event.logIndex = BigInt.fromI32(nextLogIndex);
  nextLogIndex = nextLogIndex + 1;
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId)));
  event.parameters.push(new ethereum.EventParam("newStatus", ethereum.Value.fromBoolean(newStatus)));
  return event;
}
