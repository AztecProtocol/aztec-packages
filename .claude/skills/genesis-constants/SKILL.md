---
name: genesis-constants
description: Regenerate the canonical genesis (protocol/genesis/genesis.json, the @aztec-foundation/protocol-genesis package with the genesis nullifiers and the nullifier tree root, block header hash and archive root). Use when a protocol contract, the Noir compiler, or the AVM transpiler changed and the genesis check or a genesis root assertion fails, on a request to "regenerate the genesis constants/roots", or when the precommit reminder about rotating a protocol class id fires.
---

# Genesis constants

A production network's genesis world state seeds the protocol contracts' registration nullifiers. Those are
derived from the protocol contract **class ids**, so anything that rotates a class id — a protocol contract
source change, a compiler bump, a transpiler change — moves the genesis roots with it.

Run the single source-of-truth script:

```bash
noir-projects/fnd/scripts/regenerate_genesis_constants.sh
```

It derives the protocol contracts' registration nullifiers with barretenberg, measures the roots with the reference
world state, rewrites every generated file from that one measurement, and stages the result. It does not commit.

| flag | effect |
| --- | --- |
| *(none)* | rewrites the genesis package |
| `--check` | measures and compares only, writes nothing, exits non-zero if anything is stale. CI runs it as `make fnd-genesis-tests` |

## Prerequisites

Barretenberg derives the protocol contracts' registration nullifiers from their built artifacts (bb.js), and the
reference world state (wsdb-ref) measures the roots from them, so those must be built first:

```bash
make noir-projects-fnd bb-ts bb-wsdb-ref
```

The script warns when the protocol
contract sources are newer than their artifacts. It is fail-fast throughout: a missing dependency, a failed measurement, or a replacement that did not
match is a hard error, because a half-applied regeneration leaves genesis values that disagree with each other.

## What it rewrites

`protocol/genesis/genesis.json` and `index.js` — the `@aztec-foundation/protocol-genesis` package: the world
state inputs (tree heights, prefill sizes, the six nullifiers, no public data, timestamp 0) and the nullifier tree
root, genesis block header hash and archive root they produce. Labs reads the genesis from here. It is deliberately
not in `constants.nr`: the protocol contracts are compiled against the constants, so the genesis derived from them
cannot feed back into the constants.

Nothing else depends on the canonical genesis. Barretenberg's and wsdb's world state tests deliberately use a fixed
synthetic genesis (`test_genesis.hpp` in each), which moves only if tree or header hashing does.

The L1 checkpoint fixtures are not part of this. L1 only checks that each checkpoint builds on the rollup's tip, and
its tests use a mock verifier, so the tests deploy the rollup with whatever archive root the fixtures build on
(`l1-contracts/scripts/remake-constants.sh` reads it from them). They are regenerated only when the checkpoint format
changes, with `l1-contracts/scripts/regenerate_checkpoint_fixtures.sh`.

## What it deliberately does NOT rewrite

`mainnet_compatibility.test.ts` and `testnet_compatibility.test.ts` in `labs/yarn-project/aztec/src/` pin what a
**live network was actually deployed with** — its VK tree root, protocol contracts hash and genesis archive root.
A class id rotation will make those fail too. That is correct and expected: they change only at a governance
upgrade. Never "fix" them by pasting in the new values; that silently claims the deployed network moved.

## Verifying

After regenerating, the tests that assert these values are:

- `regenerate_genesis_constants.sh --check` (CI: `make fnd-genesis-tests`) — the drift detector: it re-derives the
  genesis from the built protocol contracts and compares it with the package.
- `world-state/src/testing.test.ts` (labs) — the native world state, started from the package's inputs, must report
  the package's archive root.

## Why this is breaking

The genesis archive root is what a rollup stores in `archives[0]` at deployment, and that slot is immutable. New
roots therefore apply only to a network initialized from the new genesis; already-deployed networks keep theirs.
