---
name: genesis-constants
description: Regenerate the canonical genesis constants (GENESIS_NULLIFIER_TREE_ROOT, GENESIS_BLOCK_HEADER_HASH, GENESIS_ARCHIVE_ROOT), the C++ genesis seed vector, and the L1 checkpoint fixtures. Use when a protocol contract, the Noir compiler, or the AVM transpiler changed and a genesis root assertion fails, on a request to "regenerate the genesis constants/roots", or when the precommit reminder about rotating a protocol class id fires.
---

# Genesis constants

A production network's genesis world state seeds the protocol contracts' registration nullifiers. Those are
derived from the protocol contract **class ids**, so anything that rotates a class id — a protocol contract
source change, a compiler bump, a transpiler change — moves the genesis roots with it.

Run the single source-of-truth script:

```bash
noir-projects/fnd/scripts/regenerate_genesis_constants.sh --fixtures
```

It measures the canonical genesis from a real ephemeral world state, rewrites every pinned site, re-runs the
constants generators in the right order, verifies the derived outputs picked up the new values, and stages the
result. It does not commit.

| flag | effect |
| --- | --- |
| *(none)* | rewrites the constants and the C++ seed vector; reports the L1 fixtures as outstanding |
| `--fixtures` | also regenerates the six L1 checkpoint fixtures. Needs `anvil` on `PATH`; takes a few minutes |
| `--check` | measures and compares only, writes nothing, exits non-zero if anything is stale |

## Prerequisites

The measurement runs through the built client, so the tree must be built first:

```bash
make labs-yarn-project
```

The script refuses to run against a build older than the protocol contract sources, rather than reporting stale
numbers. It is fail-fast throughout: a missing dependency, a failed measurement, or a replacement that did not
match is a hard error, because a half-applied regeneration leaves constants that disagree with each other.

## What it rewrites

1. `noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr` — the three `GENESIS_*` constants.
   Everything else derives from here: `aztec_constants.hpp`, `ConstantsGen.sol`, labs' `constants.gen.ts`.
2. `barretenberg/cpp/src/barretenberg/world_state/genesis_protocol_nullifiers.hpp` — the seed vector the C++
   world-state test builds its genesis from.
3. `l1-contracts/test/fixtures/{empty,mixed,single_tx}_checkpoint_{1,2}.json` — with `--fixtures`. All six move:
   checkpoint 1 of each family starts from the genesis archive, and checkpoint 2 chains off checkpoint 1.

Their producer picks a wall-clock timestamp and a random coinbase and fee recipient per run, so `--fixtures`
rewrites all six every time, whether or not the genesis actually moved. Only `lastArchiveRoot` is stable, which is
what `--check` keys on. Do not pass `--fixtures` unless the roots really moved — otherwise you commit pure churn.

## What it deliberately does NOT rewrite

`mainnet_compatibility.test.ts` and `testnet_compatibility.test.ts` in `labs/yarn-project/aztec/src/` pin what a
**live network was actually deployed with** — its VK tree root, protocol contracts hash and genesis archive root.
A class id rotation will make those fail too. That is correct and expected: they change only at a governance
upgrade. Never "fix" them by pasting in the new values; that silently claims the deployed network moved.

## Verifying

After regenerating, the tests that assert these values are:

- `nargo test --package types hash_of_genesis` (Noir)
- `world_state_tests --gtest_filter='*GetInitialTreeInfoForAllTrees*'` (C++)
- `world-state/src/testing.test.ts` (labs — this is the one that compares a live genesis against the pinned
  `GENESIS_ARCHIVE_ROOT`, i.e. the real drift detector)
- `forge test --match-contract 'CheckpointPreflight|Rollup'` (L1, against the regenerated fixtures)

Note that `protocol-contracts/src/genesis_data.test.ts` does **not** detect drift: `protocol_contract_data.ts` is
generated at build time from the same artifacts it recomputes from, so both sides move together.

## Why this is breaking

The genesis archive root is what a rollup stores in `archives[0]` at deployment, and that slot is immutable. New
roots therefore apply only to a network initialized from the new genesis; already-deployed networks keep theirs.
