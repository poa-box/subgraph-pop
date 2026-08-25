// Hats Protocol event handlers — drive User.currentHatIds and RoleWearer.isActive
// off the canonical ERC-1155 token state instead of the EligibilityModule's view.
//
// Why this exists: an org with combineWithHierarchy=true vouching can hold a hat
// open to a wearer even after the EligibilityModule fires
// WearerEligibilityUpdated(eligible=false). The token is NOT burned in that case,
// so Hats.isWearerOfHat keeps returning true on-chain. Driving User.currentHatIds
// off eligibility events undercounted wearers (issue #166).
//
// Source of truth: ERC-1155 TransferSingle / TransferBatch from the Hats Protocol
// canonical contract.

import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  TransferSingle,
  TransferBatch,
  HatStatusChanged,
} from "../generated/Hats/Hats";
import { HatLookup, Hat, Subject, MembershipAuthorityContract } from "../generated/schema";
import { applyHatTransferAdd, applyHatTransferRemove } from "./utils";

const ZERO_ADDRESS = Address.zero();

/**
 * ACCESS-V2 CUTOVER GUARD — has a `MembershipAuthority` taken ownership of this hat id?
 *
 * A migrated org ADOPTS its legacy hat ids verbatim as subject ids, and the authority's own
 * TransferSingle mirror writes the SAME `RoleWearer` / `User` / `HatLookup` rows this file writes
 * (that reuse IS the entity-id continuity). The legacy tokens are never burned at cutover —
 * rollback depends on them surviving — and the toggle-off is ToggleModule-local, so this dataSource
 * stays a live co-writer of an adopted id forever: a post-cutover `Hats.renounceHat`, a stray
 * `transferHat`, or a permissionless `checkHatStatus` poke would silently contradict the authority
 * mirror (deactivating a RoleWearer, unlinking a User, or flipping `Hat.active` false under wearers
 * the authority still holds).
 *
 * The guard is per-ID, not per-domain, and reads two entities this mapping already owns (no
 * eth_calls): the `Subject` row exists only for an id the authority actually adopted, and the
 * binding — the atomic cutover marker, ordered BEFORE the toggle-off in the batch — flips
 * `isRouterBound`. Before the bind (the seed window, when legacy Hats is still the truth) and after
 * an `AuthorityUnbound` rollback this returns false and the legacy path runs exactly as before.
 */
function isAuthorityOwnedHat(hatId: BigInt): boolean {
  let subject = Subject.load(hatId.toString());
  if (subject == null) return false;
  let authority = MembershipAuthorityContract.load(subject.authority);
  if (authority == null) return false;
  return authority.isRouterBound;
}

/**
 * Apply a single hat transfer for one (hatId, value=1) tuple.
 * Hats Protocol always uses value=1 per ERC-1155 token, but we accept any
 * positive value defensively (multi-hat aggregations would still represent
 * one logical hat).
 */
function applyTransfer(
  from: Address,
  to: Address,
  hatId: BigInt,
  value: BigInt,
  event: ethereum.Event
): void {
  if (value.isZero()) return;
  // Self-transfer (from == to) is rejected by Hats Protocol but defend
  // against it anyway: a remove+add for the same wearer with the same
  // (txHash, logIndex, userId, hatId) would collide on the immutable
  // UserHatChange entity ID and crash the indexer.
  if (from.equals(to)) return;

  // Skip hats not registered to any of our orgs. Hats Protocol is global —
  // we only care about hats in trees we deployed.
  let lookup = HatLookup.load(hatId.toString());
  if (lookup == null) return;
  // Skip ids a cut-over MembershipAuthority owns: it is the sole writer of those rows now.
  if (isAuthorityOwnedHat(hatId)) return;
  let orgId = lookup.organization;

  let isMint = from.equals(ZERO_ADDRESS);
  let isBurn = to.equals(ZERO_ADDRESS);

  if (isMint && !isBurn) {
    applyHatTransferAdd(orgId, to, hatId, event);
  } else if (isBurn && !isMint) {
    applyHatTransferRemove(orgId, from, hatId, event);
  } else if (!isMint && !isBurn) {
    // transferHat: move the slot from one wearer to another
    applyHatTransferRemove(orgId, from, hatId, event);
    applyHatTransferAdd(orgId, to, hatId, event);
  }
  // 0x0 -> 0x0 is undefined behavior in ERC-1155; ignore.
}

export function handleHatsTransferSingle(event: TransferSingle): void {
  applyTransfer(
    event.params.from,
    event.params.to,
    event.params.id,
    event.params.value,
    event
  );
}

export function handleHatsTransferBatch(event: TransferBatch): void {
  let ids = event.params.ids;
  let values = event.params.values;
  if (ids.length != values.length) {
    log.warning(
      "[Hats] TransferBatch ids/values length mismatch — ids={} values={} tx={}",
      [
        ids.length.toString(),
        values.length.toString(),
        event.transaction.hash.toHexString(),
      ]
    );
    return;
  }
  for (let i = 0; i < ids.length; i++) {
    applyTransfer(
      event.params.from,
      event.params.to,
      ids[i],
      values[i],
      event
    );
  }
}

/**
 * Mark a hat active or inactive in our subgraph. Tokens are NOT burned when a
 * hat is toggled off, so consumers wanting "is X currently wearing this hat?"
 * semantics must AND wearer-balance with Hat.active.
 *
 * ...which is exactly why an ADOPTED id of a cut-over org is skipped: the cutover toggles the
 * legacy hat OFF by design, and any address can then poke `Hats.checkHatStatus(id)` to emit
 * HatStatusChanged(false). Applying it would make every migrated wearer read as not-wearing under
 * that documented convention, while the authority holds them. For bound ids, membership lives in
 * `SubjectMembership`.
 */
export function handleHatsStatusChanged(event: HatStatusChanged): void {
  let lookup = HatLookup.load(event.params.hatId.toString());
  if (lookup == null) return;
  if (isAuthorityOwnedHat(event.params.hatId)) return;
  let hatEntityId = lookup.hat;
  if (hatEntityId == null) return;
  let hat = Hat.load(hatEntityId as string);
  if (hat == null) return;
  hat.active = event.params.newStatus;
  hat.save();
}
