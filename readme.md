# subgraph-pop

The Graph subgraph for the **Perpetual Organization Protocol (POP)** — the indexing layer that powers every list, dashboard, profile, and agent heartbeat across the Poa ecosystem.

If you've never heard of Poa, start with the [organization README](https://github.com/poa-box) — it explains *why* contribution-based, on-chain organizations exist and what POP does for them. This README is for people who want to query, run, or contribute to the subgraph itself.

[poa.box](https://poa.box) · [Discord](https://discord.gg/9SD6u4QjTt) · [@PoaPerpetual](https://x.com/PoaPerpetual)

---

## Where this repo fits

POP is split across a small number of repositories. Each one is independently useful; together they're the platform.

| Repo | Role |
| --- | --- |
| [poa-box/POP](https://github.com/poa-box/POP) | Solidity contracts: orgs, voting, vouching, tasks, education, treasury, agent identity. The source of truth for events this subgraph indexes. |
| **poa-box/subgraph-pop** *(you are here)* | The Graph subgraph that turns POP's events into a queryable GraphQL API. |
| [poa-box/Poa-frontend](https://github.com/poa-box/Poa-frontend) | The Next.js app at [poa.box](https://poa.box). Reads from this subgraph, writes to POP contracts. |
| [poa-box/poa-cli](https://github.com/poa-box/poa-cli) | Terminal-native interface and autonomous-agent framework. Also reads from this subgraph. |

When you change an event signature in POP, you'll change the ABI and handler here. When you add a new field to the schema here, the frontend and CLI gain a new thing to render. The three repos move together.

---

## Networks & deployments

POP is deployed on **Arbitrum One** (the identity home chain) and **Gnosis**. The subgraph follows, published to The Graph Studio under:

| Source directory | Network | Subgraph slug |
| --- | --- | --- |
| `pop-subgraph/` | Arbitrum One | `poa-arb-v-1` |
| `pop-subgraph/` | Gnosis | `poa-gnosis-v-1` |
| `peer-cashoutrelay-base/` | Base | `peer-cashoutrelay-base` |

`peer-cashoutrelay-base` is a separate, much smaller subgraph in this repo covering the CashOutRelay contract on Base. It shares the toolchain and CI but not the schema.

Live query URLs are listed on each subgraph's page in [The Graph Studio](https://thegraph.com/studio/). Deployments are continuous: a merge to `main` touching `pop-subgraph/**`, `peer-cashoutrelay-base/**`, `scripts/**`, or `.github/workflows/**` runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml). All three deploy jobs are *started*, but the reusable workflow they call filters by its own `working-directory`, so each one only builds, tests and deploys when that subgraph actually changed. A `pop-subgraph/**` change therefore does not redeploy the Base subgraph, and a `scripts/**` or workflow-only change deploys nothing — it just runs the `wasm-start-guard`.

Hardcoded entry-point addresses live in [`pop-subgraph/networks.json`](pop-subgraph/networks.json): `GovernanceFactory`, `PoaManager`, `ImplementationRegistry`, `PoaManagerHub`, `PoaManagerSatellite`, `Hats`, and `PoaDKIMRegistry`. Everything else (per-org TaskManager, HybridVoting, EligibilityModule, etc.) is discovered dynamically via templates as orgs deploy.

### RPC requirement: this subgraph needs an archive node

**The Ethereum RPC endpoint behind your graph-node must serve archive state and support [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898) block parameters.** This matters most for self-hosted graph-node deployments — Studio and Graph Network indexers generally provision archive nodes already, but if you point graph-node at your own RPC, it's on you.

Why: graph-node attaches the hash of the block *currently being indexed* to every `eth_call` a mapping makes, as an EIP-1898 block parameter. There is no "just read current state" call available from a handler — a call made while indexing block N is resolved against the state at block N, even when N is far behind the chain head. Pruned and full nodes keep only a short window of recent state (commonly ~128 blocks), so any call made while the subgraph is backfilling — which is every call during the initial sync — has no state to execute against and fails.

This subgraph does make such calls: nine `.bind()` sites across eight files in `pop-subgraph/src` (`participation-token.ts`, `hybrid-voting.ts`, `direct-democracy-voting.ts`, `eligibility-module.ts`, `org-registry.ts`, `poa-manager.ts` ×2, `paymaster-hub.ts`, `zk-email-invites.ts`), plus one in `peer-cashoutrelay-base/src/cash-out-relay.ts`. Run `grep -rn '\.bind(' pop-subgraph/src` for the current list.

**The failure mode is silent.** Every one of those calls is `try_`-guarded, so a revert is not an error — the guard skips the assignment, the handler returns normally, and indexing stays green. You do not get a failed subgraph; you get permanently missing fields. Concretely, on a non-archive endpoint:

- `ParticipationTokenContract.name` / `.symbol` stay as the empty strings seeded at deploy time, and the UI falls back to a placeholder forever.
- `ParticipationTokenContract.hatsContract` stays at the zero address. It is set only inside `initialize()`, is carried on no log and has no setter, so the `eth_call` is the *only* source for it. (`.executor` is safe: `OrgDeployed` carries it and `org-deployer.ts` seeds it directly — which is why no call is made for it.)
- Deploy-time `HatPermission` rows go missing: `Creator` for both `HybridVoting` and `DirectDemocracyVoting`, plus `Voter` for `DirectDemocracyVoting`. (HybridVoting voters are class-based, so there is no voting-hat array to read.)
- An EducationHub registered *after* its org was deployed gets no `HatPermission` rows at all: its initializer events are in an earlier block, outside the template's range, so `wirePostDeployModule` reads `creatorHatIds()` / `memberHatIds()` instead (`org-registry.ts`).
- `Role` data hydrated from `Hats.viewHat()` and the `PaymasterHub` config read in `handleInfrastructureDeployed` stay unpopulated.

If those fields are blank in a deployment, suspect the RPC before suspecting the mappings.

---

## What gets indexed

The subgraph reads 27 ABIs and writes ~157 entity types into a single GraphQL schema rooted on `Organization`. The major domains:

- **Organizations & membership.** `Organization`, `User`, `Account` (universal username registry), `RoleWearer`, plus the per-org `OrgMetadata` from IPFS.
- **Roles & permissions.** Roles are [Hats](https://www.hatsprotocol.org/); the subgraph indexes the Hats v1 contract directly and joins it to per-org `Role` and `HatPermission` entities. Vouching is captured as `Vouch` and `RoleApplication` entities under `EligibilityModule`.
- **Voting.** `Proposal` and `Vote` for hybrid voting; `DDVProposal` and `DDVVote` for direct democracy. `VotingClass` records the per-class weighting (democracy, PT, ERC-20, optionally quadratic).
- **Tasks & projects.** `Project`, `Task`, `TaskApplication` with the IPFS `TaskMetadata`/`ProjectMetadata` payloads attached.
- **Participation Tokens.** `TokenBalance` and `TokenRequest` for the contribution-based governance currency.
- **Education.** `EducationModule` and `ModuleCompletion` for the learn-to-earn flow.
- **Payments & treasury.** `Distribution`, `Claim`, `Payment` for merkle-distribution payouts.
- **Gas sponsorship.** `PaymasterOrgConfig`, `PaymasterRule`, `PaymasterBudget`, `UsageEvent` for the ERC-4337 paymaster.
- **Identity & passkeys.** `Account`, `PasskeyAccount`, `PasskeyCredential`, `RecoveryRequest`.
- **Email-based invites.** `ZkEmailInvites`, `ZkEmailClaim`, `ZkEmailRegisteredEmail`, `ZkEmailAllowlist`, plus `DkimRegistry`/`DkimKey` for the DKIM keys those proofs verify against.
- **Protocol upgrades.** `Beacon`, `BeaconUpgrade`, `ImplementationRegistryContract`, `ImplementationType`, `ImplementationVersion` — which implementation each org's proxies point at, and when it changed.
- **Cross-chain plumbing.** `PoaManagerHubContract`, `SatelliteRegistration`, and the cross-chain dispatch/receive event entities for hub-and-spoke deployment.

The full schema is in [`pop-subgraph/schema.graphql`](pop-subgraph/schema.graphql).

### A taste

```graphql
{
  organizations(first: 10, orderBy: deployedAt, orderDirection: desc) {
    id
    name
    metadata { description logo }
    roles {
      name
      wearers { wearer wearerUsername }
    }
    hybridVoting {
      proposals(first: 5, orderBy: createdAtBlock, orderDirection: desc) {
        title
        status
        winningOption
        wasExecuted
        votes { voter optionIndexes optionWeights }
      }
    }
  }
}
```

---

## Local development

All commands run from a subgraph directory (`pop-subgraph/` or `peer-cashoutrelay-base/`).

### Prerequisites

- **Node 20.18.1 or newer.** `@graphprotocol/graph-cli` declares `engines: { node: ">=20.18.1" }`, and CI runs Node 20. Older majors will fail on install or at runtime.
- **yarn** (1.x classic). If you don't have yarn: `npm i -g yarn`. This repo is yarn-only — `package-lock.json` is gitignored and CI keys its cache off `yarn.lock`.
- The Graph CLI is installed as a project dependency — no global install needed.
- Docker (only if you want to run a local Graph node).
- An **archive** RPC endpoint for whichever chain you index — see [RPC requirement](#rpc-requirement-this-subgraph-needs-an-archive-node) above.

### Setup

```bash
git clone https://github.com/poa-box/subgraph-pop.git
cd subgraph-pop/pop-subgraph    # or peer-cashoutrelay-base
yarn install
```

### The four-command loop

Run these in order — each step depends on the previous one. The CI runs the same sequence.

```bash
yarn codegen   # regenerate AssemblyScript types from schema.graphql + ABIs
yarn build     # compile to WASM
yarn test      # Matchstick unit tests
subgraph-lint  # repo-wide lint checks (shell function from the Poa toolchain, run inside the subgraph dir)
```

If any of these fail on `main`, that's a release blocker; fix it before opening a PR. CI reproduces this sequence on every PR, and adds one gate you can't reproduce with the four commands above:

```bash
node ../scripts/check-wasm-start.mjs build   # run from the subgraph dir, after yarn build
```

That guard rejects a module-level global initialised by a host call, which makes graph-node's allocator hand out an arena on top of the static data segment — string literals read back empty and indexing dies on the first trigger. It compiles, it passes matchstick, and it passes `subgraph-lint`, so it needs its own check. See [`scripts/check-wasm-start.mjs`](scripts/check-wasm-start.mjs).

### Running against a local Graph node

`pop-subgraph/docker-compose.yml` spins up a graph-node + IPFS + Postgres stack pointed at `host.docker.internal:8545`. With a local node (Anvil, Hardhat) running on `:8545`:

```bash
cd pop-subgraph
docker compose up -d
yarn create-local
yarn deploy-local
```

Query the local subgraph at `http://localhost:8000/subgraphs/name/poa-arb-v-1`.

Three things worth knowing:

1. **The chain name must match the manifest.** `docker-compose.yml` registers the chain as `arbitrum-one` (`ethereum: "arbitrum-one:http://host.docker.internal:8545"`), which is what every dataSource in `pop-subgraph/subgraph.yaml` declares, and `yarn deploy-local` passes no `--network`. graph-node rejects a manifest for a chain it has no configured provider for, so if you change one side you must change the other. Note that `graph build --network <x>` *rewrites* `subgraph.yaml` in place — the `build:*` and `deploy:*` scripts run `git checkout -- subgraph.yaml` afterwards to put it back, so don't be surprised if a network-specific build leaves the manifest looking untouched.
2. **Addresses and start blocks are live-network values.** `networks.json` points at the real Arbitrum One / Gnosis deployments (start blocks in the tens to hundreds of millions — ~447M/489M on Arbitrum One, ~45M on Gnosis). Against a local chain you need your own local addresses and near-zero start blocks. The procedure is in [`CLAUDE.md`](CLAUDE.md) under *Updating the Subgraph for a New Deployment*.
3. **Your `:8545` node still has to serve archive state** for every block indexed. A locally-mined Anvil/Hardhat chain does by default. If you *fork* a live chain instead, fork from an archive upstream — otherwise the `try_`-guarded `eth_call`s silently no-op and you'll debug missing fields that are really an RPC problem.

The stack bind-mounts its state into `pop-subgraph/data/` (gitignored). Delete that directory to reset IPFS and Postgres between runs.

### Updating addresses for a new POP deployment

When POP redeploys, only the hardcoded entry points in `networks.json` need new addresses — currently seven per network (`GovernanceFactory`, `PoaManager`, `ImplementationRegistry`, `PoaManagerHub`, `PoaManagerSatellite`, `Hats`, `PoaDKIMRegistry`). Everything else is discovered dynamically. The procedure — including the binary-search script for finding `startBlock` — is documented in [`CLAUDE.md`](CLAUDE.md) under *Updating the Subgraph for a New Deployment*.

---

## Contributing

Poa is built by its members. The fastest path in is a working diff.

### Good ways to start

- **Pick an open issue** in this repo or any of the [active repos](#where-this-repo-fits).
- **Add a missing event handler.** Compare `pop-subgraph/abis/*.json` against `pop-subgraph/subgraph.yaml` — if POP emits an event we don't index, that's a contribution-shaped hole. The walkthrough is in [`CLAUDE.md`](CLAUDE.md) under *Adding a New Event Handler*.
- **Improve test coverage.** Each handler should have a sibling `tests/<name>.test.ts` and `tests/<name>-utils.ts`. Gaps are easy to find and welcome.
- **Tighten the schema.** Helpful additions: derived fields, computed counts, indexes that speed up frontend queries.

### Workflow

1. Fork or branch off `main`.
2. Make the change. From the subgraph dir you touched, run `yarn codegen && yarn build && yarn test && subgraph-lint` — all four must pass.
3. Open a PR against `main`. CI will redeploy to Studio if it merges.
4. For protocol-level discussion, ABI changes, or larger refactors, open a thread in [Discord](https://discord.gg/9SD6u4QjTt) first — it's faster.
5. Once you're a Poa member, you'll vote on the org's roadmap and earn Participation Tokens for merged work. [Apply on-chain](https://www.poa.box/home/?org=Poa).

### House rules worth knowing before you start

These trip everyone up at least once:

- **`src/*.ts` files are AssemblyScript, not TypeScript.** No closures, no `Array.map`, no template literals, no `as` casting (use `changetype<T>()`), `BigInt` arithmetic uses `.plus()`/`.minus()` methods. Full list of gotchas in [`CLAUDE.md`](CLAUDE.md).
- **Users are only created in join handlers.** Other handlers must use `loadExistingUser()`, which returns `null` for non-members. Creating users elsewhere produces "phantom users" for contract addresses. Details in [`CLAUDE.md`](CLAUDE.md) under *User Creation Rules*.
- **Entity ID conventions are exact.** Mismatched IDs cause silent data loss — `entity.load()` returns `null` and writes go to a new entity. The canonical patterns are in [`CLAUDE.md`](CLAUDE.md) under *Entity ID Conventions*.

[`CLAUDE.md`](CLAUDE.md) is the deep-dive contributor reference. Read it before your first non-trivial change; it'll save you a debugging session.

---

## License

AGPL-3.0, matching the rest of the Poa stack. A `LICENSE` file will land here shortly; in the meantime see [poa-box/POP](https://github.com/poa-box/POP/blob/main/LICENSE) for the exact text.
