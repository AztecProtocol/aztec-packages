# Goblin Reset Design

## Problem

Chonk's accumulation capacity is bounded by the ECCVM circuit size (`2^CONST_ECCVM_LOG_N = 2^15 = 32,768` rows). Each folding step generates ~62 short scalar multiplications that are deferred to the ECCVM via Goblin's op queue. Currently, the maximum is ~17 app circuits before the ECCVM overflows.

## Design

### Goblin App

This is an app $A_G$ that does only one thing: it recursively verifies an Ultra Honk proof of the circuit $C$ which contains a Goblin recursive verifier.

A valid witness for $A_G$ attests to the knowledge of a valid proof for the circuit $C$, which in turn attests to the knowledge of a valid proof of Goblin (merge + ECCVM + Translator).

In addition to the recursive verification, $A_G$ exposes in its return data:
- The **IPA opening claim** extracted from the ECCVM recursive verification inside $C$.
- The **`T_pre_flush` commitment** — the merged op queue table that was proven, read from the merge proof's public inputs inside $C$. This is needed by the Goblin kernel for the merge chain consistency check (see below).

### Goblin Kernel

This is a kernel $K_G$ that behaves almost like an inner kernel with the difference that it recursively verifies the folding of a kernel into a running accumulator and of the Goblin app into the accumulator.

So:
- It verifies two foldings.
- For the second folding, the VK is equal to the VK of $A_G$ (in contrast with inner kernels, where the VK is one of the allowed VKs in `ALLOWED_VK_TREE`).
- It extracts the IPA claim from the Goblin app's return data and accumulates it into the running IPA claim, which is part of the public inputs of every kernel (see IPA Claim Accumulation below).

#### Merge Chain Reset (T_prev subtlety)

$K_G$ must also reset the Goblin merge chain. This is the subtlest part of the design.

The Chonk verification loop threads a `T_prev` commitment through every kernel: each kernel reads `T_prev` from the previous kernel's `ecc_op_tables`, merges the new subtable onto it, and outputs the updated commitment. At a flush, this chain must be broken and restarted cleanly, because the final ECCVM at `prove()` time only covers post-flush ops — it never proves `T_pre_flush`.

$K_G$'s `complete_kernel_circuit_logic` therefore does the following, in place of the standard T_prev inheritance:

1. Reads `T_pre_flush` from the **previous kernel's** `ecc_op_tables`.
2. Reads `T_pre_flush` from **$A_G$'s return data** — the commitment to the table that $A_G$ verified was correctly processed by the intermediate ECCVM inside $C$.
3. **Asserts equality**: `A_G.verified_T_pre_flush == prev_kernel.ecc_op_tables`. This ties the two chains together: the flush proof covered exactly the ops committed to by the previous kernel, no more, no less. Without this check a malicious prover could supply an $A_G$ that verifies a flush proof for a different (smaller) batch of ops, leaving some pre-flush operations unaccounted for.
4. Uses **T_0 (empty tables)** as `T_prev` for the merge verification of $A_G$'s subtable — discarding `T_pre_flush` from the forward chain.
5. Outputs `ecc_op_tables = T_0 ∥ A_G ops`, the fresh starting point for all subsequent kernels.

The native `prove_merge()` call for $A_G$ uses `MergeSettings::RESET`, setting `T_prev = T_0`, so prover and verifier agree on the fresh start.

#### IPA Claim Accumulation

Every kernel carries a running IPA accumulator in `KernelIO` / `HidingKernelIO` (~8 field elements: a commitment point + opening pair):

- **Init kernel**: outputs a trivial/default accumulator.
- **Inner / Reset kernels**: pass-through — copy the accumulator from the previous kernel's public inputs. Not free: adds copy constraints in the permutation argument.
- **$K_G$**: folds the flush's IPA claim from $A_G$'s return data into the running accumulator (~54K gates for the accumulation gadget).
- **Tail / Hiding kernels**: pass-through. Hiding kernel outputs the accumulated claim in `HidingKernelIO`.
- **`prove()`**: the final ECCVM IPA claim only exists after `prove()` runs the ECCVM prover. A dedicated IPA accumulation circuit folds this final claim into the kernel-chain accumulator. Its Oink is a separate sub-proof; sumcheck/PCS are batched into the joint proof.

For zero-flush flows, the trivial accumulator passes through untouched. The `prove()` accumulation circuit folds the single final IPA claim into the trivial accumulator, equivalent to today's behaviour.

### How to Drop Them In

