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

| Network | Subgraph slug |
| --- | --- |
| Arbitrum One | `poa-arb-v-1` |
| Gnosis | `poa-gnosis-v-1` |

Live query URLs are listed on each subgraph's page in [The Graph Studio](https://thegraph.com/studio/). Deployments are continuous: any merge to `main` that touches `pop-subgraph/**` triggers a build, test, and deploy via the workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

Hardcoded entry-point addresses live in [`pop-subgraph/networks.json`](pop-subgraph/networks.json). Everything else (per-org TaskManager, HybridVoting, EligibilityModule, etc.) is discovered dynamically via templates as orgs deploy.

---

## What gets indexed

The subgraph reads ~25 contract types and writes 100+ entity types into a single GraphQL schema rooted on `Organization`. The major domains:

- **Organizations & membership.** `Organization`, `User`, `Account` (universal username registry), `RoleWearer`, plus the per-org `OrgMetadata` from IPFS.
- **Roles & permissions.** Roles are [Hats](https://www.hatsprotocol.org/); the subgraph indexes the Hats v1 contract directly and joins it to per-org `Role` and `HatPermission` entities. Vouching is captured as `Vouch` and `RoleApplication` entities under `EligibilityModule`.
- **Voting.** `Proposal` and `Vote` for hybrid voting; `DDVProposal` and `DDVVote` for direct democracy. `VotingClass` records the per-class weighting (democracy, PT, ERC-20, optionally quadratic).
- **Tasks & projects.** `Project`, `Task`, `TaskApplication` with the IPFS `TaskMetadata`/`ProjectMetadata` payloads attached.
- **Participation Tokens.** `TokenBalance` and `TokenRequest` for the contribution-based governance currency.
- **Education.** `EducationModule` and `ModuleCompletion` for the learn-to-earn flow.
- **Payments & treasury.** `Distribution`, `Claim`, `Payment` for merkle-distribution payouts.
- **Gas sponsorship.** `PaymasterOrgConfig`, `PaymasterRule`, `PaymasterBudget`, `UsageEvent` for the ERC-4337 paymaster.
- **Identity & passkeys.** `Account`, `PasskeyAccount`, `PasskeyCredential`, `RecoveryRequest`.
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

- Node 18+ and **yarn** (1.x classic). If you don't have yarn: `npm i -g yarn`. This repo is yarn-only — `package-lock.json` is gitignored and CI keys its cache off `yarn.lock`.
- The Graph CLI is installed as a project dependency — no global install needed.
- Docker (only if you want to run a local Graph node).

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

If any of these fail on `main`, that's a release blocker; fix it before opening a PR. CI reproduces this sequence on every PR.

### Running against a local Graph node

`pop-subgraph/docker-compose.yml` spins up a graph-node + IPFS + Postgres stack pointed at `host.docker.internal:8545`. With a local node (Anvil, Hardhat) running on `:8545`:

```bash
cd pop-subgraph
docker compose up -d
yarn create-local
yarn deploy-local
```

Query the local subgraph at `http://localhost:8000/subgraphs/name/poa-arb-v-1`.

### Updating addresses for a new POP deployment

When POP redeploys, only the four hardcoded entry points need new addresses (everything else is discovered dynamically). The procedure — including the binary-search script for finding `startBlock` — is documented in [`CLAUDE.md`](CLAUDE.md) under *Updating the Subgraph for a New Deployment*.

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
