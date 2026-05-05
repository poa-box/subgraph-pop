import { newMockEvent, createMockedFunction } from "matchstick-as";
import { ethereum, Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  CashOutDeposited,
  CashOutFailed,
  TokensRecovered,
  Upgraded,
} from "../generated/CashOutRelay/CashOutRelay";

// Default mock event address used by matchstick. All createXxxEvent helpers
// produce events whose `.address` is this — so it doubles as the "relay" id.
export const RELAY_ADDRESS = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a";
// Real Base USDC. Used by mockRelayBindings so handleTokensRecovered's
// (token == relay.usdc) check resolves correctly.
export const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const ESCROW_ADDRESS = "0x777777779d229cdf3110e9de47943791c26300ef";
export const CCTP_ADDRESS = "0x1682ae6375c4e4a97e4b583bc394c861a46d8962";
export const OWNER_ADDRESS = "0x0000000000000000000000000000000000000099";

export function mockRelayBindings(): void {
  let relay = Address.fromString(RELAY_ADDRESS);
  createMockedFunction(relay, "usdc", "usdc():(address)").returns([
    ethereum.Value.fromAddress(Address.fromString(USDC_ADDRESS)),
  ]);
  createMockedFunction(relay, "escrow", "escrow():(address)").returns([
    ethereum.Value.fromAddress(Address.fromString(ESCROW_ADDRESS)),
  ]);
  createMockedFunction(
    relay,
    "cctpMessageTransmitter",
    "cctpMessageTransmitter():(address)"
  ).returns([ethereum.Value.fromAddress(Address.fromString(CCTP_ADDRESS))]);
  createMockedFunction(relay, "owner", "owner():(address)").returns([
    ethereum.Value.fromAddress(Address.fromString(OWNER_ADDRESS)),
  ]);
}

export function createCashOutDepositedEvent(
  depositor: Address,
  requestHash: Bytes,
  amount: BigInt,
  paymentMethod: Bytes
): CashOutDeposited {
  let event = changetype<CashOutDeposited>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("depositor", ethereum.Value.fromAddress(depositor))
  );
  event.parameters.push(
    new ethereum.EventParam(
      "requestHash",
      ethereum.Value.fromFixedBytes(requestHash)
    )
  );
  event.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  );
  event.parameters.push(
    new ethereum.EventParam(
      "paymentMethod",
      ethereum.Value.fromFixedBytes(paymentMethod)
    )
  );
  return event;
}

export function createCashOutFailedEvent(
  depositor: Address,
  requestHash: Bytes,
  amount: BigInt,
  reason: Bytes
): CashOutFailed {
  let event = changetype<CashOutFailed>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("depositor", ethereum.Value.fromAddress(depositor))
  );
  event.parameters.push(
    new ethereum.EventParam(
      "requestHash",
      ethereum.Value.fromFixedBytes(requestHash)
    )
  );
  event.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  );
  event.parameters.push(
    new ethereum.EventParam("reason", ethereum.Value.fromBytes(reason))
  );
  return event;
}

export function createTokensRecoveredEvent(
  to: Address,
  token: Address,
  amount: BigInt
): TokensRecovered {
  let event = changetype<TokensRecovered>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to))
  );
  event.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  );
  event.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  );
  return event;
}

export function createUpgradedEvent(implementation: Address): Upgraded {
  let event = changetype<Upgraded>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "implementation",
      ethereum.Value.fromAddress(implementation)
    )
  );
  return event;
}