Write $A_1, \dots, A_N$ for the execution stack. Each app has a number $N_i$ of ECC ops that can be estimated from ACIR by counting the number of recursive verifications happening in the app.

In `proveWithKernels` we proceed as follows:

1. Run a loop over `executionStack` and add Reset kernels as we do now, producing `executionStackWithKernels`.
2. Run a loop over `executionStackWithKernels` and estimate the running ECC op count at each step. If app $A_i$ (plus the following kernel or kernels) would push the total above the ECCVM fixed size, insert the Goblin pair before it so the stack becomes $A_1, \dots, A_{i-1}, A_G, K_G, A_i, \dots$

This works because $A_G$ and $K_G$ do not read or write any Aztec state, so inserting them at any position in the kernel chain after Reset kernels have been placed is valid.

An app whose EC ops alone (plus one kernel pair) exceed ECCVM capacity is **rejected** at this point — it can never fit regardless of flushing.

A **hard bound** (insert a flush every $N$ circuits regardless of row count) is enforced as a safety net in the same loop.

## Implementation

### Goblin App

This is a Noir app that calls `std::verify_with_type`. We define a new ACIR proof type `ULTRA_GOBLIN` which performs an Ultra recursive verification and hard-codes the VK hash to be that of the Ultra circuit $C$ containing the Goblin recursive verifier. The return data of $A_G$ includes the IPA claim and `T_pre_flush` commitment extracted from $C$'s proof.

### Goblin Kernel

This is a Noir kernel similar to inner kernels. The differences are:

- **Noir**: the second VK being folded is hard-coded to the VK of $A_G$ instead of being checked against `ALLOWED_VK_TREE`.
- **BB**: `complete_kernel_circuit_logic` has a Goblin-kernel path that:
  - Performs the `T_pre_flush` consistency check (step 3 above).
  - Resets `T_prev` to T_0 before processing $A_G$'s merge subtable (steps 4–5 above).
  - Invokes the IPA accumulation gadget on the claim from $A_G$'s return data.

### TS Land

Modifications to `proveWithKernels` as per the *How to Drop Them In* section:
- Estimate ECC op counts from ACIR (by counting recursive verifications per circuit).
- Two-pass loop: first place Reset kernels, then insert Goblin pairs at overflow points.
- Witness generation for $A_G$: produce the Goblin flush proof (merge + ECCVM + Translator), pass through $C$ (the GoblinRecursiveVerifier), and package the resulting Ultra Honk proof as $A_G$'s witness input.

## Proof Structure

The final proof is **constant size** (6 sub-proofs), identical whether zero or $N$ flushes occurred. The verifier cannot distinguish a zero-flush proof from an $N$-flush proof.

1. **MegaZK Oink proof** — hiding kernel pre-sumcheck
2. **Merge proof** — final op queue subtable (post-last-flush ops only)
3. **ECCVM proof** — final EC operations on Grumpkin (post-last-flush)
4. **IPA proof** — opening proof for the final ECCVM's polynomial commitment
5. **IPA accumulation Oink proof** — pre-sumcheck for the `prove()`-time accumulation circuit
6. **Joint proof** — Translator Oink + batched sumcheck + batched PCS (MegaZK, Translator, IPA accumulation)

## Impact on Non-Flush Flows

All non-flush flows are affected by the following structural changes:

- **`KernelIO` / `HidingKernelIO`**: gain IPA accumulator fields. All kernel VKs change.
- **`complete_kernel_circuit_logic()`**: every kernel passes through the IPA accumulator (copy constraints only for non-Goblin kernels).
- **`prove()`**: new IPA accumulation circuit + Oink sub-proof. Joint proof batches 3 circuits instead of 2.
- **Verifier**: batches three circuit reductions (MegaZK, Translator, IPA accumulation) instead of two.
- **Constants**: `HIDING_KERNEL_PUBLIC_INPUTS_SIZE`, `CHONK_PROOF_LENGTH`, Noir constants, TypeScript constants all update.

## Open Questions

1. **GoblinRecursiveVerifier gate count**: what is the total gate count and ECCVM row cost of circuit $C$? This determines the overhead of each flush and informs the hard bound value.
2. **IPA claim accumulation protocol**: is this the same `IPA::accumulate()` already used at the rollup level? If so, the accumulated claim type is `OpeningClaim<Grumpkin>` and rollup changes are minimal.
3. **Hard bound value**: should be derived from ECCVM capacity and known per-circuit costs rather than hardcoded.
4. **Testing strategy**: flush triggering in TS, T_pre_flush consistency check correctness, proof validity across multiple flushes.
