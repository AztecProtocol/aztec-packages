---
name: genesis-constants
description: Regenerate the canonical genesis (protocol/genesis/genesis.json, the @aztec-foundation/protocol-genesis package with the genesis nullifiers and the nullifier tree root, block header hash and archive root), the C++ genesis seed vectors, and the L1 checkpoint fixtures. Use when a protocol contract, the Noir compiler, or the AVM transpiler changed and the genesis check or a genesis root assertion fails, on a request to "regenerate the genesis constants/roots", or when the precommit reminder about rotating a protocol class id fires.
---

# Genesis constants

A production network's genesis world state seeds the protocol contracts' registration nullifiers. Those are
derived from the protocol contract **class ids**, so anything that rotates a class id — a protocol contract
source change, a compiler bump, a transpiler change — moves the genesis roots with it.

Run the single source-of-truth script:

```bash
noir-projects/fnd/scripts/regenerate_genesis_constants.sh --fixtures
```

It derives the protocol contracts' registration nullifiers with barretenberg, measures the roots with the reference
world state, rewrites every generated file from that one measurement, and stages the result. It does not commit.

| flag | effect |
| --- | --- |
| *(none)* | rewrites the genesis package and the C++ seed vectors; reports the L1 fixtures as outstanding |
| `--fixtures` | also regenerates the six L1 checkpoint fixtures. Needs `anvil` on `PATH`; takes a few minutes |
| `--check` | measures and compares only, writes nothing, exits non-zero if anything is stale. CI runs it as `make fnd-genesis-tests` |

## Prerequisites

Barretenberg derives the protocol contracts' registration nullifiers from their built artifacts (bb.js), and the
reference world state (wsdb-ref) measures the roots from them, so those must be built first:

```bash
make noir-projects-fnd bb-ts bb-wsdb-ref
```

`--fixtures` still runs a labs test, so it also needs `make labs-yarn-project`. The script warns when the protocol
contract sources are newer than their artifacts. It is fail-fast throughout: a missing dependency, a failed measurement, or a replacement that did not
match is a hard error, because a half-applied regeneration leaves genesis values that disagree with each other.

## What it rewrites

1. `protocol/genesis/genesis.json` and `index.js` — the `@aztec-foundation/protocol-genesis` package: the world
   state inputs (tree heights, prefill sizes, the six nullifiers, no public data, timestamp 0) and the nullifier
   tree root, genesis block header hash and archive root they produce. Labs reads the genesis from here, and
   l1-contracts generates its test constant `GenesisGen.sol` from it at build time. It is deliberately not in
   `constants.nr`: the protocol contracts are compiled against the constants, so the genesis derived from them
   cannot feed back into the constants.
2. `barretenberg/cpp/src/barretenberg/world_state_reference/genesis_protocol_nullifiers.hpp` and
   `native-packages/wsdb/cpp/src/world_state/genesis_protocol_nullifiers.hpp` — the same values for the C++
   world-state tests.
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

- `regenerate_genesis_constants.sh --check` (CI: `make fnd-genesis-tests`) — the drift detector: it re-derives the
  genesis from the built protocol contracts and compares it with every generated file.
- `world_state_reference_tests` and `wsdb_ref_tests` (bb), `world_state_tests` (wsdb) — each world state builds the
  genesis from the seed vector and must report the same roots.
- `world-state/src/testing.test.ts` (labs) — the native world state, started from the package's inputs, must report
  the package's archive root.
- `forge test --match-contract 'CheckpointPreflight|Rollup'` (L1, against the regenerated fixtures)

## Why this is breaking

The genesis archive root is what a rollup stores in `archives[0]` at deployment, and that slot is immutable. New
roots therefore apply only to a network initialized from the new genesis; already-deployed networks keep theirs.
