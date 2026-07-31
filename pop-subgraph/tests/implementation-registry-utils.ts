import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes, crypto, ByteArray } from "@graphprotocol/graph-ts";
import {
  ImplementationRegistered,
  OwnershipTransferred
} from "../generated/ImplementationRegistry/ImplementationRegistry";

/**
 * The registry derives both ids as `keccak256(bytes(s))` (ImplementationRegistry._id), so the
 * fixtures derive them the same way rather than hard-coding opaque hashes. A test that invented
 * its own typeId/versionId would still pass while proving nothing about the real key space.
 */
export function idOf(s: string): Bytes {
  return Bytes.fromByteArray(crypto.keccak256(ByteArray.fromUTF8(s)));
}

export function createImplementationRegisteredEvent(
  registry: Address,
  typeName: string,
  version: string,
  implementation: Address,
  latest: boolean,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt
): ImplementationRegistered {
  let event = changetype<ImplementationRegistered>(newMockEvent());
  event.address = registry;
  event.logIndex = logIndex;
  event.block.timestamp = timestamp;
  event.block.number = blockNumber;

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("typeId", ethereum.Value.fromFixedBytes(idOf(typeName)))
  );
  event.parameters.push(
    new ethereum.EventParam("typeName", ethereum.Value.fromString(typeName))
  );
  event.parameters.push(
    new ethereum.EventParam("versionId", ethereum.Value.fromFixedBytes(idOf(version)))
  );
  event.parameters.push(
    new ethereum.EventParam("version", ethereum.Value.fromString(version))
  );
  event.parameters.push(
    new ethereum.EventParam("implementation", ethereum.Value.fromAddress(implementation))
  );
  event.parameters.push(new ethereum.EventParam("latest", ethereum.Value.fromBoolean(latest)));

  return event;
}

export function createRegistryOwnershipTransferredEvent(
  registry: Address,
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let event = changetype<OwnershipTransferred>(newMockEvent());
  event.address = registry;

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("previousOwner", ethereum.Value.fromAddress(previousOwner))
  );
  event.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  );

  return event;
}
