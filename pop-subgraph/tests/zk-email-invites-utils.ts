import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  ActiveAllowlistSet,
  RoleClaimedByDomain,
  RoleClaimedByEmail,
  RegisteredAndClaimedByDomain,
  RegisteredAndClaimedByEmail,
  RegisteredEmailCleared,
  DKIMRegistryUpdated,
  DomainVerifierUpdated
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

export function createRegisteredAndClaimedByDomainEvent(
  module: Address,
  account: Address,
  credentialId: Bytes,
  username: string,
  domainHash: Bytes,
  hatIds: BigInt[]
): RegisteredAndClaimedByDomain {
  let event = changetype<RegisteredAndClaimedByDomain>(newMockEvent());
  event.address = module;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("account", ethereum.Value.fromAddress(account)));
  event.parameters.push(new ethereum.EventParam("credentialId", ethereum.Value.fromFixedBytes(credentialId)));
  event.parameters.push(new ethereum.EventParam("username", ethereum.Value.fromString(username)));
  event.parameters.push(new ethereum.EventParam("domainHash", ethereum.Value.fromFixedBytes(domainHash)));
  event.parameters.push(new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds)));

  return event;
}

export function createRegisteredAndClaimedByEmailEvent(
  module: Address,
  account: Address,
  credentialId: Bytes,
  username: string,
  emailHash: Bytes,
  hatIds: BigInt[]
): RegisteredAndClaimedByEmail {
  let event = changetype<RegisteredAndClaimedByEmail>(newMockEvent());
  event.address = module;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("account", ethereum.Value.fromAddress(account)));
  event.parameters.push(new ethereum.EventParam("credentialId", ethereum.Value.fromFixedBytes(credentialId)));
  event.parameters.push(new ethereum.EventParam("username", ethereum.Value.fromString(username)));
  event.parameters.push(new ethereum.EventParam("emailHash", ethereum.Value.fromFixedBytes(emailHash)));
  event.parameters.push(new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds)));

  return event;
}

export function createRegisteredEmailClearedEvent(module: Address, emailHash: Bytes): RegisteredEmailCleared {
  let event = changetype<RegisteredEmailCleared>(newMockEvent());
  event.address = module;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("emailHash", ethereum.Value.fromFixedBytes(emailHash)));

  return event;
}

export function createDKIMRegistryUpdatedEvent(module: Address, registry: Address): DKIMRegistryUpdated {
  let event = changetype<DKIMRegistryUpdated>(newMockEvent());
  event.address = module;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("registry", ethereum.Value.fromAddress(registry)));

  return event;
}

export function createDomainVerifierUpdatedEvent(module: Address, verifier: Address): DomainVerifierUpdated {
  let event = changetype<DomainVerifierUpdated>(newMockEvent());
  event.address = module;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("verifier", ethereum.Value.fromAddress(verifier)));

  return event;
}
