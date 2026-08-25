# Wave E — Access v2 (`MembershipAuthority` + `AuthorityRouter`) indexing

Companion doc for the Access-v2 subgraph work. Normative sources live in the contracts repo:
`.context/rolemanager/ACCESS-V2-SPEC.md` §1–§6 and `.context/rolemanager/ACCESS-V2-INTERFACES.md`
(the frozen event set). Contract source of truth: `src/MembershipAuthority.sol`,
`src/libs/MembershipAuthorityLogic.sol`, `src/libs/MembershipAuthoritySeed.sol`,
`src/AuthorityRouter.sol`.

Access v2 replaces the per-org `EligibilityModule` + `ToggleModule` + marker-hat stratum with ONE
per-org `MembershipAuthority` (BeaconProxy, ERC-7201) plus a protocol-owned `AuthorityRouter`
singleton. Unmigrated orgs keep the legacy modules and the legacy entities; nothing in this wave
removes or renames an existing entity.

---

## 1. Entity map

| Entity | Id | What it is |
| --- | --- | --- |
| `MembershipAuthorityContract` | proxy address | The per-org authority. `Organization.membershipAuthority` points at it. |
| `Subject` | **the subject id VERBATIM** (decimal string) | A ROLE or a GROUP. Adopted legacy hatIds keep their value, so the id equals the `HatLookup` key. |
| `SubjectMembership` | `subjectId-user` | The (subject, user) row: `accepted`, `acceptedAt`, and the **fold mirror** (`eligible`, `eligibilitySource`, `isMember`, `claimable`). Created lazily for eligible-but-not-accepted users too. |
| `AccessRule` | `subjectId-user` | The single rule slot: `kind` (None/Grant/Ban), `author`, `delegable`, `sticky`. |
| `SubjectVouchConfig` | `subjectId` | quorum + voucher subject + epoch. Named `Subject…` because the legacy `VouchConfig` entity still serves unmigrated orgs. |
| `SubjectVouchRecord` | `subjectId-user-voucher` | Records-first per-voucher rows (`active`, `seeded`, `epoch`). |
| `EmailVerification` | `subjectId-user` | The zk-email attestor arm. |
| `PermRow` | `subjectId-permKey-ctx` | §3 permission table row: raw `word` plus decoded `exists` / `inheritGlobal` / `value`, the key's `foldTag` (top byte) and `isGlobalCtx`. |
| `GroupComposition` | `groupId-roleId` | Group ↔ member-role edge; retained with `isActive=false` on removal. |
| `ManagerConfig` | `subjectId` | Delegation config: `managerSubject`, `caps` (decoded to `canGrant`/`canRemove`), `delaySecs`. |
| `PendingAction` | `authority-pendingId` | The review-window ledger: `Pending` → `Cancelled` / `Voided` / `Finalized`. |
| `ConfigLintEvent` | txHash-logIndex | Non-reverting config warnings (`QuorumNoOp`, `SelfVoucher`, …). |
| `SubjectMembershipEvent` | txHash-logIndex | The activity feed: the seven disjoint verbs, rendered verbatim. |
| `AuthorityRouterContract` | router address | The per-chain singleton (hats / orgRegistry / paymasterHub / admin). |
| `RouterBinding` | `router-topHatDomain` | An org's legacy-id binding. The bind IS the cutover marker. |

`Organization` gains `membershipAuthority` and a derived `subjects` list. Nothing else changes.

### Entity-id continuity (the actual migration mechanism)

A migrated org adopts its legacy hatIds verbatim as subject ids. The mapping therefore:

* keys `Subject` by the subject id exactly as `HatLookup` is keyed;
* creates/loads the org's existing `Role` (`orgId-hatId`) for every ROLE subject via the shared
  `getOrCreateRole()` helper, and mirrors name/image/metadata onto it;
* replays the authority's ERC-1155 `TransferSingle` through the SAME
  `applyHatTransferAdd` / `applyHatTransferRemove` helpers the canonical Hats dataSource uses, so
  `RoleWearer` (`orgId-hatId-wearer`), `User` and `UserHatChange` ids never change across the
  cutover.

