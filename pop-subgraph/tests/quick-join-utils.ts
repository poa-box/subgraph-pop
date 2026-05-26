import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  MemberHatIdsUpdated,
  RegisterAndQuickJoined,
  RegisterAndQuickJoinedWithPasskey,
  RegisterAndQuickJoinedWithPasskeyByMaster
} from "../generated/templates/QuickJoin/QuickJoin";

export function createMemberHatIdsUpdatedEvent(
  hatIds: BigInt[]
): MemberHatIdsUpdated {
  let event = changetype<MemberHatIdsUpdated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds))
  );

  return event;
}

export function createRegisterAndQuickJoinedEvent(
  user: Address,
  username: string,
  hatIds: BigInt[]
): RegisterAndQuickJoined {
  let event = changetype<RegisterAndQuickJoined>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  );
  event.parameters.push(
    new ethereum.EventParam("username", ethereum.Value.fromString(username))
  );
  event.parameters.push(
    new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds))
  );

  return event;
}

export function createRegisterAndQuickJoinedWithPasskeyEvent(
  account: Address,
  credentialId: Bytes,
  username: string,
  hatIds: BigInt[]
): RegisterAndQuickJoinedWithPasskey {
  let event = changetype<RegisterAndQuickJoinedWithPasskey>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  );
  event.parameters.push(
    new ethereum.EventParam("credentialId", ethereum.Value.fromFixedBytes(credentialId))
  );
  event.parameters.push(
    new ethereum.EventParam("username", ethereum.Value.fromString(username))
  );
  event.parameters.push(
    new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds))
  );

  return event;
}

export function createRegisterAndQuickJoinedWithPasskeyByMasterEvent(
  master: Address,
  account: Address,
  credentialId: Bytes,
  username: string,
  hatIds: BigInt[]
): RegisterAndQuickJoinedWithPasskeyByMaster {
  let event = changetype<RegisterAndQuickJoinedWithPasskeyByMaster>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("master", ethereum.Value.fromAddress(master))
  );
  event.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  );
  event.parameters.push(
    new ethereum.EventParam("credentialId", ethereum.Value.fromFixedBytes(credentialId))
  );
  event.parameters.push(
    new ethereum.EventParam("username", ethereum.Value.fromString(username))
  );
  event.parameters.push(
    new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds))
  );

  return event;
}
