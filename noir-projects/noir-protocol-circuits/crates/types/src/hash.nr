use crate::{
    abis::{
        contract_class_function_leaf_preimage::ContractClassFunctionLeafPreimage,
        function_selector::FunctionSelector,
        log_hash::{LogHash, ScopedLogHash},
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_log::{PrivateLog, PrivateLogData},
        side_effect::scoped::Scoped,
    },
    address::{AztecAddress, EthAddress},
    constants::{
        FUNCTION_TREE_HEIGHT, GENERATOR_INDEX__NOTE_HASH_NONCE, GENERATOR_INDEX__OUTER_NULLIFIER,
        GENERATOR_INDEX__SILOED_NOTE_HASH, GENERATOR_INDEX__UNIQUE_NOTE_HASH,
    },
    merkle_tree::root::root_from_sibling_path,
    messaging::l2_to_l1_message::{L2ToL1Message, ScopedL2ToL1Message},
    traits::{is_empty, ToField},
    utils::field::field_from_bytes_32_trunc,
};
use super::utils::{arrays::array_concat, field::field_from_bytes};

pub fn sha256_to_field<let N: u32>(bytes_to_hash: [u8; N]) -> Field {
    let sha256_hashed = std::hash::sha256(bytes_to_hash);
    let hash_in_a_field = field_from_bytes_32_trunc(sha256_hashed);

    hash_in_a_field
}

pub fn private_functions_root_from_siblings(
    selector: FunctionSelector,
    vk_hash: Field,
    function_leaf_index: Field,
    function_leaf_sibling_path: [Field; FUNCTION_TREE_HEIGHT],
) -> Field {
    let function_leaf_preimage = ContractClassFunctionLeafPreimage { selector, vk_hash };
    let function_leaf = function_leaf_preimage.hash();
    root_from_sibling_path(
        function_leaf,
        function_leaf_index,
        function_leaf_sibling_path,
    )
}

fn compute_note_hash_nonce(tx_hash: Field, note_index_in_tx: u32) -> Field {
    // Hashing tx hash with note index in tx is guaranteed to be unique
    poseidon2_hash_with_separator(
        [tx_hash, note_index_in_tx as Field],
        GENERATOR_INDEX__NOTE_HASH_NONCE,
    )
}

pub fn compute_unique_note_hash(nonce: Field, note_hash: Field) -> Field {
    let inputs = [nonce, note_hash];
    poseidon2_hash_with_separator(inputs, GENERATOR_INDEX__UNIQUE_NOTE_HASH)
}

pub fn compute_siloed_note_hash(app: AztecAddress, unique_note_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [app.to_field(), unique_note_hash],
        GENERATOR_INDEX__SILOED_NOTE_HASH,
    )
}

/// Siloing in the context of Aztec refers to the process of hashing a note hash with a contract address (this way
/// the note hash is scoped to a specific contract). This is used to prevent intermingling of notes between contracts.
pub fn silo_note_hash(note_hash: ScopedNoteHash, tx_hash: Field, note_index_in_tx: u32) -> Field {
    if note_hash.contract_address.is_zero() {
        0
    } else {
        let nonce = compute_note_hash_nonce(tx_hash, note_index_in_tx);
        let unique_note_hash = compute_unique_note_hash(nonce, note_hash.value());
        compute_siloed_note_hash(note_hash.contract_address, unique_note_hash)
    }
}

pub fn compute_siloed_nullifier(app: AztecAddress, nullifier: Field) -> Field {
    poseidon2_hash_with_separator(
        [app.to_field(), nullifier],
        GENERATOR_INDEX__OUTER_NULLIFIER,
    )
}

pub fn silo_nullifier(nullifier: ScopedNullifier) -> Field {
    if nullifier.contract_address.is_zero() {
        nullifier.value() // Return value instead of 0 because the first nullifier's contract address is zero.
    } else {
        compute_siloed_nullifier(nullifier.contract_address, nullifier.value())
    }
}

pub fn compute_siloed_private_log_field(contract_address: AztecAddress, field: Field) -> Field {
    poseidon2_hash([contract_address.to_field(), field])
}

