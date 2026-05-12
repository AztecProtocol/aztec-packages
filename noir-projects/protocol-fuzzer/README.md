A state-machine fuzzer for Aztec contract interactions. It talks to a running
sandbox via a persistent Node.js HTTP bridge (`wallet-bridge.mjs`), compares the
sandbox's behavior to an in-memory model, and asserts on any divergence.

Two machines are available:

- **token** -- deploys token contracts, then fuzzes mint/burn/transfer
  operations (public and private), tracking balances and total supply.
- **side-effect** -- deploys custom `SideEffect` and `Parent` contracts, then fuzzes
  note lifecycle (create, destroy, view, get, partial notes), nullifier emission,
  L2->L1 messages, private logs, key validation requests, public teardown calls,
  and cross-contract calls. Verifies note values against the model, nullifier
  uniqueness, L2->L1 message hashes in TxEffect, and private logs against the
  model (each emission discoverable via siloed tag, plus per-tag completeness:
  no earlier log gets dropped or overwritten).

## Running

The **token** machine works with any Aztec sandbox (including `latest`) out of the box --
it uses the standard `Token` contract that ships with the wallet CLI:

```
cargo run -- token --max-steps 100
```

The **side-effect** machine requires custom contracts. There are two ways to set it up:

**Local setup** (no Docker, uses your repo build):
```
bash setup-local.sh              # compiles contracts, starts anvil + node + bridge
cargo run -- side-effect --artifacts-dir contracts/target --max-steps 100
```

**Nightly Docker setup** (defaults to the last tested nightly tag; pass `--latest` for newest):
```
bash setup-nightly-sandbox.sh
cargo run -- side-effect --max-steps 100
```
The nightly script places artifacts at `/tmp/` inside the container (the default `--artifacts-dir`).

See `NIGHTLY_SANDBOX_INSTRUCTIONS.md` for manual nightly steps and troubleshooting.

To replay a specific failure seed:

```
cargo run -- side-effect --max-steps 100000 --seed 0x5a7211231dcd6500
```

### Options

```
--bridge-url URL      Bridge server URL (default: http://localhost:8089)
--prove               Enable client-side proof generation (default: off)
--seed 0xHEX          Replay a specific seed
--max-steps N         Max fuzzing steps (default: 400)
--max-batch-size N    Max parallel sends per batch (default: 8)
--artifacts-dir DIR   Contract artifact directory (side-effect only, default: /tmp)
--include-one-shots   Include RequestOvskApp and TestSettingTeardown in the
                      random command pool (side-effect only; off by default
                      -- they always succeed and have no parameters to vary)
```

> **Note:** `--artifacts-dir` is resolved on the host and sent as-is to the bridge.
> For **local** setup the bridge runs on the host, so use the real path (e.g.
> `contracts/target`). For **nightly Docker** the bridge runs inside the container,
> so the path must be valid inside it -- the default `/tmp` works because the nightly
> script places artifacts at `/tmp/*.json` inside the container.

### Parallel batching

Consecutive non-conflicting commands are batched and fired concurrently, landing in the
same block. This reduces N sequential transactions from N*5s to ~5s.

Commands fall into three categories (see `changes_model()` / `flushes_batch()` in `machine.rs`):

- **Stateful sends** -- create notes, emit nullifiers, send L2->L1 messages, emit private logs.
  Batched together when non-conflicting.
- **Queries** -- view/get notes, test note/nullifier inclusion. Flush the pending batch first
  since they need to observe prior committed state. Some are on-chain sends (e.g.
  `TestNoteInclusion` exercises kernel verification) but still flush the batch.
- **Kernel exercisers** -- key validation (`RequestOvskApp`), public teardown
  (`TestSettingTeardown`). On-chain sends that don't change model state and don't need the
  batch flushed -- they batch freely with other sends.

Conflict rules (conservative -- false positives only reduce batch size):
- **token**: two commands on the same token conflict (shared total supply)
- **side-effect**: two commands on the same (storage_slot, owner) or same nullifier value conflict;
  L2->L1 messages, private logs, key validation, and teardown are conflict-free with all sends

## Smoke Tests

To verify that the sandbox is running correctly, run the integration smoke tests:

```
ARTIFACTS_DIR=contracts/target cargo test -- --ignored --nocapture
```

These are `#[ignore]`d by default because they require a running sandbox. With
bridge + fast slots, a full suite run takes ~1-2 minutes (~5-13s per transaction).

Environment variables for tests:
- `ARTIFACTS_DIR` -- contract artifact directory (default: `/tmp`)
- `BRIDGE_URL` -- bridge server URL (default: `http://localhost:8089`)

## Contracts

Contract sources live in `contracts/` within this crate, not in `noir-contracts/`.

- **SideEffect** (`contracts/side_effect_contract/`) -- note lifecycle, nullifier ops,
  L2->L1 messages, private logs, key validation, public teardown
- **Parent** (`contracts/parent_contract/`) -- forwards calls to SideEffect for
  cross-contract call testing

Contracts must be compiled against the same aztec-nr as the node they'll be
deployed to:

- **Local setup** uses the repo's current aztec-nr (the noir submodule + `noir-projects/aztec-nr/`).
  `setup-local.sh` invokes the locally-built nargo + bb.
- **Nightly Docker setup** compiles inside the container against the nightly image's
  aztec-nr (which may diverge from `next`). `setup-nightly-sandbox.sh` extracts the
  nightly's aztec-nr source by auto-detecting the matching nargo hash on `origin/next`,
  then compiles there.

Mixing them fails at deploy: artifacts compiled with one aztec-nr produce different
class IDs / VK sizes than the other expects. Build artifacts land in `contracts/target/`
(host) and `/tmp/` (container) and are not tracked in git.

See `NIGHTLY_SANDBOX_INSTRUCTIONS.md` for the full nightly build pipeline, version
matrix, and troubleshooting.