**Groups are not tokens.** A GROUP subject gets no `Role` mirror (surfacing one would pollute every
role picker — the v1 marker-hat mistake) and no `RoleWearer` rows. Group membership is a DERIVATION:
a user is in a group iff they are an active member of ≥1 active member-role of that group. There is
no on-chain per-user group enumeration to index (per-grant group flips were rejected in the spec as
~300–500 SLOADs).

---

## 2. The fold mirror (the load-bearing contract)

`SubjectMembership.eligible` is recomputed IN-MAPPING on every event that can move it, mirroring
`MembershipAuthorityLogic._eligibleRole` arm for arm, in the same order:

```
explicit Ban    -> false        (SUPREMACY — nothing below is consulted)
explicit Grant  -> true
emailVerified   -> true
vouch quorum    -> true         (quorum != 0 AND wearerEpoch == subjectEpoch AND count >= quorum)
else              subject default
```

`isMember = accepted && eligible`. `claimable = !accepted && eligible` — the §2 distinction the UI
needs so a renounced STICKY seat (a governance grant with `delegable=false` survives renounce) and
an open offer render as claimable rather than as membership. `eligibilitySource` records which arm
decided, so the UI can explain a verdict without re-deriving it.

**The mirror is deliberately AHEAD of the chain across the §5 event-lag window.** Config-level
lapses — `SubjectDefaultSet(false)`, `VouchEpochReset`, a quorum raise via `VouchConfigured`,
`UserVouchesCleared` — do not re-evaluate members on chain (a later `reconcile()` repairs them and
emits `MembershipReconciled`). The mapping re-folds every accepted row of the subject immediately,
using the bounded `Subject.acceptedUsers` list. Non-accepted rows are not swept: their `claimable`
flag is best-effort and refreshes on their next event (and on a default-ALLOW subject the claimable
set is "everyone", which no entity set could enumerate).

### `accepted` comes from `TransferSingle`, not from the lifecycle events

`_flipOn` / `_flipOff` emit exactly one `TransferSingle` per accepted transition, and every
lifecycle verb that moves acceptance goes through one of them. So:

* **`TransferSingle` owns** `accepted`, `acceptedAt`, `Subject.memberCount`,
  `MembershipAuthorityContract.acceptedMembershipCount`, and the `RoleWearer` continuity mirror.
* **The lifecycle events own** provenance only: the `SubjectMembershipEvent` feed row (actor,
  `delegated`, `banned`) and closing an open `PendingAction`.

No double counting is possible. The ONE shape that is not an accepted transition is a burn for a
user with no accepted row — what `emitUnportedBurns` produces. The handler clears the legacy
`RoleWearer` **without decrementing any counter** (tested).

**`emitUnportedBurns` is NOT part of the ceremony.** `script/accessv2/AccessV2MigrationBase.sol`
never calls it (`_buildCutoverBatch` is delta-seed → bind → `setMembershipAuthority` ×8 →
`targetTypes` → unpause → toggle-off → `CutoverVerifier.verify`), because runbook ruling **R4**
realizes the spec's "§6 burn-shaped events for unported wearers" as full-port + in-batch count
verification instead. The handler stays because the selector exists and an operator may use it out
of band — see the ghost divergence in §7 open items for what that means for a migrated org's
`RoleWearer` rows.

### `acceptedAt` caveat

Seeds applied while the authority is PAUSED are backdated ON CHAIN to `acceptedAt = 1` (so in-flight
proposals stay votable — spec ruling R7). No event carries the timestamp, and a paused-era executor
`grant()` is event-identical to a paused-era `seedMemberships()`. Rather than invent a value, the
mapping stores the observed block timestamp and sets `seededWhilePaused = true` when the mint
happened while the mirror knew the authority was paused. Consumers that need the on-chain value for
a `seededWhilePaused` row should read it as 1.

### Nothing is derived from a verb (rule deletions + pending closure)

Two contract-side event-law fixes (kyoto `ccbc029`) removed the last places this mapping had to
guess:

