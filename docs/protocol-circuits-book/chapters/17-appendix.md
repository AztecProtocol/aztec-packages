# Appendix: Glossary and References

## Glossary

### A

**Anchor Block**: The historical block header referenced by a transaction during execution. Proves the transaction executed against a valid state.

**AVM (Aztec Virtual Machine)**: The virtual machine that executes public functions on sequencer nodes. Similar to EVM but with Aztec-specific features.

**Archive Tree**: Append-only Merkle tree storing block header hashes. Provides historical state references.

### B

**Blob**: A 128 KB data chunk attached to Ethereum transactions (EIP-4844). Used for data availability.

**Block Root**: Circuit that creates a block header and inserts it into the archive tree.

### C

**Checkpoint**: A group of blocks within an epoch. Finalizes blob commitments.

**Chonk Verifier**: Circuit that verifies hiding-kernel-to-public proofs before AVM execution.

**Composer**: Unconstrained function that generates circuit outputs (see Validator).

**Counter**: A numeric value ordering side effects within a transaction.

### D

**DA (Data Availability)**: Guarantee that all data needed to reconstruct state is publicly accessible.

**Domain Separator**: A constant added to hashes to prevent cross-domain collisions.

### E

**Epoch**: The largest unit of rollup aggregation. Contains checkpoints and produces the final L1 proof.

### F

**Fee Payer**: The address responsible for paying transaction fees.

**FeeJuice**: Aztec's native token for paying transaction fees.

### G

**Greedy Tree**: A binary tree constructed by merging proofs as soon as two adjacent proofs are available.

### H

**Hiding Kernel**: Circuit that wraps private kernel output, hiding internal execution details.

**Honk**: The proving system used by Aztec for most circuits.

### I

**Indexed Tree**: Merkle tree supporting non-membership proofs through sorted leaves with pointers.

**in_hash**: The root of L1-to-L2 messages for a checkpoint.

### K

**Kernel Circuit**: Circuit validating private function execution and accumulating side effects.

**KZG Commitment**: Polynomial commitment scheme used for blob verification.

### L

**L1-to-L2 Message**: Message sent from Ethereum to Aztec.

**L2-to-L1 Message**: Message sent from Aztec to Ethereum.

### M

**Membership Proof**: Proof that a leaf exists in a Merkle tree.

**Merge Circuit**: Circuit combining two proofs into one (TX Merge, Block Merge, etc.).

### N

**Non-Membership Proof**: Proof that a value does NOT exist in an indexed Merkle tree.

**Note**: A piece of private state, stored as an encrypted commitment.

**Note Hash**: Cryptographic commitment to a note's contents.

**Nullifier**: Value marking a note as "spent" without revealing which note.

### O

**out_hash**: The root of L2-to-L1 messages for a block/checkpoint.

### P

**Parity Circuit**: Circuit processing L1-to-L2 messages into a subtree.

**Poseidon2**: ZK-friendly hash function used for most protocol hashing.

**PXE (Private Execution Environment)**: Client-side runtime executing private functions.

**Public Data Tree**: Indexed Merkle tree storing public contract state.

### R

**Reset Kernel**: Kernel circuit that squashes transient data and validates read requests.

**Root Rollup**: Final circuit producing the epoch proof for L1 verification.

### S

**Scoped**: A value tagged with its originating contract address.

**Sequencer**: Node that orders transactions and produces blocks.

**Side Effect**: Any state change: note hashes, nullifiers, logs, messages.

**Siloing**: Adding contract address to a hash to prevent cross-contract collisions.

**Snapshot**: Record of a tree's root and next available leaf index.

**Sponge**: Cryptographic construction for accumulating data (absorb) and producing hashes (squeeze).

**Squashing**: Removing transient note hash/nullifier pairs from accumulated data.

### T

**Tail Kernel**: Final private kernel circuit for private-only transactions.

**TailToPublic Kernel**: Final private kernel circuit for transactions with public calls.

**TX Base**: Circuit processing individual transactions in the rollup.

### V

**Validator**: Constrained function that verifies composer outputs (see Composer).

**VK (Verification Key)**: Key used to verify a zero-knowledge proof.

**VK Tree**: Merkle tree containing all valid verification keys.

### Z

**Zero-Knowledge Proof**: Proof that a statement is true without revealing the underlying data.

## References

### Aztec Documentation

- [Aztec Docs](https://docs.aztec.network) - Official documentation
- [noir-protocol-circuits/ABOUT.md](../../noir-projects/noir-protocol-circuits/ABOUT.md) - Circuit documentation

### Technical Resources

- [EIP-4844](https://eips.ethereum.org/EIPS/eip-4844) - Proto-Danksharding
- [KZG Commitments](https://dankradfeist.de/ethereum/2020/06/16/kate-polynomial-commitments.html) - Polynomial commitments
- [Poseidon2](https://eprint.iacr.org/2023/323) - Hash function specification

### Diagrams

- [Circuit Topology Diagram](https://drive.google.com/drive/folders/1odV663TQs1DULL1-CIX7SNEH5iEKPa9g) - draw.io diagram

### Code References

Key files in `noir-projects/noir-protocol-circuits/`:

```
crates/
  types/src/constants.nr          - Protocol constants
  types/src/merkle_tree/          - Tree implementations
  types/src/blob_data/            - Blob protocol
  private-kernel-lib/             - Private kernel components
  rollup-lib/                     - Rollup circuit components
```

## Change Log

This book is based on the `aztec-packages` repository. As the protocol evolves, circuits and constants may change. Always refer to the source code for the most current implementation.

---

**End of Book**
