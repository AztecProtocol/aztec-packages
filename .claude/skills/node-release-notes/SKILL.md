---
name: node-release-notes
description: Generate release notes for the Aztec node (sequencer, validator, prover, archiver, p2p, world-state, L1 contracts, etc.) by analyzing commits in a git range filtered to node-relevant paths, fetching PR details from GitHub, and producing polished release notes grouped by component.
---

# Node Release Notes

Generate high-quality release notes for the Aztec node by analyzing commits filtered to node-relevant code paths. This is the operator-facing counterpart to the `framework-release-notes` skill.

## When to Use

- User asks for release notes, changelog, or "what changed" for the node
- Preparing a release summary for node operators, sequencer operators, or validators
- Reviewing what shipped between two points in time for the node binary or L1 contracts
- Writing upgrade notes tied to a protocol version bump

## Node Paths

These are the paths that constitute the "node" -- the surface area that node operators, sequencer operators, validators, and provers interact with:

```
# Core node and roles
yarn-project/aztec-node/                   # Main node package (aggregates archiver, world-state, p2p, sequencer)
yarn-project/sequencer-client/             # Block proposal / sequencing
yarn-project/validator-client/             # Block validation / attestations
yarn-project/validator-ha-signer/          # HA signing for validators
yarn-project/prover-client/                # Prover orchestration
yarn-project/prover-node/                  # Prover node binary
yarn-project/bb-prover/                    # Barretenberg prover integration
yarn-project/slasher/                      # Slashing logic

# Networking
yarn-project/p2p/                          # libp2p gossip, discovery, mempool
yarn-project/p2p-bootstrap/                # Bootstrap node
yarn-project/epoch-cache/                  # Epoch / committee caching

# Data and state
yarn-project/archiver/                     # L1 -> L2 data indexer
yarn-project/world-state/                  # Merkle tree state DB
yarn-project/merkle-tree/                  # Merkle tree primitives
yarn-project/kv-store/                     # KV storage layer
yarn-project/blob-sink/                    # Blob publishing / retention
yarn-project/blob-client/                  # Blob retrieval
yarn-project/blob-lib/                     # Shared blob utilities

# Shared node infrastructure
yarn-project/node-lib/                     # Shared node code
yarn-project/node-keystore/                # Node key management
yarn-project/ethereum/                     # L1 client / chain interactions
yarn-project/telemetry-client/             # Metrics / OTel
yarn-project/aztec/                        # Meta-package / binary entrypoint / sandbox
yarn-project/aztec-faucet/                 # Faucet service

# L1 and protocol
l1-contracts/                              # Solidity contracts (Rollup, Registry, Inbox, Outbox, FeeJuice, Slasher, Staking)
noir-projects/noir-protocol-circuits/      # Rollup / base / merge / root circuits
barretenberg/                              # Proving backend (cpp + ts)
avm-transpiler/                            # AVM bytecode transpiler
```

**Grey-zone paths** (affect both node and framework -- include only when relevant):

- `yarn-project/constants/` -- shared protocol constants. Node-relevant when constants change L1 behavior (block size, epoch length, fee params).
- `yarn-project/stdlib/` -- shared types. Rarely worth calling out for operators.
- `yarn-project/simulator/` -- used by both PXE and sequencer. Include when changes affect public execution or gas.

## Branch Topology

This repo has multiple long-lived branches with different roles:

| Branch           | Role                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `next`           | Main development branch (default branch, target for most PRs)                             |
| `v4`             | Stable v4 release branch (receives backports from v4-next)                                |
| `origin/v4-next` | Staging branch for v4 backports (accumulated backports land here first, then merge to v4) |
| `merge-train/*`  | Team-specific batching branches targeting `next`                                          |

**Node release tags** follow the same cadence as framework tags and are typically cut from `origin/v4-next` or `v4`. Always verify which branch a tag lives on:

```bash
git branch -a --contains <tag> | head -10
git log --oneline -1 <tag>
```

When the user specifies a tag as the starting point, determine the correct target:

- If the tag is on `origin/v4-next` → use `<tag>..origin/v4-next` as the range
- If the tag is on `v4` → use `<tag>..v4`
- If the tag is on `next` → use `<tag>..next`
- If unclear, ask the user which branch they want release notes for

## Steps

### 1. Determine the Git Range

Ask the user for the range if not provided. Common patterns:

- Between two tags: `v4.0.0..v4.1.0`
- Since a tag to its branch tip: `v4.0.0..origin/v4-next`
- Since a date: use `git log --after="2026-03-15" --format=%H | tail -1` to find the starting commit
- Between branches: `next..v4`

If the user says something like "since last release" or "what's new", check recent tags:

```bash
git tag --sort=-creatordate | head -10
```

