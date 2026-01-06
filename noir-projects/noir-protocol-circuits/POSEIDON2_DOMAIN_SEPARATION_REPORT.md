# Poseidon2 Hashing and Domain Separation Report

This document provides a comprehensive list of all Poseidon2 hash usages in `noir-protocol-circuits`, including domain separators.

## Key Findings

- **~50% of hashes lack domain separation** - 19 uses of `poseidon2_hash` (incl. variants) vs 17 uses of `poseidon2_hash_with_separator`
- **Domain separator is always at the START** - No instances of separator at the end
- **16 unique domain separators are used** - Out of 37 defined constants

## Domain Separator Placement

**The domain separator is placed at the START of the preimage.**

From `crates/types/src/hash.nr:230-236`:
```noir
pub fn poseidon2_hash_with_separator<let N: u32, T>(inputs: [Field; N], separator: T) -> Field
where
    T: ToField,
{
    let inputs_with_separator = [separator.to_field()].concat(inputs);
    poseidon2_hash(inputs_with_separator)
}
```

---

## Domain Separator Constants

Defined in `crates/types/src/constants.nr:631-718`. Tests for domain separator consistency are in `crates/types/src/domain_separators.nr`.

### Note Hashes

| Value | Constant Name |
|-------|---------------|
| 1 | `DOM_SEP__NOTE_HASH` |
| 2 | `DOM_SEP__NOTE_HASH_NONCE` |
| 3 | `DOM_SEP__UNIQUE_NOTE_HASH` |
| 4 | `DOM_SEP__SILOED_NOTE_HASH` |

### Nullifiers

| Value | Constant Name |
|-------|---------------|
| 5 | `DOM_SEP__MESSAGE_NULLIFIER` |
| 6 | `DOM_SEP__INITIALIZATION_NULLIFIER` |
| 7 | `DOM_SEP__OUTER_NULLIFIER` |
| 53 | `DOM_SEP__NOTE_NULLIFIER` |

### Public Storage

| Value | Constant Name |
|-------|---------------|
| 23 | `DOM_SEP__PUBLIC_LEAF_INDEX` |

### Contract Address

| Value | Constant Name |
|-------|---------------|
| 11 | `DOM_SEP__FUNCTION_LEAF` |
| 13 | `DOM_SEP__CONSTRUCTOR` |
| 15 | `DOM_SEP__CONTRACT_ADDRESS_V1` |
| 16 | `DOM_SEP__CONTRACT_CLASS_ID` |
| 27 | `DOM_SEP__PARTIAL_ADDRESS` |
| 60 | `DOM_SEP__PUBLIC_BYTECODE` |

### Keys

| Value | Constant Name |
|-------|---------------|
| 48 | `DOM_SEP__NSK_M` |
| 49 | `DOM_SEP__IVSK_M` |
| 50 | `DOM_SEP__OVSK_M` |
| 51 | `DOM_SEP__TSK_M` |
| 52 | `DOM_SEP__PUBLIC_KEYS_HASH` |

### Transactions and Blocks

| Value | Constant Name |
|-------|---------------|
| 28 | `DOM_SEP__BLOCK_HASH` |
| 33 | `DOM_SEP__TX_REQUEST` |
| 56 | `DOM_SEP__PUBLIC_TX_HASH` |
| 57 | `DOM_SEP__PRIVATE_TX_HASH` |

### Protocol

| Value | Constant Name |
|-------|---------------|
| 43 | `DOM_SEP__PUBLIC_CALLDATA` |
| 44 | `DOM_SEP__FUNCTION_ARGS` |
| 59 | `DOM_SEP__EVENT_COMMITMENT` |
| 61 | `DOM_SEP__PROTOCOL_CONTRACTS` |

### Authwit (may be used by protocol contracts)

| Value | Constant Name |
|-------|---------------|
| 45 | `DOM_SEP__AUTHWIT_INNER` |
| 46 | `DOM_SEP__AUTHWIT_OUTER` |
| 47 | `DOM_SEP__AUTHWIT_NULLIFIER` |

