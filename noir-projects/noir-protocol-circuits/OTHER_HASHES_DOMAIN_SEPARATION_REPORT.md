# Non-Poseidon2 Hashing and Domain Separation Report

This document provides a comprehensive list of all non-Poseidon2 hash usages in `noir-protocol-circuits`, including SHA256, Pedersen, and other hash functions.

## Key Findings

- **SHA256 has NO domain separation** - All 8 production uses of SHA256 lack domain separators
- **Pedersen wrapper supports separation** - But the only actual usage (test code) doesn't use it
- **No Keccak or Blake usage** - These hash functions are not used in this crate
- **Potential collision risks** - Multiple 2-field SHA256 hashes could collide

## Hash Functions Found

| Hash Function | Production Uses | Test Uses | Domain Separation |
|---------------|-----------------|-----------|-------------------|
| SHA256 (`sha256_to_field`, `accumulate_sha256`) | 8 | Many | **NONE** |
| Pedersen (`pedersen_hash`) | 0 | 1 | Wrapper supports it |
| Keccak | 0 | 0 | N/A |
| Blake | 0 | 0 | N/A |

---

## SHA256 Hashes

> **WARNING:** None of the SHA256 hashes use domain separation. This means hashes with the same byte-length input could potentially collide across different contexts.

### Core Functions

#### 1. `sha256_to_field`
- **File**: `crates/types/src/hash.nr:30-34`
- **Purpose**: Base function that computes SHA256 and truncates to a field element
- **Domain Separation**: **NONE**
```noir
pub fn sha256_to_field<let N: u32>(bytes_to_hash: [u8; N]) -> Field {
    let sha256_hashed = sha256::digest(bytes_to_hash);
    let hash_in_a_field = field_from_bytes_32_trunc(sha256_hashed);
    hash_in_a_field
}
```

#### 2. `accumulate_sha256`
- **File**: `crates/types/src/hash.nr:214-220`
- **Preimage**: 64 bytes (two 32-byte field encodings)
- **Purpose**: Hashes two fields together for Merkle trees and accumulation
- **Domain Separation**: **NONE**
```noir
pub fn accumulate_sha256(v0: Field, v1: Field) -> Field {
    let v0_as_bytes: [u8; 32] = v0.to_be_bytes();
    let v1_as_bytes: [u8; 32] = v1.to_be_bytes();
    let hash_input_flattened = v0_as_bytes.concat(v1_as_bytes);
    sha256_to_field(hash_input_flattened)
}
```

---

### Production Uses of SHA256

#### 3. `compute_l2_to_l1_hash`
- **File**: `crates/types/src/hash.nr:164-191`
- **Preimage**: 148 bytes (contract_address, rollup_version_id, recipient, chain_id, content)
- **Purpose**: Computing L2 to L1 message hashes for cross-chain communication
- **Domain Separation**: **NONE** (but has unique 148-byte structure)
```noir
pub fn compute_l2_to_l1_hash(
    contract_address: AztecAddress,
    recipient: EthAddress,
    content: Field,
    rollup_version_id: Field,
    chain_id: Field,
) -> Field {
    // ... builds 148-byte array ...
    sha256_to_field(bytes)
}
```

#### 4. `CheckpointHeader::hash`
- **File**: `crates/types/src/abis/checkpoint_header.nr:97-100`
- **Preimage**: `CHECKPOINT_HEADER_SIZE_IN_BYTES` bytes (316 bytes)
- **Purpose**: Hashing checkpoint headers for L1 verification
- **Domain Separation**: **NONE** (but has unique 316-byte structure)
```noir
impl Hash for CheckpointHeader {
    fn hash(self) -> Field {
        sha256_to_field(self.to_be_bytes())
    }
}
```

#### 5. `BlobAccumulator::init` (blob_commitments_hash)
- **File**: `crates/blob/src/abis/blob_accumulator.nr:81`
- **Preimage**: Compressed blob commitment bytes (96 bytes)
- **Purpose**: Initial blob commitment hash for batched KZG proofs
- **Domain Separation**: **NONE**
```noir
blob_commitments_hash_acc: sha256_to_field(first_output.c_i.compressed),
```

#### 6. `BlobAccumulator::accumulate` (blob_commitments_hash)
- **File**: `crates/blob/src/abis/blob_accumulator.nr:129-132`
- **Preimage**: Previous hash (32 bytes) + new commitment (96 bytes) = 128 bytes
- **Purpose**: Accumulating blob commitment hashes
- **Domain Separation**: **NONE**
```noir
blob_commitments_hash_acc: sha256_to_field(self
    .blob_commitments_hash_acc
    .to_be_bytes::<32>()
    .concat(other.c_i.compressed)),
```

#### 7. `accumulate_out_hash` (Tx Merge)
- **File**: `crates/rollup-lib/src/tx_merge/utils/merge_tx_rollups.nr:4-11`
- **Preimage**: 64 bytes (two 32-byte hashes)
- **Purpose**: Merging transaction output hashes during rollup
- **Domain Separation**: **NONE**
```noir
pub fn accumulate_out_hash(left_out_hash: Field, right_out_hash: Field) -> Field {
    if left_out_hash == 0 {
        right_out_hash
    } else if right_out_hash == 0 {
        left_out_hash
    } else {
        accumulate_sha256(left_out_hash, right_out_hash)
    }
}
```

