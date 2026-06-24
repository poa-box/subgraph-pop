import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  ActiveAllowlistSet,
  RoleClaimedByDomain,
  RoleClaimedByEmail
} from "../generated/templates/ZkEmailInvites/ZkEmailInvites";

export function createActiveAllowlistSetEvent(
  module: Address,
  merkleRoot: Bytes,
  allowlistCid: Bytes
): ActiveAllowlistSet {
  let event = changetype<ActiveAllowlistSet>(newMockEvent());
  event.address = module;

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("merkleRoot", ethereum.Value.fromFixedBytes(merkleRoot))
  );
  event.parameters.push(
    new ethereum.EventParam("allowlistCid", ethereum.Value.fromFixedBytes(allowlistCid))
  );

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
  event.parameters.push(
    new ethereum.EventParam("claimer", ethereum.Value.fromAddress(claimer))
  );
  event.parameters.push(
    new ethereum.EventParam("domainHash", ethereum.Value.fromFixedBytes(domainHash))
  );
  event.parameters.push(
    new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds))
  );
  event.parameters.push(
    new ethereum.EventParam("nullifier", ethereum.Value.fromFixedBytes(nullifier))
  );

  return event;
}

export function createRoleClaimedByEmailEvent(
  module: Address,
  claimer: Address,
  emailHash: Bytes,
  hatIds: BigInt[],
  nullifier: Bytes
): RoleClaimedByEmail {
  let event = changetype<RoleClaimedByEmail>(newMockEvent());
  event.address = module;

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("claimer", ethereum.Value.fromAddress(claimer))
  );
  event.parameters.push(
    new ethereum.EventParam("emailHash", ethereum.Value.fromFixedBytes(emailHash))
  );
  event.parameters.push(
    new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds))
  );
  event.parameters.push(
    new ethereum.EventParam("nullifier", ethereum.Value.fromFixedBytes(nullifier))
  );

  return event;
}