### Encryption and Notes (may be used by protocol contracts)

| Value | Constant Name |
|-------|---------------|
| 54 | `DOM_SEP__SYMMETRIC_KEY` (u8) |
| 55 | `DOM_SEP__SYMMETRIC_KEY_2` (u8) |
| 58 | `DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT` |

### Other (may move to aztec-nr)

| Value | Constant Name |
|-------|---------------|
| 20 | `DOM_SEP__SECRET_HASH` |
| 32 | `DOM_SEP__TX_NULLIFIER` |
| 34 | `DOM_SEP__SIGNATURE_PAYLOAD` |

---

## Hashes WITH Domain Separation

### 1. `compute_note_hash_nonce`
- **File**: `crates/types/src/hash.nr:52-58`
- **Domain Separator**: `DOM_SEP__NOTE_HASH_NONCE` (2)
- **Preimage**: `[first_nullifier_in_tx, note_index_in_tx]`
- **Purpose**: Computing unique nonce for note hashes
```noir
pub fn compute_note_hash_nonce(first_nullifier_in_tx: Field, note_index_in_tx: u32) -> Field {
    poseidon2_hash_with_separator(
        [first_nullifier_in_tx, note_index_in_tx as Field],
        DOM_SEP__NOTE_HASH_NONCE,
    )
}
```

### 2. `compute_unique_note_hash`
- **File**: `crates/types/src/hash.nr:61-63`
- **Domain Separator**: `DOM_SEP__UNIQUE_NOTE_HASH` (3)
- **Preimage**: `[note_nonce, siloed_note_hash]`
- **Purpose**: Computing unique note hashes from siloed hashes
```noir
pub fn compute_unique_note_hash(note_nonce: Field, siloed_note_hash: Field) -> Field {
    let inputs = [note_nonce, siloed_note_hash];
    poseidon2_hash_with_separator(inputs, DOM_SEP__UNIQUE_NOTE_HASH)
}
```

### 3. `compute_siloed_note_hash`
- **File**: `crates/types/src/hash.nr:75-79`
- **Domain Separator**: `DOM_SEP__SILOED_NOTE_HASH` (4)
- **Preimage**: `[app.to_field(), note_hash]`
- **Purpose**: Siloing note hashes to specific contract addresses
```noir
pub fn compute_siloed_note_hash(app: AztecAddress, note_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [app.to_field(), note_hash],
        DOM_SEP__SILOED_NOTE_HASH,
    )
}
```

### 4. `compute_siloed_nullifier`
- **File**: `crates/types/src/hash.nr:102-107`
- **Domain Separator**: `DOM_SEP__OUTER_NULLIFIER` (7)
- **Preimage**: `[app.to_field(), nullifier]`
- **Purpose**: Siloing nullifiers to specific contract addresses
```noir
pub fn compute_siloed_nullifier(contract_address: AztecAddress, nullifier: Field) -> Field {
    poseidon2_hash_with_separator(
        [contract_address.to_field(), nullifier],
        DOM_SEP__OUTER_NULLIFIER,
    )
}
```

### 5. `compute_app_secret_key`
- **File**: `crates/types/src/hash.nr:146-155`
- **Domain Separator**: Dynamic `app_secret_generator` (passed as argument)
- **Preimage**: `[master_secret_key.hi, master_secret_key.lo, app_address.to_field()]`
- **Purpose**: Computing app-specific secret keys
```noir
pub fn compute_app_secret_key(
    master_secret_key: EmbeddedCurveScalar,
    app_address: AztecAddress,
    app_secret_generator: Field,
) -> Field {
    poseidon2_hash_with_separator(
        [master_secret_key.hi, master_secret_key.lo, app_address.to_field()],
        app_secret_generator,
    )
}
```