pub fn silo_private_log(private_log: Scoped<PrivateLogData>) -> PrivateLog {
    if private_log.contract_address.is_zero() {
        private_log.inner.log
    } else {
        let mut fields = private_log.inner.log.fields;
        fields[0] = compute_siloed_private_log_field(private_log.contract_address, fields[0]);
        PrivateLog { fields }
    }
}

fn compute_siloed_unencrypted_log_hash(address: AztecAddress, log_hash: Field) -> Field {
    accumulate_sha256([address.to_field(), log_hash])
}

pub fn silo_unencrypted_log_hash(log_hash: ScopedLogHash) -> Field {
    if log_hash.contract_address.is_zero() {
        0
    } else {
        compute_siloed_unencrypted_log_hash(log_hash.contract_address, log_hash.value())
    }
}

pub fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash([left, right])
}

pub fn compute_l2_to_l1_hash(
    contract_address: AztecAddress,
    recipient: EthAddress,
    content: Field,
    rollup_version_id: Field,
    chain_id: Field,
) -> Field {
    let mut bytes: BoundedVec<u8, 160> = BoundedVec::new();

    let inputs =
        [contract_address.to_field(), rollup_version_id, recipient.to_field(), chain_id, content];
    for i in 0..inputs.len() {
        // TODO are bytes be in fr.to_buffer() ?
        let item_bytes: [u8; 32] = inputs[i].to_be_bytes();
        for j in 0..32 {
            bytes.push(item_bytes[j]);
        }
    }

    sha256_to_field(bytes.storage())
}

pub fn silo_l2_to_l1_message(
    msg: ScopedL2ToL1Message,
    rollup_version_id: Field,
    chain_id: Field,
) -> Field {
    if msg.contract_address.is_zero() {
        0
    } else {
        compute_l2_to_l1_hash(
            msg.contract_address,
            msg.message.recipient,
            msg.message.content,
            rollup_version_id,
            chain_id,
        )
    }
}

// Computes sha256 hash of 2 input hashes.
//
// NB: This method now takes in two 31 byte fields - it assumes that any input
// is the result of a sha_to_field hash and => is truncated
//
// TODO(Jan and David): This is used for the encrypted_log hashes.
// Can we check to see if we can just use hash_to_field or pedersen_compress here?
//
pub fn accumulate_sha256(input: [Field; 2]) -> Field {
    // This is a note about the cpp code, since it takes an array of Fields
    // instead of a U128.
    // 4 Field elements when converted to bytes will usually
    // occupy 4 * 32 = 128 bytes.
    // However, this function is making the assumption that each Field
    // only occupies 128 bits.
    //
    // TODO(David): This does not seem to be getting guaranteed anywhere in the code?
    // Concatentate two fields into 32x2 = 64 bytes
    // accumulate_sha256 assumes that the inputs are pre-truncated 31 byte numbers
    let mut hash_input_flattened = [0; 64];
    for offset in 0..input.len() {
        let input_as_bytes: [u8; 32] = input[offset].to_be_bytes();
        for byte_index in 0..32 {
            hash_input_flattened[offset * 32 + byte_index] = input_as_bytes[byte_index];
        }
    }

    sha256_to_field(hash_input_flattened)
}

// Computes the final logs hash for a tx.
pub fn compute_tx_logs_hash<let N: u32>(logs: [LogHash; N]) -> Field {
    // Convert each field element into a byte array and append the bytes to `hash_input_flattened`
    let mut hash_input_flattened = [0; N * 32];
    for offset in 0..N {
        // TODO: This is not checking that the decomposition is smaller than P
        let input_as_bytes: [u8; 32] = logs[offset].value.to_be_radix(256);
        for byte_index in 0..32 {
            hash_input_flattened[offset * 32 + byte_index] = input_as_bytes[byte_index];
        }
    }
    // Ideally we would push to a slice then hash, but there is no sha_slice
    // Hardcode to 256 bytes for now
    let mut hash = sha256_to_field(hash_input_flattened);
    // Not having a 0 value hash for empty logs causes issues with empty txs
    // used for padding. Returning early is currently unsupported.
    // We always provide sorted logs here, so 0 being empty means all are empty.
    if is_empty(logs[0]) {
        hash = 0;
    }
    hash
}

