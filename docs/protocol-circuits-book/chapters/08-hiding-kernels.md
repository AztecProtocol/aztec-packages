# Chapter 8: Hiding Kernels

## Purpose

Hiding kernels serve as a **bridge** between private execution (on the user's device) and the network (sequencers and rollup circuits). They "hide" the details of private execution, producing a standardized output format.

## Why Hiding?

Without hiding kernels, an observer could learn:
- How many private function calls occurred
- Which kernel circuit variants were used
- The structure of the private call tree

The hiding kernel wraps the entire private execution into a single proof with a fixed-format output, revealing nothing about the internal structure.

## Two Variants

### Hiding Kernel to Rollup

For transactions with **only private execution** (no public calls):

```
Transaction Flow:
Private Kernel Tail -> Hiding Kernel to Rollup -> TX Base Private
```

This variant:
- Takes `PrivateToRollupKernelCircuitPublicInputs` as input
- Produces a proof ready for the `tx-base-private` circuit
- The transaction goes directly to rollup processing

### Hiding Kernel to Public

For transactions that **include public execution**:

```
Transaction Flow:
Private Kernel TailToPublic -> Hiding Kernel to Public -> Chonk Verifier -> AVM -> TX Base Public
```

This variant:
- Takes `PrivateToPublicKernelCircuitPublicInputs` as input
- Produces a proof ready for the `chonk-verifier-public` circuit
- The transaction proceeds to public execution before rollup

## What Gets Hidden

The hiding kernel obscures:

| Hidden | Reason |
|--------|--------|
| Number of private calls | Reveals transaction complexity |
| Contract addresses called | Reveals which contracts interacted |
| Call graph structure | Reveals execution flow |
| Kernel variants used | Reveals transaction type patterns |

## What Remains Visible

After hiding, the following is still visible:

| Visible | Reason Required |
|---------|-----------------|
| Note hash count | Trees need to allocate space |
| Nullifier count | Trees need to allocate space |
| Public call requests | Sequencer needs to execute them |
| Gas settings | Fee calculation required |
| Encrypted logs | Recipients need to find them |

## Circuit Details

### Inputs

```
Hiding Kernel Inputs
+------------------------------------------+
| previous_kernel_proof: Tail/TailToPublic |
| previous_kernel_vk: Verification key     |
+------------------------------------------+
```

### Processing

The hiding kernel:

1. **Verifies the previous kernel proof**
   - Checks the proof is valid
   - Verifies the VK is in the allowed set

2. **Propagates public inputs**
   - Copies all necessary data to output
   - Does NOT perform additional transformations

3. **Produces a uniform proof**
   - Output format is identical regardless of internal complexity
   - Proof size is constant

### Outputs

```
Hiding Kernel Output
+------------------------------------------+
| All data from Tail/TailToPublic, wrapped |
| in a standardized proof format           |
+------------------------------------------+
```

## The Chonk Verifier

For transactions with public execution, the hiding kernel proof is verified by the **Chonk Verifier** circuit:

```
Chonk Verifier Purpose
+------------------------------------------+
| 1. Verify hiding-kernel-to-public proof  |
| 2. Validate VK membership in VK tree     |
| 3. Propagate public inputs to AVM/rollup |
+------------------------------------------+
```

This is a separate circuit because:
- It uses a different proving system (Chonk/Honk)
- It bridges between proof systems
- It enables efficient verification of hiding proofs

### Valid Circuit Relationships

```
hiding-kernel-to-public
        |
        v
chonk-verifier-public
        |
        v
tx-base-public (also receives AVM proof)
```

## Proof Size Considerations

One goal of hiding kernels is constant proof size:

```
Without Hiding:
  1 private call  -> Proof size X
  10 private calls -> Proof size ~10X
  
With Hiding:
  1 private call  -> Proof size Y
  10 private calls -> Proof size Y  (same!)
```

This prevents proof size from leaking information about transaction complexity.

## VK Tree Membership

Both hiding kernel variants validate that their input VK is allowed:

```rust
// Pseudo-code for VK validation
fn validate_vk(vk: VerificationKey, vk_tree_root: Field) {
    let allowed_indices = [
        PRIVATE_KERNEL_TAIL_VK_INDEX,
        PRIVATE_KERNEL_TAIL_TO_PUBLIC_VK_INDEX,
    ];
    
    assert(vk_tree.contains(vk, allowed_indices));
}
```

This prevents:
- Fake kernels from producing hiding proofs
- Invalid verification keys from being accepted

## Transaction Lifecycle with Hiding

### Private-Only Transaction

```
1. User executes private functions
2. Kernel circuits process (Init -> Inner -> Reset -> Tail)
3. Hiding-kernel-to-rollup wraps the tail proof
4. Transaction sent to mempool
5. Sequencer processes with tx-base-private
```

### Transaction with Public Calls

```
1. User executes private functions
2. Kernel circuits process (Init -> Inner -> Reset -> TailToPublic)
3. Hiding-kernel-to-public wraps the TailToPublic proof
4. Transaction sent to mempool
5. Chonk-verifier-public verifies the hiding proof
6. AVM executes public calls
7. tx-base-public processes both proofs
```

## Security Properties

The hiding kernels ensure:

1. **Privacy**: Internal structure not revealed
2. **Integrity**: Only valid kernel outputs can produce valid hiding proofs
3. **Uniformity**: All transactions look similar from outside
4. **Non-malleability**: Proof cannot be modified without detection

## Relationship to Other Circuits

```
                     User Device
                         |
    +--------------------+--------------------+
    |                                         |
    v                                         v
[Tail Kernel]                        [TailToPublic Kernel]
    |                                         |
    v                                         v
[hiding-to-rollup]                   [hiding-to-public]
    |                                         |
    |                                         v
    |                                [chonk-verifier-public]
    |                                         |
    |                                         v
    |                                      [AVM]
    |                                         |
    v                                         v
[tx-base-private]                    [tx-base-public]
    |                                         |
    +--------------------+--------------------+
                         |
                         v
                  [tx-merge / block-root]
```

The hiding kernels are the last circuits that run on the user's device. Everything after them runs on sequencer infrastructure.

\newpage
