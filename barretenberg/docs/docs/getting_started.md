---
title: Getting Started
hide_title: true
description: Barretenberg is a high-performance zero-knowledge proof system implementation written in C++. It serves as the cryptographic engine powering Aztec's privacy-focused blockchain solutions. The system includes efficient implementations of key cryptographic primitives, constraint system construction, and proof generation optimized for modern hardware.
keywords:
    [zero-knowledge proofs, ZK proofs, cryptography, blockchain, privacy, Aztec, C++, PLONK, arithmetic circuits, constraint systems, elliptic curves, performance optimization, zkSNARKs, zero-knowledge]
sidebar_position: 1
---

# Barretenberg

Barretenberg (or `bb` for short) is an optimized elliptic curve library for the bn128 curve, and a PLONK SNARK prover.

Although it is a standandalone prover, Barretenberg is designed to be used with [Noir](https://noir-lang.org). It is highly recommended to start by creating a Noir project with the [Noir guickstart guide](https://noir-lang.org/docs/getting_started/quick_start) before this guide!

## Installation

Inspired by `rustup`, `noirup` and similar tools, you can use the `bbup` installation script to quickly install and update Barretenberg's CLI tool:

```bash
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/master/barretenberg/bbup/install | bash
bbup
```

Following these prompts, you should be able to see `bb` binary in `$HOME/.bb/bb`.

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

:::info

You may be asking yourself what happened to the **public inputs**? Barretenberg proofs usually append them to the beginning of the proof. This may or may not be useful, and the next guides will provide you with handy commands to split the proof and the public inputs whenever needed

:::

## Next steps

As cool as it is, proving and verifying on the same machine is not incredibly useful. You may want to do things like:

- Generating programs that verify proofs in immutable, decentralized ledgers like blockchains
- Verifying proofs within other proofs

Check out those specific guides in the sidebar.
