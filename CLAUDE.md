# POP Subgraph

Graph Protocol subgraph for the Perpetual Organization Protocol (POP) — worker and community-owned DAOs. Deployed on arbitrum-one and gnosis (per-network config in `networks.json`).

## Commands

This repo uses **yarn** (1.x classic). The CI's `actions/setup-node` cache key is `yarn.lock`, and `package-lock.json` is gitignored — do NOT run `npm install`. If you don't have yarn: `npm i -g yarn`.

All commands run from the relevant subgraph directory (`pop-subgraph/` or `peer-cashoutrelay-base/`):

```bash
yarn install       # Install deps. Run once after cloning or after dep changes.
yarn codegen       # Generate types from schema.graphql + ABIs. Re-run after ANY schema/ABI/subgraph.yaml change.
yarn build         # Compile AssemblyScript to WASM
yarn test          # Matchstick v0.6.0 unit tests
subgraph-lint      # Shell function (not a yarn package) — must run from the subgraph directory
```

## Before Creating a PR

Run in order (each depends on the previous):

```bash
cd <subgraph-dir>   # pop-subgraph/ or peer-cashoutrelay-base/
yarn codegen
yarn build
yarn test
subgraph-lint
```

## AssemblyScript — NOT TypeScript

All `src/*.ts` files are **AssemblyScript**. It looks like TypeScript but has critical differences:

- No closures or lambdas. No `Array.map()`, `.filter()`, `.reduce()` — use `for` loops.
- No template literals. Use string concatenation with `+`.
- Nullable types: `Type | null` (not `Type?` or `Optional<Type>`).
- Type casting: `changetype<TargetType>(value)` (not `as TargetType`).
- `BigInt` arithmetic: `.plus()`, `.minus()`, `.times()`, `.div()`. No operators.
- `BigInt` creation: prefer `BigInt.fromI32(0)` for consistency, but `BigInt.zero()` is valid in graph-ts 0.37 and is used in `implementation-registry.ts` / `poa-dkim-registry.ts`. Neither is a bug.
- `Bytes` comparison: `==` and `!=` ARE content comparison — graph-ts declares `@operator('==')` / `@operator('!=')` on `ByteArray` (`common/collections.ts`), which `Bytes` and `Address` extend. Use `.equals()` when the static type is nullable (`Bytes | null`): AssemblyScript does not apply operator overloads to nullable types.
- `Address` to string: `.toHexString()`. `BigInt` to string: `.toString()`.

## User Creation Rules

**Users are ONLY created in join event handlers** via `createUserOnJoin()` (`src/utils.ts`):

- `handleQuickJoined` / `handleQuickJoinedByMaster` / `handleRegisterAndQuickJoined` (QuickJoin — joinMethod: "QuickJoin")
- `handleQuickJoinedWithPasskeyByMaster` / `handleRegisterAndQuickJoinedWithPasskey` / `handleRegisterAndQuickJoinedWithPasskeyByMaster` (QuickJoin — joinMethod: "QuickJoinWithPasskey")
- `handleHatClaimed` (EligibilityModule — joinMethod: "HatClaim")
- `handleInitialWearersAssigned` (OrgDeployer — joinMethod: "DeploymentMint")
- `handleHatsMinted` (Executor — joinMethod: "ExecutorMint")

One exception: `applyHatTransferAdd()` (`src/utils.ts`, called from the `Hats` dataSource in `src/hats.ts`) creates a User inline with joinMethod `"HatTransfer"` when a hat is minted/transferred to a wallet that has no User yet. It is still gated by `isSystemContract()`.

**For all other handlers** (voting, tasks, payments, etc.): use `loadExistingUser()`. It returns `null` if the user hasn't joined — this prevents "phantom users" (entities for contract addresses or non-members).

`getOrCreateUser()` is **deprecated** — it silently delegates to `loadExistingUser()` and will NOT create users. Don't use it for new code.