* **`RuleCleared` at every durable rule deletion** — renounce of a delegable/delegated grant,
  `_softRemove` (from `remove(ban=false)` and `finalize(Remove)`), `withdrawOffer`, `cancel` of an
  Offer pending, `delegatedUnremove`. It is not over-emitted either: `unremove` emits only when a
  Ban was really deleted, and the soft-remove revert path (`RemovalIneffective`) restores the slot
  and stays silent. So `handleRuleCleared` is the single, exhaustive deletion signal and the
  lifecycle handlers replicate NO conditional deletes. The only burn that leaves a rule standing is
  the renounce of a STICKY governance grant — the §2 reserved seat.
* **`PendingActionFinalized(pendingId)` at both consumption sites** — `claim()` consuming an Offer
  and `finalize()` applying a Grant/Remove. `handlePendingActionFinalized` closes exactly that
  pending and clears `SubjectMembership.pendingAction`. Closure is never inferred from a lifecycle
  verb: `claim()` consumes ONLY Offer pendings (a delegated Grant/Remove pending survives a
  self-claim and stays open on chain), and `mintHat` emits `RoleGranted` while consuming nothing.

### Post-cutover overlap: hats.ts hands ADOPTED ids over at the bind

Entity-id continuity means the canonical Hats dataSource and the authority template write the SAME
`RoleWearer` / `User` / `Hat` rows for an adopted id. The legacy tokens are NEVER burned at cutover
(rollback depends on them surviving) and the toggle-off is ToggleModule-local, so a direct legacy
interaction stays possible forever: a post-cutover `Hats.renounceHat(adoptedId)` would deactivate a
`RoleWearer` the authority still holds, and any address can poke `Hats.checkHatStatus(adoptedId)` to
emit `HatStatusChanged(false)`, which under the documented "AND wearer-balance with `Hat.active`"
convention reads as *nobody wears this role*.

`src/hats.ts` therefore skips an id when a `Subject` row exists for it AND that subject's authority
is `isRouterBound` — two entity loads, no eth_calls. The signal is exact in time (the bind is
ordered BEFORE the toggle-off inside the atomic cutover batch, and `AuthorityUnbound` releases it
again on rollback) and exact in scope (per-id: a hat in the same tree that was never adopted as a
subject keeps its legacy writer). Both directions are tested, including the seed window before the
bind, where legacy Hats is still the truth.

### Known approximation

`AccessRule.managerSubject` is best-effort. `RuleSet` carries no manager subject, and a manager
resolved through a CONTAINING GROUP is not event-visible, so the field is populated from the
subject's own `ManagerConfig` and is null otherwise.

---

## 3. Derived init config (the cross-block predeploy events)

The authority proxy is **predeployed and atomically initialized in its own transaction** (a
`BeaconProxy(beacon, initialize(EMPTY genesis))` broadcast, which closes the CREATE2 front-run
grief), one or more blocks BEFORE the governance batch that calls `registerOrgContract`. The
data-source template is created at `ContractRegistered`, so that transaction's
`MembershipAuthorityInitialized` and `PausedSet` are **cross-block-earlier and can never be
indexed**.

`src/org-registry.ts` therefore DERIVES the deploy-time config (HARD RULE: no eth_calls in
mappings):

| Field | Derivation |
| --- | --- |
| `executor` | `Organization.executorContract` — the authority is gated on that same address |
| `orgIdHash` | the registering `orgId` |
| `paused` | `true` — the contract is born paused; the cutover's `setPaused(false)` emits `PausedSet`, which this template DOES index |
| `initConfigDerived` | `true`, so consumers know the provenance |

If an authority is ever registered and initialized in the SAME transaction (the new-org
`OrgDeployer` path), the real `MembershipAuthorityInitialized` is indexed and overwrites the derived
values with `initConfigDerived = false`. Same-transaction logs around `ContractRegistered` are
indexed by the newly created template; only cross-block-earlier ones are lost.

Everything else in the ceremony is emitted at or after registration: the genesis seed is EMPTY by
construction, so every `SubjectCreated` / rule / membership / perm event lands in the seed batches
that follow `registerOrgContract`.

