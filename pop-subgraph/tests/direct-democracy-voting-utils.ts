import { newMockEvent } from "matchstick-as/assembly/index";
import { ethereum, BigInt } from "@graphprotocol/graph-ts";
import {
  Initialized,
  CreatorHatSet,
  HatSet
} from "../generated/templates/DirectDemocracyVoting/DirectDemocracyVoting";

export function createInitializedEvent(version: BigInt): Initialized {
  let event = changetype<Initialized>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("version", ethereum.Value.fromUnsignedBigInt(version))
  );

  return event;
}

export function createCreatorHatSetEvent(hat: BigInt, allowed: boolean): CreatorHatSet {
  let event = changetype<CreatorHatSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hat", ethereum.Value.fromUnsignedBigInt(hat))
  );
  event.parameters.push(
    new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed))
  );

  return event;
}

/**
 * HatSet(uint8 hatType, uint256 hat, bool allowed).
 * DirectDemocracyVoting declares `enum HatType { VOTING, CREATOR }`, so hatType 0 = VOTING and
 * 1 = CREATOR.
 */
export function createHatSetEvent(hatType: i32, hat: BigInt, allowed: boolean): HatSet {
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