System contracts (Executor, EligibilityModule addresses) are **never** indexed as Users. Guard functions: `isSystemContract()`, `shouldCreateRoleWearer()`.

## Entity ID Conventions

Mismatched IDs cause silent data loss (entity.load() returns null). Follow these exact patterns:

**Mutable entities** (loaded by ID for updates):
- `User`: `orgId.toHexString() + "-" + address.toHexString()`
- `Role`: `orgId.toHexString() + "-" + hatId.toString()`
- `RoleWearer`: `orgId.toHexString() + "-" + hatId.toString() + "-" + address.toHexString()`
- `Organization`: `orgId` (Bytes)
- `Contract entities`: `contractAddress` (Bytes)
- `Project`: `taskManager.toHexString() + "-" + projectId.toHexString()`
- `Task`: `taskManager.toHexString() + "-" + taskId.toString()`
- `Proposal`: `hybridVoting.toHexString() + "-" + proposalId.toString()`
- `Vote`: `hybridVoting.toHexString() + "-" + proposalId.toString() + "-" + voter.toHexString()`
- `HatPermission`: `contractAddress.toHexString() + "-" + hatId.toString() + "-" + permissionRole`
- `Beacon`: `dataSource.network() + "-" + typeId.toHexString()`

**Immutable entities** (append-only, never loaded by ID):
- Default: `event.transaction.hash.concatI32(event.logIndex.toI32())`
- `UserHatChange` (bulk events): append `.concat(Bytes.fromUTF8(userId)).concat(Bytes.fromBigInt(hatId))`

**IPFS metadata entities**: scope the ID by the owner the file handler writes, then the CID — `taskId + "-" + cid` (`TaskMetadata`), `orgId.toHexString() + "-" + cid` (`OrgMetadata`), `moduleAddress.toHexString() + "-" + cid` (`ZkEmailAllowlist`). `ProposalMetadata` uses the owner id alone (`proposalEntityId`). Bare CID ONLY where the handler writes no owner pointer: `TokenRequestMetadata`, `TaskApplicationMetadata`. See "File data source context rule" below — ID scoping and context must match exactly.

## Data Source Architecture

7 hardcoded dataSources in `subgraph.yaml` (addresses in `networks.json`):
- `GovernanceFactory`, `PoaManager`, `ImplementationRegistry`, `PoaManagerHub`, `PoaManagerSatellite`, `Hats`, `PoaDKIMRegistry`

`networks.json` must carry all 7 under EVERY network (`arbitrum-one`, `gnosis`). `graph build --network X` / `graph deploy --network X` hard-throws ``'<name>' was not found in the '<network>' configuration, please update!`` if a manifest dataSource has no entry. For a contract not deployed on a network, use the zero address with the PoaManager startBlock — that is what `PoaManagerHub` does on gnosis and `PoaManagerSatellite` on arbitrum-one.

Everything else is dynamically discovered via templates:
1. `PoaManager.InfrastructureDeployed` creates: both generation-specific listeners at the same
   deployer proxy (`OrgDeployer` for the legacy event topic and `OrgDeployerV2` for Kyoto), plus
   OrgRegistry, PaymasterHub, UniversalAccountRegistry, and PasskeyAccountFactory.
2. Legacy `OrgDeployer.OrgDeployed` creates per-org: TaskManager, HybridVoting,
   DirectDemocracyVoting, EligibilityModule, ParticipationToken, QuickJoin, EducationHub,
   PaymentManager, Executor, and ToggleModule.
3. Kyoto `OrgDeployerV2.OrgDeployed` creates the same functional-module entities/templates but
   wires MembershipAuthority instead of EligibilityModule/ToggleModule. Native-v2 subject ids are
   mirrored into legacy `Role`/`RoleWearer` ids only for continuity; GROUP subjects never become
   Hats or Roles. Its `GroupsCreated` handler indexes group composition. `RolesCreated` and
   `InitialWearersAssigned` retain their legacy ABI topics, so the legacy template receives them and
   dispatches by `Organization.membershipAuthority`.