---

## 4. Data sources

* **`MembershipAuthority` template** — instantiated from `OrgRegistry.ContractRegistered` when
  `typeId == keccak256("MembershipAuthority")`
  (`0xdff254c0d9c318c4e70eac95af4c0c9189e13f9d51ae2cfe2c1c446c4775ddb8`), mirroring the
  `ZkEmailInvites` wiring. 33 handlers cover the full frozen event vocabulary.
* **`AuthorityRouter` static dataSource** — the router is a per-chain PROTOCOL SINGLETON, not a
  per-org module. Its address is CREATE3-derived from
  `(typeName="AuthorityRouterProxy", version="v1")` through the `DeterministicDeployer` at
  `0x4aC8B5ebEb9D8C3dE3180ddF381D552d59e8835a`, so it is **identical on gnosis and arbitrum-one**:

  ```
  salt  = keccak256("POA_IMPL" ++ keccak256("AuthorityRouterProxy") ++ keccak256("v1"))
        = 0x12ab87b08971ff580d5f490a8bbc45e833b42ef368e5728768ad4756d41d0f7d
  proxy = CREATE2(DeterministicDeployer, salt, solady CREATE3 proxy initcode hash)
        = 0x2d3406ae376dBea86F246D40cbC1189cea950de2
  ROUTER = CREATE(proxy, nonce 1)
        = 0x9591d1e139dcFBe0BA12D6477b85D1035a2417F1
  ```

  The derivation was validated against a live control: the same formula reproduces the deployed
  PaymasterHub v19 impl (`0xE398A26c044dbcfb12B4D1714c66029e7C84ADe7`) exactly.

  **`startBlock` in `networks.json` is a documented PLACEHOLDER** — the singleton has not been
  deployed yet (Access-v2 step-0 protocol wave). The values are the newest known infra block per
  chain (arbitrum-one `489000759`, gnosis `47420018`), which are always ≤ the eventual deploy block,
  so no event can be missed; they only cost a slightly longer scan. **Tighten them to the real
  deploy block before publishing** (see the gate below). If the protocol wave ships the router under
  a different `(typeName, version)`, the ADDRESS changes too and both files must be updated.

---

## 5. Deploy gate (do not skip — the app reads the gateway)

Ordering requirement from spec §6 step 0 item 7:

> the new subgraph version (authority template + fold mirror + perm entity + pending-action entity)
> must be published to **Studio AND the decentralized gateway on BOTH chains** BEFORE the first
> cutover proposal is created.

Concretely:

1. Land the router's real address/startBlock in `networks.json` after the step-0 protocol wave
   broadcasts (both chains).
2. `yarn codegen && yarn build && yarn test && subgraph-lint` from `pop-subgraph/`.
3. Deploy to Studio (`yarn deploy:gnosis`, `yarn deploy:arbitrum-one`; CI also does this on merge to
   main).
4. **Publish to The Graph Network** for both `poa-gnosis-v-1` and `poa-arb-v-1`. Studio deploys do
   NOT reach the app: the frontend reads the decentralized GATEWAY deployment. A cutover proposal
   created before the gateway publish would leave the UI blind to every subject/membership event of
   the ceremony.
5. Only then create the first org's cutover proposal.

Two build gotchas worth knowing:

* `yarn build:gnosis` / `yarn build:arbitrum-one` **rewrite `subgraph.yaml` in place** from
  `networks.json` (they strip comments and swap addresses). Restore the file afterwards
  (`git checkout pop-subgraph/subgraph.yaml`) — the committed manifest is the arbitrum-one base.
* Module-level constants must not call host imports. `BigInt.pow(...)` at module scope lands in the
  wasm `_start` and `scripts/check-wasm-start.mjs` rejects it (this once corrupted a production
  deploy), which is why the 2^N constants in `src/membership-authority.ts` are functions.

---

## 6. Tests

`yarn test` — 420 total (333 pre-existing + 87 new):

