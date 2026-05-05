import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  CashOutDeposited,
  CashOutFailed,
  TokensRecovered,
  Upgraded,
  CashOutRelay as CashOutRelayBinding,
} from "../generated/CashOutRelay/CashOutRelay";
import {
  Wallet,
  CashOutRequest,
  CashOutDepositedEvent,
  CashOutFailedEvent,
  TokensRecoveredEvent,
  UpgradedEvent,
  RelayContract,
  WalletPendingByAmount,
} from "../generated/schema";

const ZERO = BigInt.fromI32(0);
const ONE = BigInt.fromI32(1);

function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

function pendingIndexId(wallet: Address, amount: BigInt): string {
  return wallet.toHexString() + "-" + amount.toString();
}

function getOrCreateWallet(addr: Address, timestamp: BigInt): Wallet {
  let w = Wallet.load(addr);
  if (w == null) {
    w = new Wallet(addr);
    w.address = addr;
    w.totalDepositedAmount = ZERO;
    w.totalFailedAmount = ZERO;
    w.totalRecoveredAmount = ZERO;
    w.pendingCount = ZERO;
    w.firstSeenAt = timestamp;
  }
  w.lastActivityAt = timestamp;
  return w;
}

function getOrCreateRelay(addr: Address): RelayContract {
  let r = RelayContract.load(addr);
  if (r == null) {
    r = new RelayContract(addr);
    r.totalRequests = ZERO;
    r.totalFailedRequests = ZERO;
    r.totalPendingRequests = ZERO;
    r.totalRecoveredRequests = ZERO;
    r.totalDepositedAmount = ZERO;
    r.totalFailedAmount = ZERO;
    r.totalRecoveredAmount = ZERO;
    let bound = CashOutRelayBinding.bind(addr);
    let usdcCall = bound.try_usdc();
    if (!usdcCall.reverted) {
      r.usdc = usdcCall.value;
    }
    let escrowCall = bound.try_escrow();
    if (!escrowCall.reverted) {
      r.escrow = escrowCall.value;
    }
    let cctpCall = bound.try_cctpMessageTransmitter();
    if (!cctpCall.reverted) {
      r.cctpMessageTransmitter = cctpCall.value;
    }
    let ownerCall = bound.try_owner();
    if (!ownerCall.reverted) {
      r.owner = ownerCall.value;
    }
  }
  return r;
}

function appendPending(walletAddr: Address, amount: BigInt, requestHash: Bytes): void {
  let id = pendingIndexId(walletAddr, amount);
  let idx = WalletPendingByAmount.load(id);
  if (idx == null) {
    idx = new WalletPendingByAmount(id);
    idx.pendingRequests = [];
  }
  let list = idx.pendingRequests;
  list.push(requestHash);
  idx.pendingRequests = list;
  idx.save();
}

// Pop the FIFO head requestHash for (wallet, amount); return null if no pending.
function popPending(walletAddr: Address, amount: BigInt): Bytes | null {
  let id = pendingIndexId(walletAddr, amount);
  let idx = WalletPendingByAmount.load(id);
  if (idx == null) return null;
  let list = idx.pendingRequests;
  if (list.length == 0) return null;
  let head = list[0];
  let rest: Bytes[] = [];
  for (let i = 1; i < list.length; i++) {
    rest.push(list[i]);
  }
  idx.pendingRequests = rest;
  idx.save();
  return head;
}

export function handleCashOutDeposited(event: CashOutDeposited): void {
  let depositor = event.params.depositor;
  let requestHash = event.params.requestHash;
  let amount = event.params.amount;
  let paymentMethod = event.params.paymentMethod;

  let wallet = getOrCreateWallet(depositor, event.block.timestamp);
  wallet.totalDepositedAmount = wallet.totalDepositedAmount.plus(amount);
  wallet.save();

  let relay = getOrCreateRelay(event.address);
  relay.totalRequests = relay.totalRequests.plus(ONE);
  relay.totalDepositedAmount = relay.totalDepositedAmount.plus(amount);
  relay.save();

  let req = CashOutRequest.load(requestHash);
  if (req == null) {
    req = new CashOutRequest(requestHash);
    req.requestHash = requestHash;
    req.depositor = wallet.id;
    req.amount = amount;
    req.createdAtBlock = event.block.number;
    req.createdAtTimestamp = event.block.timestamp;
    req.createdTxHash = event.transaction.hash;
  }
  req.pendingFor = null;
  req.paymentMethod = paymentMethod;
  req.status = "DEPOSITED";
  req.save();

  let logEntity = new CashOutDepositedEvent(eventId(event));
  logEntity.request = req.id;
  logEntity.depositor = wallet.id;
  logEntity.amount = amount;
  logEntity.paymentMethod = paymentMethod;
  logEntity.blockNumber = event.block.number;
  logEntity.blockTimestamp = event.block.timestamp;
  logEntity.transactionHash = event.transaction.hash;
  logEntity.save();
}

