# Chapter 14: Data Availability and Blobs

## Overview

Data availability (DA) ensures that all data needed to reconstruct Aztec state is publicly accessible. Aztec uses Ethereum's EIP-4844 blob transactions for DA, combined with Poseidon2 sponges and KZG commitments for efficient verification.

## What is a Blob?

Before diving into technical details, let's understand what a "blob" is in plain terms.

### The Problem: Storing Rollup Data

When Aztec processes thousands of transactions, it needs to store the resulting data somewhere that anyone can access. This data includes:
- New note hashes (private state commitments)
- Nullifiers (spent note markers)
- Public state changes
- Logs and messages

Historically, rollups stored this data in Ethereum transaction calldata. But calldata is expensive because every Ethereum node must store it forever and process it during block validation.

### The Solution: Blobs

In March 2024, Ethereum introduced "blobs" through EIP-4844 (also called "Proto-Danksharding"). A blob is essentially a **temporary data attachment** to an Ethereum transaction:

```
Traditional Transaction:
+------------------+
| To: 0x123...     |
| Value: 1 ETH     |
| Data: 0xabc...   |  <- Calldata (expensive, permanent)
+------------------+

Transaction with Blob:
+------------------+     +------------------+
| To: 0x123...     |     |                  |
| Value: 1 ETH     | +-> | 128 KB of data   |  <- Blob (cheap, temporary)
| Blob commitment  |     |                  |
+------------------+     +------------------+
```

### Key Properties of Blobs

1. **Cheaper**: ~10-20x cheaper than calldata
2. **Temporary**: Stored for ~18 days, then pruned from consensus nodes
3. **Large**: Each blob holds 128 KB (~4096 field elements)
4. **Committed**: A cryptographic commitment proves what data is in the blob

### Why Temporary is OK

You might wonder: if blobs are deleted after 18 days, how can we reconstruct Aztec state later?

The answer: **archive services**. Before blobs expire:
- Archive nodes save copies
- Services like Blobscan store them permanently
- Anyone running an Aztec node can save relevant blobs

The temporary nature is a feature, not a bug - it keeps Ethereum nodes lightweight while still providing a window for data to be preserved.

## Why Data Availability Matters

Without DA guarantees:
- Users couldn't verify state transitions
- New nodes couldn't sync
- The rollup would be a trusted system

With DA:
- Anyone can reconstruct state from L1 data
- The protocol is trustless
- State is recoverable even if all Aztec nodes disappear

## The Blob Protocol

### EIP-4844 Blobs

Ethereum's EIP-4844 introduced "blobs" - large data chunks attached to transactions:

```
Blob Properties
+------------------------------------------+
| Size: 4096 field elements (128 KB)       |
| Cost: Much cheaper than calldata         |
| Retention: ~18 days on consensus layer   |
| Commitment: KZG polynomial commitment    |
+------------------------------------------+
```

### Aztec's Blob Usage

Each checkpoint uses up to **6 blobs**:

```
Checkpoint Blob Capacity:
  6 blobs x 4096 fields = 24,576 fields per checkpoint
```

This must accommodate all transaction data for the checkpoint.

## Data Accumulation: The Sponge

Aztec uses a **Poseidon2 sponge** to accumulate transaction data.

### What is a Sponge?

Imagine you're making a smoothie. You keep adding ingredients (absorbing), and at the end, you pour out the result (squeezing). A cryptographic sponge works similarly:

- **Absorb**: Feed data into the sponge (like adding ingredients)
- **Squeeze**: Extract a hash from the sponge (like pouring out the smoothie)

The key property: the squeezed output is a **commitment** to ALL the absorbed data. Change any ingredient, and you get a completely different result.

```
Sponge Analogy:

  [Apple] -> [Banana] -> [Orange] -> SQUEEZE -> "ABC123"
  
  [Apple] -> [Grape]  -> [Orange] -> SQUEEZE -> "XYZ789"
                ^
                Different input = completely different output
```

A sponge construction has two operations:
- **Absorb**: Feed data into the sponge
- **Squeeze**: Extract a hash from the sponge

```
Sponge Operations:
  sponge.absorb(data_1)
  sponge.absorb(data_2)
  ...
  hash = sponge.squeeze()
```

The squeezed hash commits to ALL absorbed data.

### Sponge Flow Through Circuits

```
TX Base:
  sponge.absorb(tx_effects)
        |
        v
TX Merge:
  propagate(sponge)
        |
        v
Block Root:
  sponge.absorb(block_end_marker)
        |
        v
Block Merge:
  propagate(sponge)
        |
        v
Checkpoint Root:
  sponge.absorb(checkpoint_end_marker)
  blob_hash = sponge.squeeze()
```

### Transaction Effects

Each transaction absorbs:

```
TX Effects Absorbed
+------------------------------------------+
| tx_hash: Transaction identifier          |
| revert_code: 0 or 1                      |
| tx_fee: Computed fee                     |
| note_hashes: [Field; N]                  |
| nullifiers: [Field; M]                   |
| l2_to_l1_msgs: [Field; K]                |
| public_data_writes: [(slot, value); P]   |
| private_logs: [LogData; Q]               |
| public_logs: [LogData; R]                |
| contract_class_logs: [LogData; S]        |
+------------------------------------------+
```

### Block End Marker

Each block adds:

```
Block End Marker
+------------------------------------------+
| block_number                             |
| block_header_hash                        |
| timestamp                                |
| note_hash_tree_root                      |
| nullifier_tree_root                      |
| public_data_tree_root                    |
+------------------------------------------+
```