The native-v2 authority is active from genesis: it self-routes through embedded subject ids and has
no migration `AuthorityBound` event. `OrgDeployerV2` therefore records `isRouterBound = true` and
`cutoverAt = deployedAt`, while leaving `routerBinding` null. MembershipAuthority's
`ContractRegistered` remains the primary template-creation point; the v2 deploy handler creates it
only as a fallback to avoid duplicate dynamic sources.

**Timing gotcha**: PaymasterHub and UniversalAccountRegistry are initialized in an EARLIER BLOCK than `InfrastructureDeployed`, so their `Initialized` logs never reach the templates. `handleInfrastructureDeployed` (`poa-manager.ts`) compensates by reading initial state from the contracts via `try_` calls. This applies to cross-block misses only — a template DOES receive logs from earlier in the SAME block, including earlier logs in the creating transaction, so do not add a `try_` backfill for a same-block "missed" event.

## IPFS Metadata Pattern

Contract events emit `bytes32` (sha256 digest). `bytes32ToCid()` converts to CIDv0 by prepending `0x1220` and base58-encoding. This function is defined locally in each handler file that uses it (not in utils.ts) — 8 files: `hybrid-voting.ts`, `direct-democracy-voting.ts`, `org-registry.ts`, `eligibility-module.ts`, `education-hub.ts`, `task-manager.ts`, `universal-account-registry.ts`, `zk-email-invites.ts`.

**Checklist when creating an IPFS data source:**
1. Skip zero hash: `if (hash.equals(ZERO_HASH)) return;`
2. Context: every value must be CONSTANT for a given entity ID. Pass the owner ids the file handler writes onto the entity; pass none (`Template.create(cid)`) if it writes no owner pointer.
3. Entity ID: scope by those same owner ids.
4. `Entity.load()` guard: keep it, but only as a same-region safety net — it does NOT dedupe across data sources (see below).

### File data source context rule

graph-node dedupes file data sources by `(template, CID, context)` and runs each in its own causality region — a file handler cannot read entities written by chain handlers or by other file data sources.

- The real rule: **every context value must be a function of the entity ID** — constant for a given ID. A key that can VARY across references to the same `(template, CID, owner)` spawns a second data source that writes the same ID. So the context must carry the owner values the handler writes onto the entity, and the entity ID must be scoped by those same values.
- An extra key that is constant per owner is harmless, not a bug: both `ProposalMetadata` spawn sites pass `proposalType` (`hybrid-voting.ts` / `direct-democracy-voting.ts`) which the handler never reads. The proposal ID is prefixed by the voting-contract address, so `proposalType` can never diverge for a fixed ID. Do not "fix" these.
- If the handler writes no owner pointer, pass NO context. `TokenRequestMetadata` and `TaskApplicationMetadata` are the two that do this.
- NEVER put a per-block value (`event.block.timestamp`, `blockNumber`) in a context: it differs every block, defeats dedup, and makes two data sources INSERT the same ID — which halts indexing when the target is immutable.
- An in-handler `Entity.load()` guard CANNOT prevent this. It runs in the onchain causality region and never sees file-data-source writes.

Reference implementations: `createTaskMetadataSource` in `task-manager.ts` and `src/org-metadata.ts` (both carry the reasoning inline).

10 IPFS file templates: `OrgMetadata`, `HatMetadata`, `TaskMetadata`, `ProjectMetadata`, `ProposalMetadata`, `EducationModuleMetadata`, `ZkEmailAllowlist`, `TokenRequestMetadata`, `TaskApplicationMetadata`, `AccountMetadata`

## Consolidated Entities

These entities aggregate data across multiple contract types, all via `utils.ts` helpers:
- `HatPermission` — permissions across HybridVoting, DDV, ParticipationToken, QuickJoin, EducationHub (`createHatPermission`)
- `ExecutorChange` — executor updates across DDV, QuickJoin, EducationHub (`createExecutorChange`)
- `PauseEvent` — pause/unpause across Executor, EducationHub (`createPauseEvent`)

