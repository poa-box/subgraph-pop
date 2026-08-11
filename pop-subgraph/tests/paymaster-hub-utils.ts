import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  PaymasterInitialized,
  OrgRegistered,
  RuleSet,
  GlobalRuleSet,
  TargetTypeSet,
  RulesModeSet,
  GlobalRuleBlockSet,
  OnboardingConfigUpdated
} from "../generated/templates/PaymasterHub/PaymasterHub";

// Every PaymasterHub entity id is keyed off event.address, so each builder MUST set it.

export function createPaymasterInitializedEvent(
  hub: Address,
  entryPoint: Address,
  hats: Address,
  poaManager: Address
): PaymasterInitialized {
  let event = changetype<PaymasterInitialized>(newMockEvent());
  event.address = hub;

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("entryPoint", ethereum.Value.fromAddress(entryPoint))
  );
  event.parameters.push(new ethereum.EventParam("hats", ethereum.Value.fromAddress(hats)));
  event.parameters.push(
    new ethereum.EventParam("poaManager", ethereum.Value.fromAddress(poaManager))
  );

  return event;
}

export function createOrgRegisteredEvent(
  hub: Address,
  orgId: Bytes,
  adminHatId: BigInt,
  operatorHatId: BigInt
): OrgRegistered {
  let event = changetype<OrgRegistered>(newMockEvent());
  event.address = hub;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(
    new ethereum.EventParam("adminHatId", ethereum.Value.fromUnsignedBigInt(adminHatId))
  );
  event.parameters.push(
    new ethereum.EventParam("operatorHatId", ethereum.Value.fromUnsignedBigInt(operatorHatId))
  );

  return event;
}

export function createRuleSetEvent(
  hub: Address,
  orgId: Bytes,
  target: Address,
  selector: Bytes,
  allowed: boolean,
  maxCallGasHint: i32
): RuleSet {
  let event = changetype<RuleSet>(newMockEvent());
  event.address = hub;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(new ethereum.EventParam("target", ethereum.Value.fromAddress(target)));
  event.parameters.push(
    new ethereum.EventParam("selector", ethereum.Value.fromFixedBytes(selector))
  );
  event.parameters.push(new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed)));
  event.parameters.push(
    new ethereum.EventParam(
      "maxCallGasHint",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(maxCallGasHint))
    )
  );

  return event;
}

export function createGlobalRuleSetEvent(
  hub: Address,
  typeId: Bytes,
  selector: Bytes,
  allowed: boolean,
  maxCallGasHint: i32
): GlobalRuleSet {
  let event = changetype<GlobalRuleSet>(newMockEvent());
  event.address = hub;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("typeId", ethereum.Value.fromFixedBytes(typeId)));
  event.parameters.push(
    new ethereum.EventParam("selector", ethereum.Value.fromFixedBytes(selector))
  );
  event.parameters.push(new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed)));
  event.parameters.push(
    new ethereum.EventParam(
      "maxCallGasHint",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(maxCallGasHint))
    )
  );

  return event;
}

export function createTargetTypeSetEvent(
  hub: Address,
  orgId: Bytes,
  target: Address,
  typeId: Bytes
): TargetTypeSet {
  let event = changetype<TargetTypeSet>(newMockEvent());
  event.address = hub;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(new ethereum.EventParam("target", ethereum.Value.fromAddress(target)));
  event.parameters.push(new ethereum.EventParam("typeId", ethereum.Value.fromFixedBytes(typeId)));

  return event;
}

export function createRulesModeSetEvent(hub: Address, orgId: Bytes, mode: i32): RulesModeSet {
  let event = changetype<RulesModeSet>(newMockEvent());
  event.address = hub;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(
    new ethereum.EventParam("mode", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(mode)))
  );

  return event;
}

// POP #175 shape: maxOnboardingsPerAccount is the THIRD arg, not appended at the end.
export function createOnboardingConfigUpdatedEvent(
  hub: Address,
  maxGasPerCreation: BigInt,
  dailyCreationLimit: BigInt,
  maxOnboardingsPerAccount: i32,
  enabled: boolean,
  accountRegistry: Address
): OnboardingConfigUpdated {
  let event = changetype<OnboardingConfigUpdated>(newMockEvent());
  event.address = hub;

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "maxGasPerCreation",
      ethereum.Value.fromUnsignedBigInt(maxGasPerCreation)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "dailyCreationLimit",
      ethereum.Value.fromUnsignedBigInt(dailyCreationLimit)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "maxOnboardingsPerAccount",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(maxOnboardingsPerAccount))
    )
  );
  event.parameters.push(new ethereum.EventParam("enabled", ethereum.Value.fromBoolean(enabled)));
  event.parameters.push(
    new ethereum.EventParam("accountRegistry", ethereum.Value.fromAddress(accountRegistry))
  );

  return event;
}

export function createGlobalRuleBlockSetEvent(
  hub: Address,
  orgId: Bytes,
  target: Address,
  selector: Bytes,
  blocked: boolean
): GlobalRuleBlockSet {
  let event = changetype<GlobalRuleBlockSet>(newMockEvent());
  event.address = hub;

  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(new ethereum.EventParam("target", ethereum.Value.fromAddress(target)));
  event.parameters.push(
    new ethereum.EventParam("selector", ethereum.Value.fromFixedBytes(selector))
  );
  event.parameters.push(new ethereum.EventParam("blocked", ethereum.Value.fromBoolean(blocked)));

  return event;
}
