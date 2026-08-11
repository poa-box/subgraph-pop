import { newMockEvent } from "matchstick-as";
import { ethereum, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  BeaconCreated,
  BeaconUpgraded,
  RegistryUpdated,
  InfrastructureDeployed
} from "../generated/PoaManager/PoaManager";

export function createInfrastructureDeployedEvent(
  orgDeployer: Address,
  orgRegistry: Address,
  implRegistry: Address,
  paymasterHub: Address,
  globalAccountRegistry: Address,
  passkeyAccountFactoryBeacon: Address
): InfrastructureDeployed {
  let event = changetype<InfrastructureDeployed>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("orgDeployer", ethereum.Value.fromAddress(orgDeployer))
  );
  event.parameters.push(
    new ethereum.EventParam("orgRegistry", ethereum.Value.fromAddress(orgRegistry))
  );
  event.parameters.push(
    new ethereum.EventParam("implRegistry", ethereum.Value.fromAddress(implRegistry))
  );
  event.parameters.push(
    new ethereum.EventParam("paymasterHub", ethereum.Value.fromAddress(paymasterHub))
  );
  event.parameters.push(
    new ethereum.EventParam(
      "globalAccountRegistry",
      ethereum.Value.fromAddress(globalAccountRegistry)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "passkeyAccountFactoryBeacon",
      ethereum.Value.fromAddress(passkeyAccountFactoryBeacon)
    )
  );

  return event;
}

export function createBeaconCreatedEvent(
  typeId: Bytes,
  typeName: string,
  beacon: Address,
  implementation: Address
): BeaconCreated {
  let event = changetype<BeaconCreated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("typeId", ethereum.Value.fromFixedBytes(typeId))
  );
  event.parameters.push(
    new ethereum.EventParam("typeName", ethereum.Value.fromString(typeName))
  );
  event.parameters.push(
    new ethereum.EventParam("beacon", ethereum.Value.fromAddress(beacon))
  );
  event.parameters.push(
    new ethereum.EventParam("implementation", ethereum.Value.fromAddress(implementation))
  );

  return event;
}

export function createBeaconUpgradedEvent(
  typeId: Bytes,
  newImplementation: Address,
  version: string
): BeaconUpgraded {
  let event = changetype<BeaconUpgraded>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("typeId", ethereum.Value.fromFixedBytes(typeId))
  );
  event.parameters.push(
    new ethereum.EventParam("newImplementation", ethereum.Value.fromAddress(newImplementation))
  );
  event.parameters.push(
    new ethereum.EventParam("version", ethereum.Value.fromString(version))
  );

  return event;
}

export function createRegistryUpdatedEvent(
  oldRegistry: Address,
  newRegistry: Address
): RegistryUpdated {
  let event = changetype<RegistryUpdated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("oldRegistry", ethereum.Value.fromAddress(oldRegistry))
  );
  event.parameters.push(
    new ethereum.EventParam("newRegistry", ethereum.Value.fromAddress(newRegistry))
  );

  return event;
}