export function handleCashOutFailed(event: CashOutFailed): void {
  let depositor = event.params.depositor;
  let requestHash = event.params.requestHash;
  let amount = event.params.amount;
  let reason = event.params.reason;

  let wallet = getOrCreateWallet(depositor, event.block.timestamp);
  wallet.totalFailedAmount = wallet.totalFailedAmount.plus(amount);
  wallet.pendingCount = wallet.pendingCount.plus(ONE);
  wallet.save();

  let relay = getOrCreateRelay(event.address);
  relay.totalRequests = relay.totalRequests.plus(ONE);
  relay.totalFailedRequests = relay.totalFailedRequests.plus(ONE);
  relay.totalPendingRequests = relay.totalPendingRequests.plus(ONE);
  relay.totalFailedAmount = relay.totalFailedAmount.plus(amount);
  relay.save();

  // Defensive load — a previously seen requestHash should not exist for FAILED
  // (the contract reverts on requestHash collision in the failed map), but if
  // it does, overwrite rather than create a duplicate.
  let req = CashOutRequest.load(requestHash);
  if (req == null) {
    req = new CashOutRequest(requestHash);
    req.requestHash = requestHash;
    req.depositor = wallet.id;
    req.amount = amount;
    req.createdAtBlock = event.block.number;
    req.createdAtTimestamp = event.block.timestamp;
    req.createdTxHash = event.transaction.hash;
  }
  req.pendingFor = wallet.id;
  req.failureReason = reason;
  req.status = "FAILED";
  req.save();

  appendPending(depositor, amount, requestHash);

  let logEntity = new CashOutFailedEvent(eventId(event));
  logEntity.request = req.id;
  logEntity.depositor = wallet.id;
  logEntity.amount = amount;
  logEntity.reason = reason;
  logEntity.blockNumber = event.block.number;
  logEntity.blockTimestamp = event.block.timestamp;
  logEntity.transactionHash = event.transaction.hash;
  logEntity.save();
}

export function handleTokensRecovered(event: TokensRecovered): void {
  let to = event.params.to;
  let token = event.params.token;
  let amount = event.params.amount;

  let relay = getOrCreateRelay(event.address);
  relay.save();

  let logEntity = new TokensRecoveredEvent(eventId(event));
  logEntity.to = to;
  logEntity.token = token;
  logEntity.amount = amount;
  logEntity.blockNumber = event.block.number;
  logEntity.blockTimestamp = event.block.timestamp;
  logEntity.transactionHash = event.transaction.hash;

  // Heuristic: only USDC TokensRecovered can resolve a tracked FAILED request.
  // emergencyRecover for USDC cannot drain failed-deposit reserves (contract
  // enforces balance - amount >= totalFailedAmount), so any USDC TokensRecovered
  // matching a tracked (depositor, amount) row is overwhelmingly a recoverFailed
  // call. Edge case: emergencyRecover of *excess* USDC (above totalFailedAmount)
  // sent to an address that happens to be a depositor with an exact-amount
  // FAILED entry would be falsely matched here. Vanishingly rare; documented so
  // future maintainers don't assume the heuristic is provably exact.
  let usdc = relay.usdc;
  if (usdc === null) {
    logEntity.save();
    return;
  }
  let usdcBytes = changetype<Bytes>(usdc);
  if (!token.equals(usdcBytes)) {
    logEntity.save();
    return;
  }

  let head = popPending(to, amount);
  if (head === null) {
    logEntity.save();
    return;
  }

  let req = CashOutRequest.load(head);
  if (req === null) {
    logEntity.save();
    return;
  }

  req.status = "RECOVERED";
  req.pendingFor = null;
  req.resolvedAtBlock = event.block.number;
  req.resolvedAtTimestamp = event.block.timestamp;
  req.resolvedTxHash = event.transaction.hash;
  req.save();

  logEntity.resolvedRequest = req.id;

  let wallet = Wallet.load(to);
  if (wallet !== null) {
    wallet.pendingCount = wallet.pendingCount.minus(ONE);
    wallet.totalFailedAmount = wallet.totalFailedAmount.minus(amount);
    wallet.totalRecoveredAmount = wallet.totalRecoveredAmount.plus(amount);
    wallet.lastActivityAt = event.block.timestamp;
    wallet.save();
  }

  relay.totalPendingRequests = relay.totalPendingRequests.minus(ONE);
  relay.totalFailedAmount = relay.totalFailedAmount.minus(amount);
  relay.totalRecoveredRequests = relay.totalRecoveredRequests.plus(ONE);
  relay.totalRecoveredAmount = relay.totalRecoveredAmount.plus(amount);
  relay.save();

  logEntity.save();
}

export function handleUpgraded(event: Upgraded): void {
  let relay = getOrCreateRelay(event.address);
  relay.currentImplementation = event.params.implementation;
  relay.lastUpgradeAt = event.block.timestamp;
  relay.save();

  let logEntity = new UpgradedEvent(eventId(event));
  logEntity.implementation = event.params.implementation;
  logEntity.blockNumber = event.block.number;
  logEntity.blockTimestamp = event.block.timestamp;
  logEntity.transactionHash = event.transaction.hash;
  logEntity.save();
}