## Testing Patterns

Matchstick v0.6.0 framework. File naming:
- Handler: `src/quick-join.ts` -> Test: `tests/quick-join.test.ts` -> Mocks: `tests/quick-join-utils.ts`

Mock event pattern:
```typescript
let event = changetype<EventType>(newMockEvent());
event.parameters = new Array();
event.parameters.push(new ethereum.EventParam("name", ethereum.Value.fromAddress(value)));
```

Test setup: `setupXxxEntities()` creates prerequisite entities (Organization, contracts). `afterEach: clearStore()`. Default mock event address: `0xa16081f360e3847006db660bae1c6d1b2e17ec2a`.

## Adding a New Event Handler

1. Add event signature to `subgraph.yaml` — under the correct **template** (not dataSources) unless it's a new hardcoded source
2. Run `yarn codegen` to generate the event type
3. Create handler in the appropriate `src/*.ts` file
4. Load contract entity by `event.address` to get orgId — **always null-check**
5. User linking: join events use `createUserOnJoin()`, activity events use `loadExistingUser()`
6. Hat events: call `shouldCreateRoleWearer()` before creating RoleWearer entities
7. IPFS metadata: follow the checklist and the file data source context rule above
8. Entity IDs: follow conventions above exactly
9. Add tests: mock event in `*-utils.ts`, test in `*.test.ts`
10. Verify: `codegen -> build -> test -> subgraph-lint`

## Updating the Subgraph for a New Deployment

When the user says "update the subgraph" and provides new contract addresses, follow this procedure:

### Step 1: Find the deployment startBlock

Binary-search `eth_getCode` for the block where the contract first has code. Pick the RPC for the network you are updating — it MUST be an archive node, or historical `eth_getCode` answers with a JSON-RPC error instead of a result:

- `arbitrum-one`: `https://arbitrum-one.public.blastapi.io` (backup `https://arbitrum.drpc.org` — archival, but it can throw a transient internal error mid-search). Do NOT use `https://arb1.arbitrum.io/rpc` or `https://1rpc.io/arb` — pruned, they answer `missing trie node`.
- `gnosis`: `https://rpc.gnosischain.com` (backup `https://gnosis.drpc.org`).

Both failure modes must abort loudly. Never map an RPC error (or a missing `result`) to `"0x"`: the loop only advances `LOW` on `"0x"`, so a wrong chain or a pruned node silently converges `LOW` on the chain head and prints a garbage block. Save this as a file and run it — it uses `exit`, so pasting it into an interactive shell will close the shell.

```bash
RPC="https://arbitrum-one.public.blastapi.io"   # or the gnosis RPC above
CONTRACT="<PoaManager address>"

rpc_getcode() {  # $1 = decimal block number, or "latest"
  local blk="$1"
  [ "$blk" = "latest" ] || blk=$(printf "0x%x" "$blk")
  curl -s -X POST "$RPC" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$CONTRACT\",\"$blk\"],\"id\":1}" \
  | python3 -c 'import sys, json
r = json.load(sys.stdin)
if "error" in r: sys.exit("RPC ERROR (pruned node, rate limit, or bad request): " + json.dumps(r["error"]))
print(r["result"])'
}

# Abort if the contract is not on this chain at all.
CODE=$(rpc_getcode latest) || exit 1
if [ "$CODE" = "0x" ]; then
  echo "ABORT: no code at $CONTRACT on $RPC at head block — wrong network or wrong address." >&2
  exit 1
fi

LOW=0
# Must be guarded exactly like rpc_getcode: a bare assignment swallows the failure, so an RPC
# error or malformed body would leave HIGH empty, skip the loop entirely, and print
# "Deployment block: 0" as if it had succeeded.
HIGH=$(curl -s -X POST "$RPC" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | python3 -c 'import sys, json
r = json.load(sys.stdin)
if "error" in r or "result" not in r: sys.exit("RPC ERROR fetching chain head: " + json.dumps(r))
print(int(r["result"], 16))') || exit 1
case "$HIGH" in
  ''|*[!0-9]*) echo "ABORT: could not read chain head from $RPC (got '$HIGH')." >&2; exit 1 ;;
esac

while [ $LOW -lt $HIGH ]; do
  MID=$(( (LOW + HIGH) / 2 ))
  CODE=$(rpc_getcode $MID) || exit 1
  if [ "$CODE" = "0x" ]; then
    LOW=$((MID + 1))
  else
    HIGH=$MID
  fi
done
echo "Deployment block: $LOW"
```

