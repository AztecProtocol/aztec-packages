---
title: CLI Options Explained
description: "Understand the bb CLI options including verifier targets, proving schemes, zero-knowledge settings, and advanced flags for memory and benchmarking."
sidebar_position: 2
---

# CLI Options Explained

This guide explains the key options available in the `bb` CLI. For a complete list of all commands and flags, see the [CLI Reference](./bb-cli-reference.md).

## Proving Schemes (`--scheme`)

The `--scheme` flag selects which proving system to use. If omitted, `ultra_honk` is used by default.

| Scheme | Description |
|--------|-------------|
| `ultra_honk` | General-purpose single-circuit prover. This is the default and recommended for most use cases. |
| `chonk` | IVC (Incremental Verifiable Computation) scheme for client-side proving. See [Chonk](#chonk-ivc) below. |

Most Noir developers should use `ultra_honk` (the default) and do not need to specify `--scheme` explicitly.

### Chonk (IVC)

Chonk is an IVC proving scheme used by Aztec for folding multiple circuit executions on the client side. For most use cases, you should interact with Chonk through [bb.js](./how_to_guides/on-the-browser.md) rather than calling `bb` directly — the low-level CLI commands are primarily useful for debugging.

:::warning

Chonk verification (`bb verify --scheme chonk`) is experimental and may change. The `batch_verify` command is also unstable.

:::

## Verifier Targets (`--verifier_target`)

The `--verifier_target` (or `-t`) flag configures the proof for a specific verification environment. It automatically sets the hash function, zero-knowledge, and IPA accumulation settings. This is the recommended way to configure these options — prefer it over the lower-level `--oracle_hash` and `--disable_zk` flags.

You can also set it via the `BB_VERIFIER_TARGET` environment variable.

### Available Targets

| Target | Hash | ZK | IPA | When to use |
|--------|------|----|-----|-------------|
| `evm` | keccak | yes | no | Verifying proofs on Ethereum or other EVM chains. Keccak is optimal for EVM due to the keccak precompile. |
| `evm-no-zk` | keccak | no | no | EVM verification where privacy is not needed, such as the final recursion step of a private transaction. |
| `noir-recursive` | poseidon2 | yes | no | Recursively verifying proofs inside Noir circuits. Poseidon2 is efficient as a circuit-native hash. |
| `noir-recursive-no-zk` | poseidon2 | no | no | Noir recursion without privacy, such as aggregating proofs of already-private transactions. |
| `noir-rollup` | poseidon2 | yes | IPA | Targeting the Aztec rollup verifier. Enables IPA (Inner Product Argument) proof aggregation across recursive steps. |
| `noir-rollup-no-zk` | poseidon2 | no | IPA | Rollup verification without privacy. |
| `starknet` | starknet | yes | no | *Reserved for future use.* Starknet verification via the [Garaga](https://garaga.gitbook.io/garaga) library. Disabled in default builds. |
| `starknet-no-zk` | starknet | no | no | *Reserved for future use.* |

:::tip[Working with Solidity]

If you are targeting EVM verification, see the [Solidity Verifier guide](./how_to_guides/how-to-solidity-verifier.md) for a complete walkthrough of generating a verifier contract, deploying it, and calling `verify()` from your smart contracts.

:::

### What does `-no-zk` mean?

The `-no-zk` suffix disables zero-knowledge randomization. Proofs are still *sound* (you cannot forge a proof), but the witness (private inputs) may be recoverable from the proof.

When is this useful? When the proof itself does not contain private data. For example, recursively verifying the proof of a private transaction does not need zero-knowledge — the inner proof's privacy is already protected. Disabling ZK gives slightly faster proving times.

### Examples

```bash
# Prove for EVM verification
bb prove -b ./target/circuit.json -w ./target/witness.gz -t evm -o ./target

# Prove for recursive verification in Noir
bb prove -b ./target/circuit.json -w ./target/witness.gz -t noir-recursive -o ./target

# Write a VK for the rollup verifier (no ZK needed)
bb write_vk -b ./target/circuit.json -t noir-rollup-no-zk -o ./target
```

:::warning

Use the same `--verifier_target` for `prove`, `write_vk`, and `verify`. Mismatched targets will cause verification to fail.

:::

## Output Format (`--output_format`)

Controls the format of proof and verification key files.

| Format | Description |
|--------|-------------|
| `binary` | Default. Compact binary representation. |
| `json` | Human-readable JSON with metadata (`bb_version`, `scheme`, `verifier_target`). Stable format, recommended when you need to inspect or debug proofs. |

```bash
bb prove -b ./target/circuit.json -w ./target/witness.gz --output_format json -o ./target
```

## Advanced Options

### Low-Memory Proving

For resource-constrained environments like mobile devices, `bb` can use memory-mapped files (mmap) as scratch space instead of RAM:

```bash
bb prove -b ./target/circuit.json -w ./target/witness.gz --slow_low_memory -o ./target
```

You can control the file-backed storage budget with `--storage_budget`. When the budget is exceeded, `bb` falls back to RAM:

```bash
# Allow up to 500MB of file-backed storage, falling back to RAM for the rest
bb prove -b ./target/circuit.json -w ./target/witness.gz --slow_low_memory --storage_budget 500m -o ./target
```

This trades proving speed for lower memory usage.

### Verification Key Policy (`--vk_policy`)

Controls how provided verification keys are handled. Useful in CI pipelines to catch VK drift:

| Policy | Behavior |
|--------|----------|
| `default` | Use the provided VK as-is. |
| `check` | Verify the provided VK matches the computed one. Errors on mismatch. **Recommended for CI.** |
| `recompute` | Always ignore the provided VK and compute a fresh one. |
| `rewrite` | Check and overwrite the file if a mismatch is found. |

```bash
bb prove -b ./target/circuit.json -w ./target/witness.gz --vk_policy check -k ./target/vk -o ./target
```

### Benchmarking

Use `--print_bench` to get a detailed breakdown of operation counts during proving:

```bash
bb prove -b ./target/circuit.json -w ./target/witness.gz --print_bench -o ./target
```

For structured output, use `--bench_out` to write JSON:

```bash
bb prove -b ./target/circuit.json -w ./target/witness.gz --bench_out ./bench.json -o ./target
```

## Msgpack API

The `bb msgpack` interface provides a programmatic API for tool integrators. It is used internally by Nargo's Rust backend.

```bash
# Output the msgpack schema
bb msgpack schema

# Run msgpack commands from a file
bb msgpack run -i commands.msgpack
```

The shared-memory IPC options (`--request-ring-size`, `--response-ring-size`, `--max-clients`) are used internally by bb.js and generally do not need to be configured directly.

## Recent CLI Changes

The BB CLI interface evolves across versions. Here are the most significant recent changes:

| Date | Change | Details |
|------|--------|---------|
| 2026-03 | `batch_verify` command added | Batch verification of Chonk proofs (unstable) |
| 2026-01 | `--output_format json` added | Human-readable JSON output with metadata for proofs and VKs |
| 2026-01 | Unified `write_vk` for Chonk | Consolidated multiple compute_vk commands |
| 2025-12 | `--verifier_target` flag added | High-level flag replacing raw `--oracle_hash` + `--disable_zk` combinations |
| 2025-12 | `--help-extended` added | Internal/advanced commands hidden from default help |
| 2025-11 | `--vk_policy` replaced `--update_inputs` | More flexible VK handling with named policies |

For the complete changelog, see the [aztec-packages commit history](https://github.com/AztecProtocol/aztec-packages/commits/next/barretenberg/cpp/src/barretenberg/bb).

## Next Steps

- [Getting Started](./getting_started.md) — prove and verify your first Noir program
- [Solidity Verifier](./how_to_guides/how-to-solidity-verifier.md) — deploy a verifier contract on EVM
- [Recursive Aggregation](./how_to_guides/recursive_aggregation.md) — verify proofs within proofs
- [CLI Reference](./bb-cli-reference.md) — full command and flag listing