* `tests/membership-authority.test.ts` (71) — per-handler coverage, one test per FOLD ARM plus the
  precedence ordering, the accepted mirror (paused-seed flag, idempotent mints, unported burn,
  RoleWearer/User/HatLookup continuity), the §5 event-lag-window refolds, and the RULE-DELETION
  EVENT-LAW replays: one test per contract path that deletes a rule slot (renounce delegable vs
  sticky, soft remove, withdrawOffer, cancel-of-offer, unremove, finalize(Remove)), replaying the
  exact log sequence the contract emits.
* `tests/authority-router.test.ts` (5) — singleton wiring, bind-as-cutover-marker, unbind rollback,
  re-bind.
* `tests/access-v2-ceremony.test.ts` (11) — the integration replay of the REAL migration sequence
  from `script/accessv2/AccessV2MigrationBase.sol` (registration → admin-subject-first seed → role
  subjects → live-default adoption → perms/lint → memberships/bans/vouch/email → cutover in
  `_buildCutoverBatch` order: delta-seed, bind, unpause, toggle-off, verify — and **no burns**),
  asserting the whole entity graph; plus the delta-seed drift shape, the unported-wearer GHOST
  divergence the real ceremony leaves behind, the out-of-band `emitUnportedBurns` cleanup path, and
  the delegated pending-action lifecycle through finalize; plus the POST-CUTOVER OVERLAP suite
  (legacy renounceHat / mint / checkHatStatus poke against a bound id, the seed window before the
  bind, an unbind rollback, and a non-adopted hat of the same org).

`subgraph-lint`: 0 errors. The new mapping adds 13 `derived-field-guard` warnings — a heuristic that
asks for a child-entity helper call before every parent `save()`; they are false positives here.
Notably it reports **zero `undeclared-eth-call` warnings for the new files**, which is the
machine-checkable form of the zero-eth_calls rule.

---

## 7. Open items

1. **Router address/startBlock are pre-deployment.** Both must be re-confirmed against the actual
   step-0 broadcast before publishing. If the deploy uses a different `(typeName, version)` pair the
   address changes.
2. **Legacy vs v2 duality.** During the migration window an org can have BOTH a legacy
   `EligibilityModule` and a `MembershipAuthority`. Consumers should prefer
   `Organization.membershipAuthority` when non-null, and treat `RouterBinding.isBound` /
   `MembershipAuthorityContract.cutoverAt` as the switch-over marker. No entity was removed, so the
   legacy queries keep working for unmigrated orgs.
3. **Group membership is query-side.** No entity enumerates a group's users; derive it from the
   active member-roles' memberships. If a UI needs it precomputed, that is a follow-up (it would
   mean fanning every role membership change out across up to 8 groups per role).
4. **`Subject.acceptedUsers` is an array on a mutable entity.** Bounded by `memberCount` (live orgs
   are ~64 memberships total) and it is what makes the lag-window refold possible without derived
   -field iteration. If an org ever grows a role into the thousands, revisit with `store.loadRelated`.
5. **Unported-wearer GHOSTS survive the cutover.** A legacy wearer who is kicked/banned but still
   holds the un-burned Hats token (the issue-#166 class, real on KUBI today) is ported as a DENY
   rule and excluded from the delta (`balanceOf` reads 0), so no authority event ever touches their
   `RoleWearer` row: it stays `isActive = true` forever. Nothing in the ceremony clears it — R4
   removed the synthetic burns and toggle-off burns nothing (rollback depends on that). For a bound
   org, **read `SubjectMembership`, not `RoleWearer`**; an operator can also clear a specific ghost
   out of band with `emitUnportedBurns` (both shapes are tested).
6. **A chain-vs-subgraph differential test** (isMember vs the mirror over the migration corpus)
   lives on the contracts side of the spec's obligation list; the matchstick suite here pins the
   fold shape, not live parity.
7. **Base commit.** This branch is based on the local `6596132` (TaskManager v7 claim release), which
   is NOT an ancestor of `origin/main` (`359fb22`, the v20 paymaster rulebook work). Rebase before
   opening the PR.