#### 8. `MerkleTree::new_sha`
- **File**: `crates/types/src/merkle_tree/merkle_tree.nr:21-24`
- **Preimage**: 64 bytes per hash (two 32-byte siblings)
- **Purpose**: Building SHA256-based Merkle trees
- **Domain Separation**: **NONE**
```noir
pub fn new_sha(leaves: [Field; N]) -> Self {
    let nodes = compute_merkle_tree_nodes(leaves, accumulate_sha256);
    MerkleTree { leaves, nodes }
}
```

#### 9. `UnbalancedMerkleTree::new_sha`
- **File**: `crates/types/src/merkle_tree/unbalanced_merkle_tree.nr:12-22`
- **Preimage**: 64 bytes per hash (two 32-byte siblings)
- **Purpose**: Building unbalanced SHA256-based Merkle trees
- **Domain Separation**: **NONE**
```noir
pub fn new_sha<let N: u32, let MAX_SUBTREES: u32>(
    leaves: [Field; N],
    num_non_empty_leaves: u32,
) -> Self {
    let root = compute_unbalanced_merkle_root::<N, MAX_SUBTREES>(
        leaves,
        num_non_empty_leaves,
        accumulate_sha256,
    );
    UnbalancedMerkleTree { root }
}
```

---

## Pedersen Hashes

### Core Function

#### 1. `pedersen_hash` (Wrapper)
- **File**: `crates/types/src/hash.nr:224-226`
- **Domain Separation**: **SUPPORTS** via `hash_index` parameter
- **Note**: This is just a wrapper around `std::hash::pedersen_hash_with_separator`
```noir
pub fn pedersen_hash<let N: u32>(inputs: [Field; N], hash_index: u32) -> Field {
    std::hash::pedersen_hash_with_separator(inputs, hash_index)
}
```

### Usages

#### 2. `TestLeafPreimage::as_leaf` (Test Only)
- **File**: `crates/types/src/tests/types/test_leaf_preimage.nr:20-22`
- **Preimage**: `[self.value]` (1 field)
- **Purpose**: Test leaf preimage hashing
- **Domain Separation**: **NONE** (uses `std::hash::pedersen_hash` directly, not the wrapper)
```noir
fn as_leaf(self) -> Field {
    pedersen_hash([self.value])
}
```

---

## Summary

| Category | Count |
|----------|-------|
| SHA256 hashes (production) | 8 |
| SHA256 hashes WITH domain separator | **0** |
| Pedersen hashes (production) | 0 |
| Pedersen hashes (test) | 1 |

---

## Security Considerations

### Critical: No Domain Separation in SHA256

All SHA256 usages lack domain separation. While some have unique input sizes that provide implicit separation, this is not a robust security practice.

#### Potential Collision Risks by Input Size:

| Input Size | Usages | Risk Level |
|------------|--------|------------|
| 64 bytes | `accumulate_sha256`, `accumulate_out_hash`, Merkle trees | **HIGH** - Multiple uses with same size |
| 96 bytes | `BlobAccumulator::init` | Low - Unique structure |
| 128 bytes | `BlobAccumulator::accumulate` | Low - Unique structure |
| 148 bytes | `compute_l2_to_l1_hash` | Low - Unique structure |
| 316 bytes | `CheckpointHeader::hash` | Low - Unique structure |

### High-Risk: 64-byte SHA256 Hashes

The following all hash 64 bytes (two fields) without any domain separation:

1. **`accumulate_sha256`** - Generic 2-field hash
2. **`accumulate_out_hash`** - Tx output hash accumulation
3. **`MerkleTree::new_sha`** - SHA Merkle tree nodes
4. **`UnbalancedMerkleTree::new_sha`** - Unbalanced SHA Merkle tree nodes

**Scenario**: If the same two field values are used in different contexts (e.g., as Merkle siblings vs. as output hashes), they would produce identical hashes.

### Why This May Be Acceptable

1. **Context isolation**: These hashes are used in separate, non-overlapping contexts
2. **Value constraints**: The fields being hashed have different semantic meanings and value ranges
3. **L1 compatibility**: SHA256 is used specifically for Ethereum/L1 compatibility where domain separation may not be standard

### Recommendations

1. **Add domain separators to SHA256**: Prepend a domain byte to differentiate contexts:
   ```noir
   // Example: Add domain byte for Merkle hashing
   fn merkle_sha256(left: Field, right: Field) -> Field {
       let mut bytes = [0u8; 65];
       bytes[0] = 0x01; // Domain separator for Merkle
       // ... copy left and right ...
       sha256_to_field(bytes)
   }
   ```

2. **Document intentional omissions**: If domain separation is intentionally omitted (e.g., for L1 compatibility), document this clearly.

3. **Review cross-context usage**: Audit all places where 64-byte SHA256 hashes are used to ensure no cross-context collisions are possible.

---

## Comparison with Poseidon2

| Aspect | Poseidon2 | SHA256 |
|--------|-----------|--------|
| Domain separation function | `poseidon2_hash_with_separator` | **None** |
| % with domain separation | ~50% | **0%** |
| Separator placement | Start of preimage | N/A |
| Primary use case | In-circuit hashing | L1/cross-chain compatibility |
