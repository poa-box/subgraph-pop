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
- `BigInt` creation: `BigInt.fromI32(0)`, not `BigInt.zero()`.
- `Bytes` comparison: `.equals()` method, not `==`.
- `Address` to string: `.toHexString()`. `BigInt` to string: `.toString()`.

## User Creation Rules

**Users are ONLY created in join event handlers** via `createUserOnJoin()` (`src/utils.ts`):

- `handleQuickJoined` / `handleQuickJoinedByMaster` (QuickJoin)
- `handleQuickJoinedWithPasskey` / `handleQuickJoinedWithPasskeyByMaster` (QuickJoin)
- `handleHatClaimed` (EligibilityModule)
- `handleInitialWearersAssigned` (OrgDeployer — joinMethod: "DeploymentMint")
- `handleHatsMinted` (Executor — joinMethod: "ExecutorMint")

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

**IPFS metadata entities**: Use CID string as ID (e.g., `"QmXxx..."`)

## Data Source Architecture

4 hardcoded dataSources in `subgraph.yaml` (addresses in `networks.json`):
- `GovernanceFactory`, `PoaManager`, `PoaManagerHub`, `PoaManagerSatellite`

Everything else is dynamically discovered via templates:
1. `PoaManager.InfrastructureDeployed` creates: OrgDeployer, OrgRegistry, PaymasterHub, UniversalAccountRegistry, PasskeyAccountFactory
2. `OrgDeployer.OrgDeployed` creates per-org: TaskManager, HybridVoting, DirectDemocracyVoting, EligibilityModule, ParticipationToken, QuickJoin, EducationHub, PaymentManager, Executor, ToggleModule

**Timing gotcha**: PaymasterHub and UniversalAccountRegistry emit `Initialized` events BEFORE `InfrastructureDeployed` creates their templates — those events are missed. `handleInfrastructureDeployed` compensates by reading initial state from the contracts directly via `try_` calls (`poa-manager.ts:147-196`).

## IPFS Metadata Pattern

Contract events emit `bytes32` (sha256 digest). `bytes32ToCid()` converts to CIDv0 by prepending `0x1220` and base58-encoding. This function is defined locally in each handler file that uses it (not in utils.ts): `hybrid-voting.ts`, `direct-democracy-voting.ts`, `org-registry.ts`, `eligibility-module.ts`, `education-hub.ts`, `task-manager.ts`.

**3-check pattern** (all required when creating IPFS data sources):
1. Skip zero hash: `if (hash.equals(ZERO_HASH)) return;`
2. Skip duplicates: `if (Entity.load(id) != null) return;`
3. Pass context: `DataSourceContext` with entity IDs so the IPFS handler can link metadata back

8 IPFS file templates: `OrgMetadata`, `HatMetadata`, `TaskMetadata`, `ProjectMetadata`, `ProposalMetadata`, `EducationModuleMetadata`, `TokenRequestMetadata`, `TaskApplicationMetadata`

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
7. IPFS metadata: follow the 3-check pattern above
8. Entity IDs: follow conventions above exactly
9. Add tests: mock event in `*-utils.ts`, test in `*.test.ts`
10. Verify: `codegen -> build -> test -> subgraph-lint`

## Updating the Subgraph for a New Deployment

When the user says "update the subgraph" and provides new contract addresses, follow this procedure:

### Step 1: Find the deployment startBlock

Use a binary search against the Hoodi RPC to find the block where the PoaManager contract was deployed. Use `https://hoodi.drpc.org` — this is the only Hoodi RPC that supports historical state queries (publicnode and ethpandaops do not).

Binary search script (use the PoaManager address from the new deployment):

```bash
CONTRACT="<PoaManager address>"
RPC="https://hoodi.drpc.org"
LOW=0
HIGH=$(curl -s -X POST "$RPC" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'], 16))")

while [ $LOW -lt $HIGH ]; do
  MID=$(( (LOW + HIGH) / 2 ))
  HEX=$(printf "0x%x" $MID)
  CODE=$(curl -s -X POST "$RPC" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$CONTRACT\",\"$HEX\"],\"id\":1}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('result','0x'))")
  if [ "$CODE" = "0x" ]; then
    LOW=$((MID + 1))
  else
    HIGH=$MID
  fi
done
echo "Deployment block: $LOW"
```

If you already know an approximate range (e.g., recent blocks), set LOW to a recent value to speed up the search.

Also find the GovernanceFactory startBlock using the same binary search with the GovernanceFactory address — it may differ by a few blocks from PoaManager.

### Step 2: Update `pop-subgraph/subgraph.yaml`

1. **Comment block at top**: Replace ALL contract addresses with the new addresses. Update the deployment block number in the header line.
2. **GovernanceFactory dataSource**: Update `address` and `startBlock`.
3. **PoaManager dataSource**: Update `address` and `startBlock`.
4. **PoaManagerHub dataSource**: Update `address` and `startBlock` (if provided).
5. **PoaManagerSatellite dataSource**: Update `address` and `startBlock` (use zero address `0x000...` if not deployed on this network).

All other contracts are discovered dynamically via `InfrastructureDeployed` and do NOT need hardcoded entries.

### Step 3: Update `pop-subgraph/networks.json`

Update all 4 entries for the target network:

```json
{
  "network-name": {
    "GovernanceFactory": { "address": "<addr>", "startBlock": <block> },
    "PoaManager": { "address": "<addr>", "startBlock": <block> },
    "PoaManagerHub": { "address": "<addr>", "startBlock": <block> },
    "PoaManagerSatellite": { "address": "<addr>", "startBlock": <block> }
  }
}
```

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

The critical ones for config: **PoaManager**, **GovernanceFactory**, **PoaManagerHub**, **PoaManagerSatellite**. The rest only go in the comment block.
