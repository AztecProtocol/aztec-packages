# Nullifier Tree

The Nullifier tree is an [indexed Merkle tree](./tree-implementations.md#indexed-merkle-trees) that stores nullifier values. Each value stored in the tree is a 254-bit altBN-254 scalar field element. This tree is part of the global state, and allows to prove non-existence of a nullifier when a note is consumed.

Nullifiers are asserted to be unique during insertion, by checking that the inserted value is not equal to the value and next-value stored in the prior node in the indexed tree. Any attempt to insert a duplicated value is rejected.

Contracts emit new nullifiers via the `new_nullifiers` in the `CircuitPublicInputs`. Same as elements in the [Note Hash tree](./note-hash-tree.md), nullifiers are [siloed](./tree-implementations.md#siloing-leaves) per contract by the Kernel circuit before being inserted in the tree, which ensures that a contract cannot emit nullifiers that affect other contracts.

```
fn compute_siloed_nullifier(nullifier, contract):
  return hash([contract, nullifier], OUTER_NULLIFIER)
```

Nullifiers are primarily used for privately marking notes as consumed. When a note is consumed in an application, the application computes and emits a deterministic nullifier associated to the note. If a user attempts to consume the same note more than once, the same nullifier will be generated, and will be rejected on insertion by the nullifier tree.

Nullifiers provide privacy by being computed using a deterministic secret value, such as the owner siloed nullifier secret key, or a random value stored in an encrypted note. This ensures that, without knowledge of the secret value, it is not possible to calculate the associated nullifier, and thus it is not possible to link a nullifier to its associated note commitment.

Applications are not constrained by the protocol on how the nullifier for a note is computed. It is responsibility of the application to guarantee determinism in calculating a nullifier, otherwise the same note could be spent multiple times.

Furthermore, nullifiers can be emitted by an application just to ensure that an action can be executed only once, such as initializing a value, and are not required to be linked to a note commitment.