### 6. `compute_public_data_leaf_slot`
- **File**: `crates/types/src/data/hash.nr:3-7`
- **Domain Separator**: `DOM_SEP__PUBLIC_LEAF_INDEX` (23)
- **Preimage**: `[contract_address.to_field(), storage_slot]`
- **Purpose**: Computing public data leaf slots
```noir
pub fn compute_public_data_leaf_slot(contract_address: AztecAddress, storage_slot: Field) -> Field {
    crate::hash::poseidon2_hash_with_separator(
        [contract_address.to_field(), storage_slot],
        DOM_SEP__PUBLIC_LEAF_INDEX,
    )
}
```

### 7. `ContractClassFunctionLeafPreimage::hash`
- **File**: `crates/types/src/abis/contract_class_function_leaf_preimage.nr:11-17`
- **Domain Separator**: `DOM_SEP__FUNCTION_LEAF` (11)
- **Preimage**: `[self.selector.to_field(), self.vk_hash]`
- **Purpose**: Hashing contract class function leaf preimages
```noir
impl Hash for ContractClassFunctionLeafPreimage {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(
            [self.selector.to_field(), self.vk_hash],
            DOM_SEP__FUNCTION_LEAF,
        )
    }
}
```

### 8. `ContractClassId::compute`
- **File**: `crates/types/src/contract_class_id.nr:29-38`
- **Domain Separator**: `DOM_SEP__CONTRACT_CLASS_ID` (16)
- **Preimage**: `[artifact_hash, private_functions_root, public_bytecode_commitment]`
- **Purpose**: Computing contract class IDs
```noir
pub fn compute(
    artifact_hash: Field,
    private_functions_root: Field,
    public_bytecode_commitment: Field,
) -> Self {
    let hash = crate::hash::poseidon2_hash_with_separator(
        [artifact_hash, private_functions_root, public_bytecode_commitment],
        DOM_SEP__CONTRACT_CLASS_ID,
    );
    ContractClassId::from_field(hash)
}
```

### 9. `AztecAddress::compute`
- **File**: `crates/types/src/address/aztec_address.nr:86-92`
- **Domain Separator**: `DOM_SEP__CONTRACT_ADDRESS_V1` (15)
- **Preimage**: `[public_keys_hash.to_field(), partial_address.to_field()]`
- **Purpose**: Computing contract addresses from partial addresses
```noir
pub fn compute(public_keys: PublicKeys, partial_address: PartialAddress) -> AztecAddress {
    let public_keys_hash = public_keys.hash();
    let pre_address = poseidon2_hash_with_separator(
        [public_keys_hash.to_field(), partial_address.to_field()],
        DOM_SEP__CONTRACT_ADDRESS_V1,
    );
    // ... derive address point
}
```

### 10. `PartialAddress::compute_from_salted_initialization_hash`
- **File**: `crates/types/src/address/partial_address.nr:45-52`
- **Domain Separator**: `DOM_SEP__PARTIAL_ADDRESS` (27)
- **Preimage**: `[contract_class_id.to_field(), salted_initialization_hash.to_field()]`
- **Purpose**: Computing partial addresses
```noir
pub fn compute_from_salted_initialization_hash(
    contract_class_id: ContractClassId,
    salted_initialization_hash: SaltedInitializationHash,
) -> Self {
    PartialAddress::from_field(poseidon2_hash_with_separator(
        [contract_class_id.to_field(), salted_initialization_hash.to_field()],
        DOM_SEP__PARTIAL_ADDRESS,
    ))
}
```

### 11. `SaltedInitializationHash::compute`
- **File**: `crates/types/src/address/salted_initialization_hash.nr:23-27`
- **Domain Separator**: `DOM_SEP__PARTIAL_ADDRESS` (27)
- **Preimage**: `[salt, initialization_hash, deployer.to_field()]`
- **Purpose**: Computing salted initialization hashes
```noir
pub fn compute(salt: Field, initialization_hash: Field, deployer: AztecAddress) -> Self {
    SaltedInitializationHash::from_field(poseidon2_hash_with_separator(
        [salt, initialization_hash, deployer.to_field()],
        DOM_SEP__PARTIAL_ADDRESS,
    ))
}
```