**Important:** Always verify the tag exists and check its date to set expectations:

```bash
git log --oneline -1 <tag> --format='%ci'
```

Node releases often correspond to protocol version bumps. Check `yarn-project/constants/` or `l1-contracts/` for version constants when scoping the range.

### 2. Gather Commits

Use `scripts/commits` with the node paths and markdown + group-by-type flags.

**Important:** The `limit` (e.g., `500`) is a positional arg that MUST come immediately after the ref/range, before any flags. Also use `--no-first-parent` because backport branches use accumulated merge commits that hide individual changes behind a single "chore: Accumulated backports" entry.

```bash
python3 scripts/commits '<range>' 500 -m -g --no-first-parent \
  --paths 'yarn-project/aztec-node/' \
  --paths 'yarn-project/sequencer-client/' \
  --paths 'yarn-project/validator-client/' \
  --paths 'yarn-project/validator-ha-signer/' \
  --paths 'yarn-project/prover-client/' \
  --paths 'yarn-project/prover-node/' \
  --paths 'yarn-project/bb-prover/' \
  --paths 'yarn-project/slasher/' \
  --paths 'yarn-project/p2p/' \
  --paths 'yarn-project/p2p-bootstrap/' \
  --paths 'yarn-project/epoch-cache/' \
  --paths 'yarn-project/archiver/' \
  --paths 'yarn-project/world-state/' \
  --paths 'yarn-project/merkle-tree/' \
  --paths 'yarn-project/kv-store/' \
  --paths 'yarn-project/blob-sink/' \
  --paths 'yarn-project/blob-client/' \
  --paths 'yarn-project/blob-lib/' \
  --paths 'yarn-project/node-lib/' \
  --paths 'yarn-project/node-keystore/' \
  --paths 'yarn-project/ethereum/' \
  --paths 'yarn-project/telemetry-client/' \
  --paths 'yarn-project/aztec/' \
  --paths 'yarn-project/aztec-faucet/' \
  --paths 'l1-contracts/' \
  --paths 'noir-projects/noir-protocol-circuits/' \
  --paths 'barretenberg/' \
  --paths 'avm-transpiler/'
```

The `500` limit ensures you capture all commits in the range. Node ranges tend to be **larger** than framework ranges because barretenberg and protocol circuits are active -- bump the limit if the tail is truncated.

The output will be grouped by type (Breaking Changes, Features, Fixes, Refactors, etc.) with PR links.

**If the result shows very few commits** (< 5), the range may be too narrow. Check the dates of both endpoints and tell the user how much time the range covers. Offer to expand the range (e.g., use an earlier tag or a date-based starting point).

**If the result is empty but the range is non-trivial**, try without `--no-first-parent` -- the commits may all be direct pushes rather than merges. If still empty, the range endpoints may be on divergent branches (see Branch Topology above).

**If the result is overwhelming** (>200 commits), consider scoping tighter:

- Drop `barretenberg/` and `noir-projects/noir-protocol-circuits/` for operator-only notes
- Use `--grep 'feat|fix|perf|BREAKING'` to filter out pure internal churn
- Generate per-component passes and merge

### 3. Fetch PR Details for Important Changes

For each PR in the **Breaking Changes**, **Features**, and **Performance** sections, fetch the PR description:

```bash
gh pr view <PR_NUMBER> --json title,body,labels,files --jq '{title, body: .body[0:2000], labels: [.labels[].name], files: [.files[].path[0:80]]}'
```

Use the PR body to understand the intent and operator-facing impact. The commit message alone is often insufficient for release notes.

For **Fixes**, fetch PR details when:

- The fix touches consensus, p2p, or L1 contracts (always)
- The commit message is unclear about user impact
- The fix affects node configuration, CLI flags, or env vars

Skip fetching for **Chores**, **Refactors**, **Tests**, **CI**, and **Docs** unless they have operator-facing impact (e.g., new config flag, new metric, changed default).

### 4. Classify by Component

Reclassify each change by the node component it affects. Use the file paths from the commit or PR to determine:

| Component Tag          | Paths                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `[Sequencer]`          | `yarn-project/sequencer-client/`                                                       |
| `[Validator]`          | `yarn-project/validator-client/`, `yarn-project/validator-ha-signer/`                  |
| `[Prover]`             | `yarn-project/prover-client/`, `yarn-project/prover-node/`, `yarn-project/bb-prover/`  |
| `[P2P]`                | `yarn-project/p2p/`, `yarn-project/p2p-bootstrap/`, `yarn-project/epoch-cache/`        |
| `[Archiver]`           | `yarn-project/archiver/`                                                               |
| `[World State]`        | `yarn-project/world-state/`, `yarn-project/merkle-tree/`, `yarn-project/kv-store/`     |
| `[Blobs]`              | `yarn-project/blob-sink/`, `yarn-project/blob-client/`, `yarn-project/blob-lib/`       |
| `[L1 Contracts]`       | `l1-contracts/`                                                                        |
| `[Protocol Circuits]`  | `noir-projects/noir-protocol-circuits/`                                                |
| `[Barretenberg]`       | `barretenberg/`                                                                        |
| `[AVM]`                | `avm-transpiler/`, `barretenberg/*/vm2*`                                               |
| `[Slasher]`            | `yarn-project/slasher/`                                                                |
| `[Node]`               | `yarn-project/aztec-node/`, `yarn-project/node-lib/`, `yarn-project/node-keystore/`    |
| `[L1 Client]`          | `yarn-project/ethereum/`                                                               |
| `[Telemetry]`          | `yarn-project/telemetry-client/`                                                       |
| `[Operator]`           | `yarn-project/aztec/` (binary, sandbox, CLI startup), `yarn-project/aztec-faucet/`     |

A single PR may touch multiple components -- tag it with all relevant ones, but lead with the most impactful.

### 5. Draft Release Notes

Present a draft to the user in this format:

```markdown
# Node Release Notes: <range or version>

**Date:** <today>
**Commits:** <count> node-relevant commits
**Protocol version:** <vX.Y if applicable>
**L1 redeploy required:** <yes/no -- yes if l1-contracts/ has non-test changes>

## Breaking Changes

- **[Component]** Description of what changed and what operators need to do (config flag rename, storage migration, required L1 redeploy, etc.). ([#PR](url))

## Consensus / Protocol

_Changes that affect block production, validation, or L1 behavior. Operators running across the upgrade boundary must coordinate:_

- **[Component]** What changed and why it matters. ([#PR](url))

## New Features

- **[Component]** Description of the feature and why it matters. ([#PR](url))

## Performance

- **[Component]** Perf improvement, with before/after numbers if available. ([#PR](url))

## Bug Fixes

- **[Component]** What was broken and how it's fixed. ([#PR](url))

## Operator Notes

_Changes to config, CLI flags, env vars, metrics, logs, or default behavior:_

- Config key `foo.bar` renamed to `foo.baz`. ([#PR](url))
- New metric `aztec_p2p_peer_score`. ([#PR](url))

## Internal / Infrastructure

_Changes that don't directly affect operators but are worth noting:_

- Brief description ([#PR](url))
```

**Writing guidelines:**

- Lead with the operator impact, not the implementation detail
- For **Breaking Changes**, spell out the upgrade action: "redeploy L1 contracts", "reset world-state DB", "rename config key", "update bootnode ENR". Link to `docs/docs-node-operators/` or migration notes if they exist.
- For **Consensus / Protocol** changes, always call out whether coordinated upgrade is required. If a protocol version bump is involved, mention it explicitly.
- For **L1 Contracts** changes, determine whether a redeploy is required (any non-test solidity change) and flag it at the top of the notes.
- Skip commits that are purely internal (test infra, CI, typo fixes) unless the user asks for exhaustive notes
- Combine related commits (e.g., "feat: add X" + "fix: fix X edge case" = one entry)
- Use present tense ("Adds", "Fixes", "Removes")
- Keep each bullet to 1-2 sentences max
- Include before/after numbers for perf and resource-usage changes when available from the PR body

### 6. Review and Finalize

Present the draft and ask if the user wants to:

- Adjust any descriptions
- Include/exclude specific items (e.g., barretenberg internals often too noisy for operator-facing notes)
- Add context for specific changes
- Split into operator-facing vs internal-facing documents
- Write the output to a file

Only write to a file after the user approves the draft.

## Tips

- **Check for L1 redeploy signal early.** Any non-test change under `l1-contracts/src/` typically requires coordinated L1 redeploy. Flag this in the header before drafting bullets.
- **Watch for protocol version bumps.** Grep for changes to protocol version constants in `yarn-project/constants/` or `l1-contracts/` version headers. A bumped version implies an incompatible upgrade.
- If the range has very many commits (>150 node-relevant), summarize by component first, then expand on request.
- The `scripts/commits` `--grep` flag can further filter: `--grep 'feat|fix|perf|BREAKING'` for operator-facing changes only.
- For cross-referencing with node operator docs, check `docs/docs-node-operators/` -- some changes may already be documented there.
- If a commit references a backport (e.g., "backport #XXXX"), fetch the original PR for the full context.
- Barretenberg changes are often very noisy. For most operator-facing notes, only include barretenberg entries that change proof size, prover time, memory footprint, or verifier behavior -- skip pure refactors.
- The `updating-changelog` skill covers the node operator migration notes file -- if you spot a breaking change that isn't documented there, suggest adding it.
