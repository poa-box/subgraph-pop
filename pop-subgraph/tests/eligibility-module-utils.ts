import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  HatMetadataUpdated,
  HatCreatedWithEligibility,
  DefaultEligibilityUpdated,
  RoleApplicationSubmitted,
  RoleApplicationWithdrawn
} from "../generated/templates/EligibilityModule/EligibilityModule";

export function createHatMetadataUpdatedEvent(
  hatId: BigInt,
  name: string,
  metadataCID: Bytes
): HatMetadataUpdated {
  let event = changetype<HatMetadataUpdated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("name", ethereum.Value.fromString(name))
  );
  event.parameters.push(
    new ethereum.EventParam("metadataCID", ethereum.Value.fromFixedBytes(metadataCID))
  );

  return event;
}

export function createHatCreatedWithEligibilityEvent(
  creator: Address,
  parentHatId: BigInt,
  newHatId: BigInt,
  defaultEligible: boolean,
  defaultStanding: boolean,
  mintedCount: BigInt
): HatCreatedWithEligibility {
  let event = changetype<HatCreatedWithEligibility>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("creator", ethereum.Value.fromAddress(creator))
  );
  event.parameters.push(
    new ethereum.EventParam("parentHatId", ethereum.Value.fromUnsignedBigInt(parentHatId))
  );
  event.parameters.push(
    new ethereum.EventParam("newHatId", ethereum.Value.fromUnsignedBigInt(newHatId))
  );
  event.parameters.push(
    new ethereum.EventParam("defaultEligible", ethereum.Value.fromBoolean(defaultEligible))
  );
  event.parameters.push(
    new ethereum.EventParam("defaultStanding", ethereum.Value.fromBoolean(defaultStanding))
  );
  event.parameters.push(
    new ethereum.EventParam("mintedCount", ethereum.Value.fromUnsignedBigInt(mintedCount))
  );

  return event;
}

export function createDefaultEligibilityUpdatedEvent(
  hatId: BigInt,
  eligible: boolean,
  standing: boolean,
  admin: Address
): DefaultEligibilityUpdated {
  let event = changetype<DefaultEligibilityUpdated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("eligible", ethereum.Value.fromBoolean(eligible))
  );
  event.parameters.push(
    new ethereum.EventParam("standing", ethereum.Value.fromBoolean(standing))
  );
  event.parameters.push(
    new ethereum.EventParam("admin", ethereum.Value.fromAddress(admin))
  );

  return event;
}

export function createRoleApplicationSubmittedEvent(
  hatId: BigInt,
  applicant: Address,
  applicationHash: Bytes
): RoleApplicationSubmitted {
  let event = changetype<RoleApplicationSubmitted>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("applicant", ethereum.Value.fromAddress(applicant))
  );
  event.parameters.push(
    new ethereum.EventParam("applicationHash", ethereum.Value.fromFixedBytes(applicationHash))
  );

  return event;
}

export function createRoleApplicationWithdrawnEvent(
  hatId: BigInt,
  applicant: Address
): RoleApplicationWithdrawn {
  let event = changetype<RoleApplicationWithdrawn>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("applicant", ethereum.Value.fromAddress(applicant))
  );

  return event;
}