### 12. `BlockHeader::hash`
- **File**: `crates/types/src/abis/block_header.nr:44-47`
- **Domain Separator**: `DOM_SEP__BLOCK_HASH` (28)
- **Preimage**: `self.serialize()` (full block header serialization)
- **Purpose**: Hashing block headers
```noir
impl Hash for BlockHeader {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), DOM_SEP__BLOCK_HASH)
    }
}
```

### 13. `TxRequest::hash`
- **File**: `crates/types/src/abis/transaction/tx_request.nr:31-34`
- **Domain Separator**: `DOM_SEP__TX_REQUEST` (33)
- **Preimage**: `self.serialize()` (full tx request serialization)
- **Purpose**: Hashing transaction requests
```noir
impl Hash for TxRequest {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), DOM_SEP__TX_REQUEST)
    }
}
```

### 14. `PublicKeys::hash`
- **File**: `crates/types/src/public_keys.nr:103-108`
- **Domain Separator**: `DOM_SEP__PUBLIC_KEYS_HASH` (52)
- **Preimage**: `self.serialize()` (full public keys serialization)
- **Purpose**: Hashing public keys
```noir
impl PublicKeys {
    pub fn hash(self) -> PublicKeysHash {
        PublicKeysHash::from_field(poseidon2_hash_with_separator(
            self.serialize(),
            DOM_SEP__PUBLIC_KEYS_HASH as Field,
        ))
    }
}
```

### 15. `PrivateToPublicKernelCircuitPublicInputs::hash`
- **File**: `crates/types/src/abis/kernel_circuit_public_inputs/private_to_public_kernel_circuit_public_inputs.nr:38-41`
- **Domain Separator**: `DOM_SEP__PUBLIC_TX_HASH` (56)
- **Preimage**: `self.serialize()` (full circuit public inputs serialization)
- **Purpose**: Computing public transaction hashes
```noir
impl Hash for PrivateToPublicKernelCircuitPublicInputs {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), DOM_SEP__PUBLIC_TX_HASH)
    }
}
```

### 16. `PrivateToRollupKernelCircuitPublicInputs::hash`
- **File**: `crates/types/src/abis/kernel_circuit_public_inputs/private_to_rollup_kernel_circuit_public_inputs.nr:34-37`
- **Domain Separator**: `DOM_SEP__PRIVATE_TX_HASH` (57)
- **Preimage**: `self.serialize()` (full circuit public inputs serialization)
- **Purpose**: Computing private transaction hashes
```noir
impl Hash for PrivateToRollupKernelCircuitPublicInputs {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), DOM_SEP__PRIVATE_TX_HASH)
    }
}
```

### 17. `ProtocolContracts::hash`
- **File**: `crates/types/src/abis/protocol_contracts.nr:30-35`
- **Domain Separator**: `DOM_SEP__PROTOCOL_CONTRACTS` (61)
- **Preimage**: `self.derived_addresses.map(|address| address.to_field())`
- **Purpose**: Hashing protocol contracts
```noir
pub fn hash(self) -> Field {
    poseidon2_hash_with_separator(
        self.derived_addresses.map(|address| address.to_field()),
        DOM_SEP__PROTOCOL_CONTRACTS,
    )
}
```

---

## Hashes WITHOUT Domain Separation

> **Note:** These hashes use `poseidon2_hash()` directly with no domain separator, meaning preimage collision is possible between hashes with the same number of elements.

### 2-Element Preimages

#### 1. `merkle_hash`
- **File**: `crates/types/src/hash.nr:157-159`
- **Preimage**: `[left, right]`
- **Purpose**: Merkle tree hashing (combining left and right children)
```noir
pub fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash([left, right])
}
```

