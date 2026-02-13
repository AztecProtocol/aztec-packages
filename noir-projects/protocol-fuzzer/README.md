A state-machine fuzzer for Aztec contract interactions. It drives an `aztec-wallet`
CLI against a running sandbox, comparing the sandbox's behavior to an in-memory model
and asserting on any divergence.

Two machines are available:

- **token** (default) — deploys token contracts, then fuzzes mint/burn/transfer
  operations (public and private), tracking balances and total supply.
- **side-effect** — deploys a custom `SideEffect` contract, then fuzzes note
  lifecycle (create, destroy, view, get, partial notes) and nullifier emission,
  verifying note inclusion and nullifier uniqueness.

## Running

The **token** machine works with any Aztec sandbox (including `latest`) out of the box —
it uses the standard `Token` contract that ships with the wallet CLI. Just start a sandbox
and point `aztec-wallet` at it:

```
cargo run -- --machine token --max-steps 100
```

The **side-effect** machine requires the **nightly** sandbox because it deploys a custom
contract compiled against the nightly's aztec-nr. See `SANDBOX_INSTRUCTIONS.md` for setup,
or use `setup-nightly-sandbox.sh` to automate it:

```
SIDE_EFFECT_ARTIFACT_PATH=/tmp/nightly-build/target/side_effect_contract-SideEffect.json \
  cargo run -- --machine side-effect --max-steps 100
```

## Side-effect contract

The side-effect contract source lives in `contracts/side_effect_contract/` within this
crate, not in `noir-contracts/`. This is intentional: the contract must be compiled
against the **nightly sandbox's version of aztec-nr**, not the repo's current `next`
branch. The two have incompatible APIs (e.g. the nightly uses `RetrievedNote` /
`destroy_note_unsafe` / `protocol_types::address::AztecAddress`, while `next` uses
`ConfirmedNote` / `destroy_note` / `protocol::address::AztecAddress`). Compiling
against the repo's aztec-nr would produce artifacts with oracle calls (like
`utilityLog`) that the nightly PXE doesn't support.

A pre-built artifact is checked into git at `contracts/target/side_effect_contract-SideEffect.json`.
If it matches the current nightly image, no compilation is needed. When the nightly image
updates, recompile using `setup-nightly-sandbox.sh` (which automates extracting the correct
aztec-nr, compiling inside the nightly container, and setting up the wallet wrapper) and
commit the new artifact.

As of 2026-02-13, the nightly sandbox is built from aztec-packages commit `681ca9b5c9`
(matched via its noir submodule hash `67478b2f9d7c6239686e8de8a82f2719e54fbd40`).

See `SANDBOX_INSTRUCTIONS.md` for full details on the build pipeline and version matrix.
