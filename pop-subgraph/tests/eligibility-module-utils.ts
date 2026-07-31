import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  HatMetadataUpdated,
  HatCreatedWithEligibility,
  DefaultEligibilityUpdated,
  RoleApplicationSubmitted,
  RoleApplicationWithdrawn,
  VouchConfigSet,
  Vouched,
  VouchRevoked,
  WearerVouchesCleared
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

export function createVouchConfigSetEvent(
  hatId: BigInt,
  quorum: BigInt,
  membershipHatId: BigInt,
  enabled: boolean,
  combineWithHierarchy: boolean
): VouchConfigSet {
  let event = changetype<VouchConfigSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("quorum", ethereum.Value.fromUnsignedBigInt(quorum))
  );
  event.parameters.push(
    new ethereum.EventParam("membershipHatId", ethereum.Value.fromUnsignedBigInt(membershipHatId))
  );
  event.parameters.push(
    new ethereum.EventParam("enabled", ethereum.Value.fromBoolean(enabled))
  );
  event.parameters.push(
    new ethereum.EventParam("combineWithHierarchy", ethereum.Value.fromBoolean(combineWithHierarchy))
  );

  return event;
}

export function createVouchedEvent(
  voucher: Address,
  wearer: Address,
  hatId: BigInt,
  newCount: BigInt
): Vouched {
  let event = changetype<Vouched>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("voucher", ethereum.Value.fromAddress(voucher))
  );
  event.parameters.push(
    new ethereum.EventParam("wearer", ethereum.Value.fromAddress(wearer))
  );
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("newCount", ethereum.Value.fromUnsignedBigInt(newCount))
  );

  return event;
}

export function createVouchRevokedEvent(
  voucher: Address,
  wearer: Address,
  hatId: BigInt,
  newCount: BigInt
): VouchRevoked {
  let event = changetype<VouchRevoked>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("voucher", ethereum.Value.fromAddress(voucher))
  );
  event.parameters.push(
    new ethereum.EventParam("wearer", ethereum.Value.fromAddress(wearer))
  );
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("newCount", ethereum.Value.fromUnsignedBigInt(newCount))
  );

  return event;
}

export function createWearerVouchesClearedEvent(
  wearer: Address,
  hatId: BigInt,
  admin: Address
): WearerVouchesCleared {
  let event = changetype<WearerVouchesCleared>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("wearer", ethereum.Value.fromAddress(wearer))
  );
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("admin", ethereum.Value.fromAddress(admin))
  );

  return event;
}