#### 2. `compute_siloed_private_log_field`
- **File**: `crates/types/src/hash.nr:127-129`
- **Preimage**: `[contract_address.to_field(), field]`
- **Purpose**: Siloing private log fields
```noir
pub fn compute_siloed_private_log_field(contract_address: AztecAddress, field: Field) -> Field {
    poseidon2_hash([contract_address.to_field(), field])
}
```

#### 3. `derive_storage_slot_in_map`
- **File**: `crates/types/src/storage/map.nr:3-8`
- **Preimage**: `[storage_slot, key.to_field()]`
- **Purpose**: Deriving storage slots for map entries
```noir
pub fn derive_storage_slot_in_map<K>(storage_slot: Field, key: K) -> Field
where
    K: ToField,
{
    poseidon2_hash([storage_slot, key.to_field()])
}
```

#### 4. `accumulate_block_headers_hash`
- **File**: `crates/rollup-lib/src/block_merge/utils/merge_block_rollups.nr:4-6`
- **Preimage**: `[left_hash, right_hash]`
- **Purpose**: Accumulating block headers during merge
```noir
pub fn accumulate_block_headers_hash(left_hash: Field, right_hash: Field) -> Field {
    poseidon2_hash([left_hash, right_hash])
}
```

#### 5. `BlobAccumulator::accumulate` (z_acc)
- **File**: `crates/blob/src/abis/blob_accumulator.nr:133`
- **Preimage**: `[self.z_acc, other.z_i]`
- **Purpose**: Accumulating z challenges for blob batching
```noir
z_acc: poseidon2_hash([self.z_acc, other.z_i]),
```

#### 6. `BlobAccumulator::accumulate` (gamma_acc)
- **File**: `crates/blob/src/abis/blob_accumulator.nr:136`
- **Preimage**: `[self.gamma_acc, hashed_y_i]`
- **Purpose**: Accumulating gamma for blob batching
```noir
gamma_acc: poseidon2_hash([self.gamma_acc, hashed_y_i]),
```

#### 7. `validate_final_blob_batching_challenges`
- **File**: `crates/blob/src/utils/validate_final_blob_batching_challenges.nr:14`
- **Preimage**: `[accumulator.gamma_acc, accumulator.z_acc]`
- **Purpose**: Computing final gamma challenge for blob batching validation
```noir
let gamma = poseidon2_hash([accumulator.gamma_acc, accumulator.z_acc]);
```

### 3-Element Preimages

#### 8. `Point::hash`
- **File**: `crates/types/src/point.nr:16-19`
- **Preimage**: `self.serialize()` = `[x, y, is_infinite]`
- **Purpose**: Hashing elliptic curve points
```noir
impl Hash for Point {
    fn hash(self) -> Field {
        poseidon2_hash(self.serialize())
    }
}
```

#### 9. `NullifierLeafPreimage::hash`
- **File**: `crates/types/src/abis/nullifier_leaf_preimage.nr:21-28`
- **Preimage**: `self.serialize()` = `[nullifier, next_nullifier, next_index]`
- **Purpose**: Hashing nullifier leaf preimages for indexed merkle tree
```noir
impl Hash for NullifierLeafPreimage {
    fn hash(self) -> Field {
        if self.is_empty() {
            0
        } else {
            crate::hash::poseidon2_hash(self.serialize())
        }
    }
}
```

#### 10. `compute_blob_challenge` / `evaluate_blob`
- **File**: `crates/blob/src/blob_batching.nr:35-42`, `crates/blob/src/blob.nr:322`
- **Preimage**: `[blob_fields_hash, kzg_commitment[0], kzg_commitment[1]]`
- **Purpose**: Computing challenge z for blob evaluation
```noir
let challenge = poseidon2_hash([blob_fields_hash, compressed_fields[0], compressed_fields[1]]);
```

#### 11. `BlobAccumulator::init` / `accumulate` (hashed y)
- **File**: `crates/blob/src/abis/blob_accumulator.nr:79, 119`
- **Preimage**: `y_i.get_limbs().map(|l| l as Field)` (3 limbs of BLS12_381_Fr)
- **Purpose**: Hashing blob evaluation result for gamma accumulation
```noir
let hashed_y_0 = poseidon2_hash(first_output.y_i.get_limbs().map(|l| l as Field));
```