Sanity check before trusting a new number: the script returns `447059849` for the current arbitrum-one PoaManager and `45407962` for the gnosis one — the startBlocks already in `networks.json`.

If you already know an approximate range (e.g., recent blocks), set LOW to a recent value to speed up the search.

Repeat for every dataSource whose address changed (GovernanceFactory, ImplementationRegistry, PoaManagerHub, PoaManagerSatellite) — startBlocks differ by a few blocks from PoaManager.

### Step 2: Update `pop-subgraph/subgraph.yaml`

The manifest has no comment block or address header — edit the `source:` blocks directly. The checked-in values are the `arbitrum-one` ones; `graph build --network gnosis` rewrites them from `networks.json`.

1. **GovernanceFactory dataSource**: Update `address` and `startBlock`.
2. **PoaManager dataSource**: Update `address` and `startBlock`.
3. **ImplementationRegistry dataSource**: Update `address` and `startBlock`.
4. **PoaManagerHub dataSource**: Update `address` and `startBlock` (if provided).
5. **PoaManagerSatellite dataSource**: Update `address` and `startBlock` (use zero address `0x000...` if not deployed on this network).
6. **Hats / PoaDKIMRegistry dataSources**: leave the addresses alone unless the deploy actually moved them — both are currently the same address on arbitrum-one and gnosis.

All other contracts are discovered dynamically via `InfrastructureDeployed` and do NOT need hardcoded entries.

### Step 3: Update `pop-subgraph/networks.json`

Every dataSource in the manifest needs an entry under the target network — all 7, or `graph build --network <net>` throws:

```json
{
  "network-name": {
    "GovernanceFactory": { "address": "<addr>", "startBlock": <block> },
    "PoaManager": { "address": "<addr>", "startBlock": <block> },
    "ImplementationRegistry": { "address": "<addr>", "startBlock": <block> },
    "PoaManagerHub": { "address": "<addr>", "startBlock": <block> },
    "PoaManagerSatellite": { "address": "<addr>", "startBlock": <block> },
    "Hats": { "address": "<addr>", "startBlock": <block> },
    "PoaDKIMRegistry": { "address": "<addr>", "startBlock": <block> }
  }
}
```

Not-deployed-here contracts still need an entry: zero address + the PoaManager startBlock (see `PoaManagerHub` on gnosis, `PoaManagerSatellite` on arbitrum-one).

### Step 4: Verify the build

```bash
cd pop-subgraph
yarn codegen
yarn build
yarn test
subgraph-lint
```

### Expected contract list from the user

The user will provide addresses in roughly this format (order may vary):

- HybridVoting, DirectDemocracyVoting, Executor, QuickJoin, ParticipationToken
- TaskManager, EducationHub, PaymentManager, UniversalAccountRegistry
- EligibilityModule, ToggleModule, PasskeyAccount, PasskeyAccountFactory
- ImplementationRegistry, OrgRegistry, OrgDeployer, PoaManager
- BeaconProxy (multiple), GovernanceFactory, AccessFactory, ModulesFactory
- HatsTreeSetup, PaymasterHub

Only these go in `subgraph.yaml` / `networks.json`: **PoaManager**, **GovernanceFactory**, **ImplementationRegistry**, **PoaManagerHub**, **PoaManagerSatellite**, plus the unchanged **Hats** and **PoaDKIMRegistry**. The rest are discovered at runtime — record them nowhere.