### Checkpoint End Marker

Each checkpoint finalizes with:

```
Checkpoint End Marker
+------------------------------------------+
| total_fields_absorbed                    |
| padding (zeros to align to blob boundary)|
+------------------------------------------+
```

## KZG Commitments

### What is a KZG Commitment?

KZG (Kate-Zaverucha-Goldberg) commitments are a way to prove you know a large amount of data without revealing all of it.

**Analogy**: Imagine you have a book with 1000 pages. You want to prove to someone that you have the book, but you don't want to show them all 1000 pages. With KZG:

1. You create a tiny "fingerprint" of the whole book (the commitment)
2. Later, someone can ask "what's on page 537?"
3. You provide page 537 plus a small proof
4. They can verify page 537 matches your fingerprint, without seeing other pages

This is incredibly useful for blobs:
- The commitment is tiny (one elliptic curve point, ~48 bytes)
- The blob is large (128 KB)
- Verification is fast (one pairing check)

### How KZG Works (Simplified)

The magic of KZG relies on treating data as a polynomial:

### Polynomial Representation

Each blob is interpreted as a polynomial:

```
Blob = [f_0, f_1, f_2, ..., f_4095]

Polynomial: p(X) = f_0 + f_1*X + f_2*X^2 + ... + f_4095*X^4095
```

### KZG Commitment

A KZG commitment `C` is a single elliptic curve point that commits to the entire polynomial:

```
C = [p(s)]_1  (where s is a secret from trusted setup)
```

### Point Evaluation

To prove `p(z) = y`:
- Prover provides opening proof pi
- Verifier checks: e(C - [y]_1, [1]_2) = e(pi, [s - z]_2)

This is a single pairing check!

## Batch Verification

### The Challenge

With 6 blobs per checkpoint, we need to verify 6 KZG openings. Naive approach: 6 pairing checks.

### The Solution: Batching

Use random challenges to combine all openings:

```
Batching:
1. Compute z = hash(C_0, C_1, ..., C_5, ...)
2. Compute gamma = hash(z, C_0, C_1, ..., C_5, ...)
3. Batched commitment: C = sum(gamma^i * C_i)
4. Batched evaluation: y = sum(gamma^i * y_i)
5. Single pairing check verifies all blobs!
```

### Circuit Computation

Checkpoint root circuits compute:

```rust
// Pseudo-code
let mut C_batched = Point::zero();
let mut y_batched = Field::zero();

for i in 0..6 {
    let gamma_power = gamma.pow(i);
    C_batched += gamma_power * blob_commitments[i];
    y_batched += gamma_power * evaluations[i];
}
```

## Blob Public Inputs

The root rollup outputs blob data for L1:

```
BlobPublicInputs
+------------------------------------------+
| z: Evaluation point                      |
| y: Batched evaluation                    |
| C: Batched commitment (compressed)       |
| blob_commitments_hash: Hash of all C_i   |
+------------------------------------------+
```

## L1 Verification

On Ethereum:

```solidity
// Simplified
function verifyBlobs(
    BlobPublicInputs memory inputs,
    bytes[] calldata blobs
) {
    // 1. Verify blob commitments match
    bytes32 actualHash = keccak256(abi.encode(blobs));
    require(actualHash == inputs.blob_commitments_hash);
    
    // 2. Verify KZG opening (single pairing check)
    require(verifyKZG(inputs.C, inputs.z, inputs.y));
}
```

## Data Recovery

### From L1 Consensus Layer

Blobs are available on Ethereum's consensus layer for ~18 days:

```
Recovery from consensus:
1. Query beacon node for blob sidecars
2. Extract blob data
3. Parse transaction effects
4. Rebuild state
```

### From Archives

After 18 days, blobs are available from:
- Archive services (Blobscan, etc.)
- Aztec archive nodes
- Cloud storage (S3, GCS, R2)

```
Recovery from archive:
1. Query archive service for blob data
2. Verify against commitments
3. Parse and rebuild
```

## Data Format

### Blob Field Encoding

Each field element is encoded as 32 bytes:

```
Field Encoding:
- Fields are BN254 scalar field elements
- Max value: ~2^254
- Encoded as big-endian 32-byte integers
```

### Parsing Transaction Effects

```
Blob Data Layout:
+------------------------------------------+
| Block 1, TX 1 effects                    |
| Block 1, TX 2 effects                    |
| Block 1, TX N effects                    |
| Block 1 end marker                       |
| Block 2, TX 1 effects                    |
| ...                                      |
| Checkpoint end marker                    |
| Padding (zeros)                          |
+------------------------------------------+
```

## Security Properties

### Commitment Binding

Once blob commitments are on L1:
- Prover cannot change blob data without detection
- KZG commitment is binding

### Data Ordering

The sponge ensures:
- Data is processed in order
- No data can be inserted or removed
- Squeeze commits to exact input sequence

### Challenge Security

Fiat-Shamir challenges ensure:
- Batching is sound
- Prover cannot predict challenge before committing
- Single verification is as secure as N verifications

## Summary

```
Data Flow:
TX Effects -> Sponge -> Squeeze -> Polynomial -> KZG Commitment -> L1

Verification:
L1 Blobs -> Hash Check -> KZG Verification -> Data Available
```

| Component | Purpose |
|-----------|---------|
| Poseidon2 Sponge | Accumulate data, produce hash |
| Blob (EIP-4844) | Cheap L1 data storage |
| KZG Commitment | Efficient verification |
| Batch Verification | Single check for all blobs |

\newpage