### 4-Element Preimages

#### 12. `PublicDataTreeLeafPreimage::hash`
- **File**: `crates/types/src/data/public_data_tree_leaf_preimage.nr:21-33`
- **Preimage**: `[slot, value, next_index, next_slot]`
- **Purpose**: Hashing public data tree leaf preimages
```noir
impl Hash for PublicDataTreeLeafPreimage {
    fn hash(self) -> Field {
        if self.is_empty() {
            0
        } else {
            crate::hash::poseidon2_hash([
                self.slot,
                self.value,
                (self.next_index as Field),
                self.next_slot,
            ])
        }
    }
}
```

### Variable-Length Preimages

#### 13. `DelayedPublicMutableValues::hash`
- **File**: `crates/types/src/delayed_public_mutable/delayed_public_mutable_values.nr:131-137`
- **Preimage**: `self.pack()` (packed representation of delayed mutable values)
- **Purpose**: Hashing delayed public mutable values
```noir
impl<T, let INITIAL_DELAY: u64> Hash for DelayedPublicMutableValues<T, INITIAL_DELAY>
where
    T: Packable,
{
    fn hash(self) -> Field {
        poseidon2_hash(self.pack())
    }
}
```

#### 14. `validate_with_hash_hints` (inline hash)
- **File**: `crates/types/src/delayed_public_mutable/with_hash.nr:33`
- **Preimage**: `with_hash_value_hint.pack()`
- **Purpose**: Validating hashed hints for delayed public mutable values
```noir
let hashed_value = poseidon2_hash(with_hash_value_hint.pack());
```

#### 15. `compute_contract_class_log_hash`
- **File**: `crates/types/src/hash.nr:142-144`
- **Preimage**: `log` (array of CONTRACT_CLASS_LOG_SIZE_IN_FIELDS)
- **Purpose**: Hashing contract class logs
```noir
pub fn compute_contract_class_log_hash(log: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]) -> Field {
    poseidon2_hash(log)
}
```

#### 16. `FunctionSelector::from_signature`
- **File**: `crates/types/src/abis/function_selector.nr:33-38`
- **Preimage**: Signature string bytes converted to fields (via `poseidon2_hash_bytes`)
- **Purpose**: Computing function selectors from signature strings
```noir
pub fn from_signature<let N: u32>(signature: str<N>) -> Self {
    let bytes = signature.as_bytes();
    let hash = crate::hash::poseidon2_hash_bytes(bytes);
    FunctionSelector::from_field(hash)
}
```
- **Note**: Uses `poseidon2_hash_bytes` which packs bytes into 31-byte field chunks, then hashes

### Test-Only Hashes

#### 17. Test functions in `blob.nr`
- **File**: `crates/blob/src/blob.nr:362, 389`
- **Preimage**: `blob_fields` (array of blob field elements)
- **Purpose**: Computing blob fields hash in tests
```noir
let blob_fields_hash = poseidon2_hash(blob_fields);
```

#### 18. Test in `rollup_fixture_builder.nr`
- **File**: `crates/rollup-lib/src/tests/rollup_fixture_builder.nr:395`
- **Preimage**: `[end_block_accumulator.gamma_acc, z]`
- **Purpose**: Test fixture for gamma computation
```noir
let gamma = unsafe { __from_field(poseidon2_hash([end_block_accumulator.gamma_acc, z])) };
```

#### 19. Test in `blob_tests.nr`
- **File**: `crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr:109`
- **Preimage**: `end_blob_accumulator.y_acc.get_limbs().map(|l| l as Field)`
- **Purpose**: Hashing y_acc for test verification
```noir
poseidon2_hash(end_blob_accumulator.y_acc.get_limbs().map(|l| l as Field));
```

---

## Summary

