// ACCESS V2 — AuthorityRouter mapping (protocol-owned singleton, one per chain).
//
// The router is what PaymasterHub.hats (and any other chain-wide reader) points at after the §6
// step-0.5 repoint. It answers the IHats read subset for BOUND legacy id ranges by delegating to
// the org's MembershipAuthority, and passes everything else through to real Hats.
//
// Only the BINDING surface is indexable, and it is the exact on-chain marker of an org's cutover:
// `AuthorityBound` is ordered BEFORE the legacy-hat toggle-off inside the atomic cutover batch, so
// the bind timestamp IS the moment the org's adopted ids flipped from passthrough to
// authority-native. `AuthorityUnbound` is the rollback path.

import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  RouterInitialized as RouterInitializedEvent,
  PaymasterHubSet as PaymasterHubSetEvent,
  AuthorityBound as AuthorityBoundEvent,
  AuthorityUnbound as AuthorityUnboundEvent
} from "../generated/AuthorityRouter/AuthorityRouter";
import {
  AuthorityRouterContract,
  RouterBinding,
  MembershipAuthorityContract,
  Organization
} from "../generated/schema";

function getOrCreateRouter(address: Bytes, event: ethereum.Event): AuthorityRouterContract {
  let router = AuthorityRouterContract.load(address);
  if (router != null) {
    return router;
  }
  router = new AuthorityRouterContract(address);
  router.bindingCount = 0;
  router.createdAt = event.block.timestamp;
  router.createdAtBlock = event.block.number;
  router.lastUpdatedAt = event.block.timestamp;
  router.save();
  return router;
}

function bindingId(router: Bytes, topHatDomain: BigInt): string {
  return router.toHexString() + "-" + topHatDomain.toString();
}

/**
 * RouterInitialized — the singleton's own initialize(); `PaymasterHubSet` is mirrored from the same
 * call (the contract emits the setter's event inside initialize precisely so indexers read config
 * from logs), so the deploy-time snapshot needs no eth_call.
 */
export function handleRouterInitialized(event: RouterInitializedEvent): void {
  let router = getOrCreateRouter(event.address, event);
  router.hats = event.params.hats;
  router.orgRegistry = event.params.orgRegistry;
  router.admin = event.params.admin;
  router.lastUpdatedAt = event.block.timestamp;
  router.save();
}

export function handleRouterPaymasterHubSet(event: PaymasterHubSetEvent): void {
  let router = getOrCreateRouter(event.address, event);
  router.paymasterHub = event.params.paymasterHub;
  router.lastUpdatedAt = event.block.timestamp;
  router.save();
}

/**
 * AuthorityBound — THE CUTOVER MARKER. The router keys bindings by TOPHAT DOMAIN (bits 224–255 of
 * the org's adopted legacy ids), so the row is keyed the same way; a rollback unbind keeps the row
 * with isBound = false and a re-bind reuses it.
 */
export function handleAuthorityBound(event: AuthorityBoundEvent): void {
  let router = getOrCreateRouter(event.address, event);
  let id = bindingId(event.address, event.params.topHatDomain);

  let binding = RouterBinding.load(id);
  let isNew = binding == null;
  if (binding == null) {
    binding = new RouterBinding(id);
    binding.router = router.id;
    binding.topHatDomain = event.params.topHatDomain;
  }
  binding.orgIdHash = event.params.orgId;
  let org = Organization.load(event.params.orgId);
  if (org != null) {
    binding.organization = org.id;
  }
  binding.authority = event.params.authority;
  binding.isBound = true;
  binding.boundAt = event.block.timestamp;
  binding.boundAtBlock = event.block.number;
  binding.unboundAt = null;
  binding.transactionHash = event.transaction.hash;

  let authority = MembershipAuthorityContract.load(event.params.authority);
  if (authority != null) {
    binding.authorityContract = authority.id;
    authority.routerBinding = binding.id;
    authority.isRouterBound = true;
    authority.cutoverAt = event.block.timestamp;
    authority.lastUpdatedAt = event.block.timestamp;
    authority.save();
  }
  binding.save();

  if (isNew) {
    router.bindingCount = router.bindingCount + 1;
  }
  router.lastUpdatedAt = event.block.timestamp;
  router.save();
}

/** AuthorityUnbound — the rollback path: adopted ids fall back to passthrough to real Hats. */
export function handleAuthorityUnbound(event: AuthorityUnboundEvent): void {
  let router = getOrCreateRouter(event.address, event);
  let binding = RouterBinding.load(bindingId(event.address, event.params.topHatDomain));
  if (binding != null) {
    binding.isBound = false;
    binding.unboundAt = event.block.timestamp;
    binding.transactionHash = event.transaction.hash;
    binding.save();
  }

  let authority = MembershipAuthorityContract.load(event.params.authority);
  if (authority != null) {
    authority.isRouterBound = false;
    authority.lastUpdatedAt = event.block.timestamp;
    authority.save();
  }
  router.lastUpdatedAt = event.block.timestamp;
  router.save();
}
