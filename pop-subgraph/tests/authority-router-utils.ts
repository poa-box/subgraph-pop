// Mock-event factories for the Access-v2 AuthorityRouter singleton dataSource.

import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  RouterInitialized,
  PaymasterHubSet,
  AuthorityBound,
  AuthorityUnbound
} from "../generated/AuthorityRouter/AuthorityRouter";

let nextLogIndex: i32 = 1;

function base(router: Address): ethereum.Event {
  let event = newMockEvent();
  event.address = router;
  event.logIndex = BigInt.fromI32(nextLogIndex);
  nextLogIndex = nextLogIndex + 1;
  event.parameters = new Array();
  return event;
}

export function createRouterInitializedEvent(
  router: Address,
  hats: Address,
  orgRegistry: Address,
  admin: Address
): RouterInitialized {
  let event = changetype<RouterInitialized>(base(router));
  event.parameters.push(new ethereum.EventParam("hats", ethereum.Value.fromAddress(hats)));
  event.parameters.push(
    new ethereum.EventParam("orgRegistry", ethereum.Value.fromAddress(orgRegistry))
  );
  event.parameters.push(new ethereum.EventParam("admin", ethereum.Value.fromAddress(admin)));
  return event;
}

export function createPaymasterHubSetEvent(
  router: Address,
  paymasterHub: Address
): PaymasterHubSet {
  let event = changetype<PaymasterHubSet>(base(router));
  event.parameters.push(
    new ethereum.EventParam("paymasterHub", ethereum.Value.fromAddress(paymasterHub))
  );
  return event;
}

export function createAuthorityBoundEvent(
  router: Address,
  orgId: Bytes,
  topHatDomain: BigInt,
  authority: Address
): AuthorityBound {
  let event = changetype<AuthorityBound>(base(router));
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(
    new ethereum.EventParam("topHatDomain", ethereum.Value.fromUnsignedBigInt(topHatDomain))
  );
  event.parameters.push(new ethereum.EventParam("authority", ethereum.Value.fromAddress(authority)));
  return event;
}

export function createAuthorityUnboundEvent(
  router: Address,
  orgId: Bytes,
  topHatDomain: BigInt,
  authority: Address
): AuthorityUnbound {
  let event = changetype<AuthorityUnbound>(base(router));
  event.parameters.push(new ethereum.EventParam("orgId", ethereum.Value.fromFixedBytes(orgId)));
  event.parameters.push(
    new ethereum.EventParam("topHatDomain", ethereum.Value.fromUnsignedBigInt(topHatDomain))
  );
  event.parameters.push(new ethereum.EventParam("authority", ethereum.Value.fromAddress(authority)));
  return event;
}