| Category | Count |
|----------|-------|
| Hashes WITH domain separator | 17 |
| Hashes WITHOUT domain separator | 19 |
| **Total unique domain separators used** | **16** |

### Domain Separators Actually Used:

| Value | Constant | Usage Count |
|-------|----------|-------------|
| 2 | `DOM_SEP__NOTE_HASH_NONCE` | 1 |
| 3 | `DOM_SEP__UNIQUE_NOTE_HASH` | 1 |
| 4 | `DOM_SEP__SILOED_NOTE_HASH` | 1 |
| 7 | `DOM_SEP__OUTER_NULLIFIER` | 1 |
| 11 | `DOM_SEP__FUNCTION_LEAF` | 1 |
| 15 | `DOM_SEP__CONTRACT_ADDRESS_V1` | 1 |
| 16 | `DOM_SEP__CONTRACT_CLASS_ID` | 1 |
| 23 | `DOM_SEP__PUBLIC_LEAF_INDEX` | 1 |
| 27 | `DOM_SEP__PARTIAL_ADDRESS` | 2 |
| 28 | `DOM_SEP__BLOCK_HASH` | 1 |
| 33 | `DOM_SEP__TX_REQUEST` | 1 |
| 52 | `DOM_SEP__PUBLIC_KEYS_HASH` | 1 |
| 56 | `DOM_SEP__PUBLIC_TX_HASH` | 1 |
| 57 | `DOM_SEP__PRIVATE_TX_HASH` | 1 |
| 61 | `DOM_SEP__PROTOCOL_CONTRACTS` | 1 |
| (dynamic) | `app_secret_generator` | 1 |

### Unused Domain Separators (defined but not used in noir-protocol-circuits):

Values 1, 5, 6, 13, 20, 32, 34, 43, 44, 45, 46, 47, 48, 49, 50, 51, 53, 54, 55, 58, 59, 60

Note: Many previously-defined domain separators (8, 9, 10, 12, 14, 17, 18, 19, 21, 22, 24, 25, 26, 29, 30, 31, 41) were removed as unused. The remaining unused separators above are used in other parts of the Aztec codebase (e.g., `aztec-nr`, `yarn-project`).

---

## Security Considerations

### Potential Collision Risks

Hashes without domain separation could potentially collide if their preimages have the same structure. Notable cases:

1. **2-element hashes without separation:**
   - `merkle_hash([left, right])`
   - `derive_storage_slot_in_map([storage_slot, key])`
   - `compute_siloed_private_log_field([contract_address, field])`
   - `accumulate_block_headers_hash([left_hash, right_hash])`
   - Blob accumulator: `poseidon2_hash([self.z_acc, other.z_i])`
   - Blob accumulator: `poseidon2_hash([self.gamma_acc, hashed_y_i])`

2. **3-element hashes without separation:**
   - `Point::hash([x, y, is_infinite])`
   - `NullifierLeafPreimage::hash([nullifier, next_nullifier, next_index])`
   - Blob challenge: `poseidon2_hash([blob_fields_hash, commitment[0], commitment[1]])`

3. **4-element hashes without separation:**
   - `PublicDataTreeLeafPreimage::hash([slot, value, next_index, next_slot])`

4. **Variable-length hashes without separation:**
   - `FunctionSelector::from_signature` (via `poseidon2_hash_bytes`)
   - `compute_contract_class_log_hash`
   - `DelayedPublicMutableValues::hash`

### Why This May Be Acceptable

- **Different contexts**: Many of these hashes operate in isolated contexts (e.g., blob operations vs merkle trees)
- **Structural differences**: The semantic meaning of fields differs even if count matches
- **Value ranges**: Some fields have constrained value ranges that prevent overlap

### Recommendations

1. Consider adding domain separation to tree leaf hashes (`NullifierLeafPreimage`, `PublicDataTreeLeafPreimage`) if they could share preimage space with other 3-4 element hashes
2. Document why certain hashes intentionally omit domain separation
3. Ensure blob-related hashes cannot collide with protocol-level hashes
