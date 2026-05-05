import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  beforeEach,
} from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  handleCashOutDeposited,
  handleCashOutFailed,
  handleTokensRecovered,
  handleUpgraded,
} from "../src/cash-out-relay";
import {
  RELAY_ADDRESS,
  USDC_ADDRESS,
  mockRelayBindings,
  createCashOutDepositedEvent,
  createCashOutFailedEvent,
  createTokensRecoveredEvent,
  createUpgradedEvent,
} from "./cash-out-relay-utils";

const DEPOSITOR = "0x000000000000000000000000000000000000a11c";
const DEPOSITOR_2 = "0x000000000000000000000000000000000000b22d";
const REQUEST_HASH_1 =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const REQUEST_HASH_2 =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const PAYMENT_METHOD =
  "0x76656e6d6f0000000000000000000000000000000000000000000000000000ff"; // arbitrary
const NEW_IMPL = "0x000000000000000000000000000000000000c0de";
const OTHER_TOKEN = "0x000000000000000000000000000000000000dead"; // not USDC

describe("CashOutRelay", () => {
  beforeEach(() => {
    mockRelayBindings();
  });

  afterEach(() => {
    clearStore();
  });

  test("CashOutDeposited creates Wallet + DEPOSITED CashOutRequest", () => {
    let event = createCashOutDepositedEvent(
      Address.fromString(DEPOSITOR),
      Bytes.fromHexString(REQUEST_HASH_1),
      BigInt.fromI32(10000000),
      Bytes.fromHexString(PAYMENT_METHOD)
    );
    handleCashOutDeposited(event);

    assert.entityCount("Wallet", 1);
    assert.entityCount("CashOutRequest", 1);
    assert.entityCount("CashOutDepositedEvent", 1);
    assert.entityCount("RelayContract", 1);

    assert.fieldEquals("CashOutRequest", REQUEST_HASH_1, "status", "DEPOSITED");
    assert.fieldEquals("CashOutRequest", REQUEST_HASH_1, "amount", "10000000");
    assert.fieldEquals(
      "CashOutRequest",
      REQUEST_HASH_1,
      "depositor",
      DEPOSITOR
    );
    assert.fieldEquals("Wallet", DEPOSITOR, "totalDepositedAmount", "10000000");
    assert.fieldEquals("Wallet", DEPOSITOR, "pendingCount", "0");
    assert.fieldEquals(
      "RelayContract",
      RELAY_ADDRESS,
      "totalDepositedAmount",
      "10000000"
    );
    assert.fieldEquals("RelayContract", RELAY_ADDRESS, "totalRequests", "1");
  });

  test("CashOutFailed creates FAILED CashOutRequest with pendingFor set", () => {
    let event = createCashOutFailedEvent(
      Address.fromString(DEPOSITOR),
      Bytes.fromHexString(REQUEST_HASH_1),
      BigInt.fromI32(5000000),
      Bytes.fromHexString("0xdeadbeef")
    );
    handleCashOutFailed(event);

    assert.entityCount("CashOutRequest", 1);
    assert.entityCount("CashOutFailedEvent", 1);
    assert.entityCount("WalletPendingByAmount", 1);

    assert.fieldEquals("CashOutRequest", REQUEST_HASH_1, "status", "FAILED");
    assert.fieldEquals(
      "CashOutRequest",
      REQUEST_HASH_1,
      "pendingFor",
      DEPOSITOR
    );
    assert.fieldEquals("Wallet", DEPOSITOR, "totalFailedAmount", "5000000");
    assert.fieldEquals("Wallet", DEPOSITOR, "pendingCount", "1");
    assert.fieldEquals(
      "RelayContract",
      RELAY_ADDRESS,
      "totalPendingRequests",
      "1"
    );
  });

  test("TokensRecovered (USDC, matching) flips FAILED -> RECOVERED", () => {
    let amount = BigInt.fromI32(5000000);
    handleCashOutFailed(
      createCashOutFailedEvent(
        Address.fromString(DEPOSITOR),
        Bytes.fromHexString(REQUEST_HASH_1),
        amount,
        Bytes.fromHexString("0xdeadbeef")
      )
    );

    handleTokensRecovered(
      createTokensRecoveredEvent(
        Address.fromString(DEPOSITOR),
        Address.fromString(USDC_ADDRESS),
        amount
      )
    );

    assert.fieldEquals(
      "CashOutRequest",
      REQUEST_HASH_1,
      "status",
      "RECOVERED"
    );
    // pendingFor should be unset (null) — fieldEquals on a null field shows "null"
    assert.fieldEquals("CashOutRequest", REQUEST_HASH_1, "pendingFor", "null");
    assert.fieldEquals("Wallet", DEPOSITOR, "pendingCount", "0");
    assert.fieldEquals("Wallet", DEPOSITOR, "totalFailedAmount", "0");
    assert.fieldEquals("Wallet", DEPOSITOR, "totalRecoveredAmount", "5000000");
    assert.fieldEquals(
      "RelayContract",
      RELAY_ADDRESS,
      "totalPendingRequests",
      "0"
    );
    assert.fieldEquals(
      "RelayContract",
      RELAY_ADDRESS,
      "totalRecoveredRequests",
      "1"
    );
  });

  test("TokensRecovered for non-USDC token does not touch any CashOutRequest", () => {
    let amount = BigInt.fromI32(5000000);
    handleCashOutFailed(
      createCashOutFailedEvent(
        Address.fromString(DEPOSITOR),
        Bytes.fromHexString(REQUEST_HASH_1),
        amount,
        Bytes.fromHexString("0xdeadbeef")
      )
    );

    handleTokensRecovered(
      createTokensRecoveredEvent(
        Address.fromString(DEPOSITOR),
        Address.fromString(OTHER_TOKEN),
        amount
      )
    );

    assert.fieldEquals("CashOutRequest", REQUEST_HASH_1, "status", "FAILED");
    assert.fieldEquals("Wallet", DEPOSITOR, "pendingCount", "1");
    assert.entityCount("TokensRecoveredEvent", 1);
  });

  test("TokensRecovered (USDC, no matching FAILED) only emits the immutable event", () => {
    handleTokensRecovered(
      createTokensRecoveredEvent(
        Address.fromString(DEPOSITOR),
        Address.fromString(USDC_ADDRESS),
        BigInt.fromI32(5000000)
      )
    );
    assert.entityCount("TokensRecoveredEvent", 1);
    assert.entityCount("CashOutRequest", 0);
    assert.entityCount("Wallet", 0);
  });

  test("Two CashOutDeposited events for same wallet aggregate amounts", () => {
    handleCashOutDeposited(
      createCashOutDepositedEvent(
        Address.fromString(DEPOSITOR),
        Bytes.fromHexString(REQUEST_HASH_1),
        BigInt.fromI32(1000000),
        Bytes.fromHexString(PAYMENT_METHOD)
      )
    );
    handleCashOutDeposited(
      createCashOutDepositedEvent(
        Address.fromString(DEPOSITOR),
        Bytes.fromHexString(REQUEST_HASH_2),
        BigInt.fromI32(2500000),
        Bytes.fromHexString(PAYMENT_METHOD)
      )
    );

    assert.entityCount("CashOutRequest", 2);
    assert.fieldEquals("Wallet", DEPOSITOR, "totalDepositedAmount", "3500000");
    assert.fieldEquals("RelayContract", RELAY_ADDRESS, "totalRequests", "2");
  });

  test("Upgraded sets currentImplementation on the singleton", () => {
    handleUpgraded(createUpgradedEvent(Address.fromString(NEW_IMPL)));
    assert.fieldEquals(
      "RelayContract",
      RELAY_ADDRESS,
      "currentImplementation",
      NEW_IMPL
    );
    assert.entityCount("UpgradedEvent", 1);
  });

  test("Two FAILED requests with same (wallet, amount): RECOVERED clears head FIFO", () => {
    let amount = BigInt.fromI32(7000000);
    handleCashOutFailed(
      createCashOutFailedEvent(
        Address.fromString(DEPOSITOR),
        Bytes.fromHexString(REQUEST_HASH_1),
        amount,
        Bytes.fromHexString("0x01")
      )
    );
    handleCashOutFailed(
      createCashOutFailedEvent(
        Address.fromString(DEPOSITOR),
        Bytes.fromHexString(REQUEST_HASH_2),
        amount,
        Bytes.fromHexString("0x02")
      )
    );

    handleTokensRecovered(
      createTokensRecoveredEvent(
        Address.fromString(DEPOSITOR),
        Address.fromString(USDC_ADDRESS),
        amount
      )
    );

    // First (oldest) request resolved
    assert.fieldEquals(
      "CashOutRequest",
      REQUEST_HASH_1,
      "status",
      "RECOVERED"
    );
    // Second still pending
    assert.fieldEquals("CashOutRequest", REQUEST_HASH_2, "status", "FAILED");
    assert.fieldEquals("Wallet", DEPOSITOR, "pendingCount", "1");
  });
});
