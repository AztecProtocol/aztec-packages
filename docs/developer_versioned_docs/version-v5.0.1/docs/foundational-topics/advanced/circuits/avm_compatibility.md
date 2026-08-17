---
title: AVM Cryptographic Compatibility
sidebar_position: 3
description: Which Noir cryptographic primitives work in public (AVM) functions vs private, and workarounds for unsupported operations.
tags: [protocol, circuits]
---

Private and public functions in Aztec use different execution models. Private functions compile to ACIR circuits and have access to the full Noir standard library. Public functions compile to AVM bytecode via the transpiler, which supports only a specific set of cryptographic operations.

## Compatibility Table

The table below lists the low-level blackbox operations and whether they are available in the AVM. Higher-level Noir standard library functions (like `sha256::sha256_var`, `keccak256::keccak256`, `poseidon2::hash`, and `std::hash::pedersen_hash`) are built on these primitives and work in public functions when the underlying operations are supported.

| Noir Primitive | Private (ACIR) | Public (AVM) | Notes |
|---|---|---|---|
| Poseidon2 Permutation | Supported | Supported | `POSEIDON2PERM` opcode |
| Pedersen Hash / Commitment | Supported | Supported | Lowered to `ECADD` and `MSM` operations |
| SHA-256 Compression | Supported | Supported | `SHA256COMPRESSION` opcode |
| Keccak f1600 | Supported | Supported | `KECCAKF1600` opcode |
| Embedded Curve Add | Supported | Supported | `ECADD` opcode (Grumpkin curve) |
| Multi-Scalar Multiplication | Supported | Supported | Lowered to `TORADIXBE` + `ECADD` operations |
| ToRadix | Supported | Supported | `TORADIXBE` opcode |
| ECDSA secp256k1 | Supported | **Not supported** | Transpiler panics |
| ECDSA secp256r1 | Supported | **Not supported** | Transpiler panics |
| AES-128 Encrypt | Supported | **Not supported** | Transpiler panics |
| Blake2s | Supported | **Not supported** | Transpiler panics |
| Blake3 | Supported | **Not supported** | Transpiler panics |

## Why the Difference

Private functions are compiled to ACIR (Abstract Circuit Intermediate Representation), which supports the full set of Noir standard library blackbox functions. These are evaluated as part of the zk-SNARK proof generation on the user's device.

Public functions are compiled to AVM bytecode via the transpiler. The AVM has a fixed instruction set, and each supported cryptographic operation must either have a dedicated opcode or be reducible to a sequence of supported opcodes. For example, multi-scalar multiplication has no dedicated opcode but is lowered to `TORADIXBE` and `ECADD` instructions. Operations that cannot be mapped to supported opcodes cannot be transpiled.

## What Error Will I See?

If you use an unsupported blackbox function in a `#[external("public")]` function, the transpiler will panic at compile time with a message like:

```
Transpiler doesn't know how to process EcdsaSecp256k1
```

where the final token is the name of the unsupported `BlackBoxOp` variant (e.g. `AES128Encrypt`, `Blake2s`, `Blake3`).

## Signature Verification in Public: Workarounds

Since ECDSA signature verification is not available in public functions, use the **Authentication Registry** pattern:

1. Verify signatures in a **private** function (where all Noir primitives are available)
2. Store approval hashes in the **Auth Registry** (a shared public contract)
3. Consume the approvals in **public** functions

This is exactly how public authwits work. See [Authentication Witnesses](../authwit.md) for the full pattern.

:::tip Schnorr signatures
The [`noir-lang/schnorr`](https://github.com/noir-lang/schnorr) library implements Schnorr verification in pure Noir using embedded curve operations (ECADD, MSM), which are supported in the AVM. This means Schnorr verification may work in public functions. However, the standard Aztec account contracts only use Schnorr in private functions, and the recommended pattern remains verifying signatures in private via the Auth Registry.
:::

## ISA Reference

For the complete list of AVM opcodes, see the [AVM ISA Quick Reference](https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/yarn-project/simulator/docs/avm/avm-isa-quick-reference.md).

## Related Pages

- [Public Execution (AVM)](./public_execution.md) – How the AVM executes public functions
- [Authentication Witnesses](../authwit.md) – The Auth Registry pattern for public authorization
- [Call Types](../../../foundational-topics/call_types.md) – How private and public functions interact
- [Private Kernel](./private_kernel.md) – How private functions are processed