pub fn verification_key_hash<let N: u32>(key: [Field; N]) -> Field {
    crate::hash::poseidon2_hash(key)
}

#[inline_always]
pub fn pedersen_hash<let N: u32>(inputs: [Field; N], hash_index: u32) -> Field {
    std::hash::pedersen_hash_with_separator(inputs, hash_index)
}

pub fn poseidon2_hash<let N: u32>(inputs: [Field; N]) -> Field {
    std::hash::poseidon2::Poseidon2::hash(inputs, N)
}

#[no_predicates]
pub fn poseidon2_hash_with_separator<let N: u32, T>(inputs: [Field; N], separator: T) -> Field
where
    T: ToField,
{
    let inputs_with_separator = array_concat([separator.to_field()], inputs);
    poseidon2_hash(inputs_with_separator)
}

pub fn poseidon2_hash_with_separator_slice<T>(inputs: [Field], separator: T) -> Field
where
    T: ToField,
{
    poseidon2_hash_with_separator(inputs.as_array(), separator)
}

#[no_predicates]
pub fn poseidon2_hash_bytes<let N: u32>(inputs: [u8; N]) -> Field {
    let mut fields = [0; (N + 30) / 31];
    let mut field_index = 0;
    let mut current_field = [0; 31];
    for i in 0..inputs.len() {
        let index = i % 31;
        current_field[index] = inputs[i];
        if index == 30 {
            fields[field_index] = field_from_bytes(current_field, false);
            current_field = [0; 31];
            field_index += 1;
        }
    }
    fields[field_index] = field_from_bytes(current_field, false);
    poseidon2_hash(fields)
}

#[test]
fn smoke_sha256_to_field() {
    let full_buffer = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
        48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
        71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93,
        94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
        113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130,
        131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148,
        149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159,
    ];
    let result = sha256_to_field(full_buffer);

    assert(result == 0x448ebbc9e1a31220a2f3830c18eef61b9bd070e5084b7fa2a359fe729184c7);

    // to show correctness of the current ver (truncate one byte) vs old ver (mod full bytes):
    let result_bytes = std::hash::sha256(full_buffer);
    let truncated_field = crate::utils::field::field_from_bytes_32_trunc(result_bytes);
    assert(truncated_field == result);
    let mod_res = result + (result_bytes[31] as Field);
    assert(mod_res == 0x448ebbc9e1a31220a2f3830c18eef61b9bd070e5084b7fa2a359fe729184e0);
}

#[test]
fn compute_l2_l1_hash() {
    // All zeroes
    let hash_result =
        compute_l2_to_l1_hash(AztecAddress::from_field(0), EthAddress::zero(), 0, 0, 0);
    assert(hash_result == 0xb393978842a0fa3d3e1470196f098f473f9678e72463cb65ec4ab5581856c2);

    // Non-zero case
    let hash_result = compute_l2_to_l1_hash(
        AztecAddress::from_field(1),
        EthAddress::from_field(3),
        5,
        2,
        4,
    );
    assert(hash_result == 0x3f88c1044a05e5340ed20466276500f6d45ca5603913b9091e957161734e16);
}

#[test]
fn silo_l2_to_l1_message_matches_typescript() {
    let version = 4;
    let chainId = 5;

    let hash = silo_l2_to_l1_message(
        ScopedL2ToL1Message {
            message: L2ToL1Message { recipient: EthAddress::from_field(1), content: 2, counter: 0 },
            contract_address: AztecAddress::from_field(3),
        },
        version,
        chainId,
    );

    // The following value was generated by `l2_to_l1_message.test.ts`
    let hash_from_typescript = 0x00c6155d69febb9d5039b374dd4f77bf57b7c881709aa524a18acaa0bd57476a;

    assert_eq(hash, hash_from_typescript);
}
