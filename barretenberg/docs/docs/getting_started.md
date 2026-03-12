---
title: Getting Started
hide_title: true
description: "Install Barretenberg and generate your first zero-knowledge proof using the bb CLI with Noir."
keywords:
    [zero-knowledge proofs, ZK proofs, cryptography, blockchain, privacy, Aztec, C++, PLONK, arithmetic circuits, constraint systems, elliptic curves, performance optimization, zkSNARKs, zero-knowledge]
sidebar_position: 1
---

# Barretenberg

Barretenberg (or `bb` for short) is an optimized elliptic curve library for the bn128 curve, and a PLONK SNARK prover.

Although it is a standalone prover, Barretenberg is designed to be used with [Noir](https://noir-lang.org). It is highly recommended to start by creating a Noir project with the [Noir quickstart guide](https://noir-lang.org/docs/getting_started/quick_start) before this guide!

## Installation

### Prerequisites: Install Noir

Barretenberg is designed to work with [Noir](https://noir-lang.org). Install the Noir compiler (`nargo`) first using [noirup](https://github.com/noir-lang/noirup):

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
noirup
```

Verify the installation:

```bash
nargo --version
```

### Install Barretenberg

With `nargo` installed, use `bbup` to install the matching version of `bb`:

```bash
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/next/barretenberg/bbup/install | bash
bbup
```

Running `bbup` without arguments auto-detects your installed `nargo` version and installs the compatible `bb` binary to `$HOME/.bb/bb`. You can verify with:

```bash
bb --version
```

### Version Compatibility

`bbup` automatically resolves the correct Barretenberg version for your installed Noir version using a [version mapping file](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/bbup/bb-versions.json). You can also install a specific version:

```bash
bbup -v 0.87.0              # Install a specific BB version
bbup -nv 1.0.0-beta.19      # Install BB matching a specific Noir version
```

## Usage

Assuming you have a Noir project, you can use `bb` straight-away to prove by giving it the compiled circuit and the witness (the outputs of `nargo execute`). Since we want to verify the proof later, we also want to write the verification key to a file. Let's do it:

```bash
bb prove -b ./target/hello_world.json -w ./target/hello_world.gz --write_vk -o target
```

This will prove your program and write both a `proof` and a `vk` file to the `target` folder. To verify the proof, you don't need the witness (that would defeat the purpose, wouldn't it?), just the proof and the `vk`:

```bash
bb verify -p ./target/proof -k ./target/vk
```

Congratulations! Using Noir and Barretenberg, your verifier could verify the correctness of a proof, without knowing the private inputs!

### Verifier Targets

The `--verifier_target` (or `-t`) option lets you configure the proof for different verification environments. Each target automatically sets the appropriate hash function and zero-knowledge settings:

```bash
# For Ethereum/Solidity verification (uses keccak hash)
bb prove -b ./target/hello_world.json -w ./target/hello_world.gz --verifier_target evm -o target

# For recursive verification in Noir circuits (uses poseidon2 hash)
bb prove -b ./target/hello_world.json -w ./target/hello_world.gz --verifier_target noir-recursive -o target

# For Starknet verification via Garaga (reserved for future use — disabled in default builds)
bb prove -b ./target/hello_world.json -w ./target/hello_world.gz --verifier_target starknet -o target
```

Available targets:
- `evm` / `evm-no-zk`: Ethereum/Solidity verification (keccak)
- `noir-recursive` / `noir-recursive-no-zk`: Recursive verification in Noir circuits (poseidon2)
- `noir-rollup` / `noir-rollup-no-zk`: Rollup circuits with IPA accumulation (poseidon2)
- `starknet` / `starknet-no-zk`: Starknet verification via Garaga (reserved for future use)

For a detailed explanation of each target, see the [CLI Options guide](./cli_options.md).

The `-no-zk` variants disable zero-knowledge, which can be useful when privacy isn't required and you want slightly faster proving.

:::info

You may be asking yourself what happened to the **public inputs**? Barretenberg proofs usually append them to the beginning of the proof. This may or may not be useful, and the next guides will provide you with handy commands to split the proof and the public inputs whenever needed

:::

## Next steps

As cool as it is, proving and verifying on the same machine is not incredibly useful. You may want to do things like:

- Generating programs that verify proofs in immutable, decentralized ledgers like blockchains
- Verifying proofs within other proofs

Check out those specific guides in the sidebar.
