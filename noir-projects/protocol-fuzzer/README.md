A state-machine fuzzer for Aztec contract interactions. It talks to a running
sandbox via a persistent Node.js HTTP bridge (`bridge.mjs`), compares the
sandbox's behavior to an in-memory model, and asserts on any divergence.

Two machines are available:

- **token** — deploys token contracts, then fuzzes mint/burn/transfer
  operations (public and private), tracking balances and total supply.
- **side-effect** — deploys custom `SideEffect` and `Parent` contracts, then fuzzes
  note lifecycle (create, destroy, view, get, partial notes), nullifier emission,
  and cross-contract calls, verifying note inclusion and nullifier uniqueness.

## Running

The **token** machine works with any Aztec sandbox (including `latest`) out of the box —
it uses the standard `Token` contract that ships with the wallet CLI:

```
cargo run -- token --max-steps 100
```

The **side-effect** machine requires the **nightly** sandbox because it deploys custom
contracts compiled against the nightly's aztec-nr. Use `setup-nightly-sandbox.sh` to
automate the full setup (or see `SANDBOX_INSTRUCTIONS.md` for manual steps):

```
bash setup-nightly-sandbox.sh

cargo run -- side-effect --max-steps 100
```

To replay a specific failure seed:

```
cargo run -- side-effect --max-steps 100000 --seed 0x5a7211231dcd6500
```

### Options

```
--bridge-url URL    Bridge server URL (default: http://localhost:8089)
--prove             Enable client-side proof generation (default: off)
--seed 0xHEX        Replay a specific seed
--max-steps N       Max fuzzing steps (default: 100000)
```

## Smoke Tests

To verify that the sandbox is running correctly, run the integration smoke tests:

```
cargo test -- --ignored --nocapture
```

These are `#[ignore]`d by default because they require a running sandbox. With
bridge + fast slots, a full suite run takes ~1-2 minutes (~5-13s per transaction).

## Contracts

Contract sources live in `contracts/` within this crate, not in `noir-contracts/`. They
must be compiled against the **nightly sandbox's aztec-nr**, not the repo's current branch,
because the two have incompatible APIs (e.g. `RetrievedNote` / `destroy_note_unsafe` vs
`ConfirmedNote` / `destroy_note`). Compiling against the repo's aztec-nr produces artifacts
with oracle calls (like `utilityLog`) that the nightly PXE doesn't support.

- **SideEffect** (`contracts/side_effect_contract/`) — note lifecycle, nullifier ops
- **Parent** (`contracts/parent_contract/`) — forwards calls to SideEffect for
  cross-contract call testing

Pre-built artifacts are checked into `contracts/target/`. When the nightly image updates,
recompile using `setup-nightly-sandbox.sh` and commit the new artifacts.

The setup script auto-detects the nightly commit by matching the container's nargo
hash against `origin/next`. See `SANDBOX_INSTRUCTIONS.md` for the full build pipeline,
version matrix, and troubleshooting.
