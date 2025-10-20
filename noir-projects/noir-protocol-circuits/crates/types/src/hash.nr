mod poseidon2_chunks;

use crate::{
    abis::{
        contract_class_function_leaf_preimage::ContractClassFunctionLeafPreimage,
        function_selector::FunctionSelector,
        note_hash::NoteHash,
        nullifier::Nullifier,
        private_log::{PrivateLog, PrivateLogData},
    },
    address::{AztecAddress, EthAddress},
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, FUNCTION_TREE_HEIGHT, GENERATOR_INDEX__NOTE_HASH_NONCE,
        GENERATOR_INDEX__OUTER_NULLIFIER, GENERATOR_INDEX__SILOED_NOTE_HASH,
        GENERATOR_INDEX__UNIQUE_NOTE_HASH, TWO_POW_64,
    },
    merkle_tree::root_from_sibling_path,
    messaging::l2_to_l1_message::L2ToL1Message,
    poseidon2::Poseidon2Sponge,
    side_effect::{Counted, Scoped},
    traits::{FromField, Hash, ToField},
    utils::field::{field_from_bytes, field_from_bytes_32_trunc},
};

pub use poseidon2_chunks::poseidon2_absorb_in_chunks_existing_sponge;
use poseidon2_chunks::poseidon2_absorb_in_chunks;
use std::embedded_curve_ops::EmbeddedCurveScalar;

pub fn sha256_to_field<let N: u32>(bytes_to_hash: [u8; N]) -> Field {
    let sha256_hashed = sha256::digest(bytes_to_hash);
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

pub fn compute_note_hash_nonce(first_nullifier_in_tx: Field, note_index_in_tx: u32) -> Field {
    // Hashing the first nullifier with note index in tx is guaranteed to be unique (because all nullifiers are also
    // unique).
    poseidon2_hash_with_separator(
        [first_nullifier_in_tx, note_index_in_tx as Field],
        GENERATOR_INDEX__NOTE_HASH_NONCE,
    )
}

pub fn compute_unique_note_hash(note_nonce: Field, siloed_note_hash: Field) -> Field {
    let inputs = [note_nonce, siloed_note_hash];
    poseidon2_hash_with_separator(inputs, GENERATOR_INDEX__UNIQUE_NOTE_HASH)
}

pub fn compute_nonce_and_unique_note_hash(
    siloed_note_hash: Field,
    first_nullifier: Field,
    note_index_in_tx: u32,
) -> Field {
    let note_nonce = compute_note_hash_nonce(first_nullifier, note_index_in_tx);
    compute_unique_note_hash(note_nonce, siloed_note_hash)
}

pub fn compute_siloed_note_hash(app: AztecAddress, note_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [app.to_field(), note_hash],
        GENERATOR_INDEX__SILOED_NOTE_HASH,
    )
}

/// Computes unique note hashes from siloed note hashes
pub fn compute_unique_siloed_note_hash(
    siloed_note_hash: Field,
    first_nullifier: Field,
    note_index_in_tx: u32,
) -> Field {
    if siloed_note_hash == 0 {
        0
    } else {
        compute_nonce_and_unique_note_hash(siloed_note_hash, first_nullifier, note_index_in_tx)
    }
}

/// Siloing in the context of Aztec refers to the process of hashing a note hash with a contract address (this way
/// the note hash is scoped to a specific contract). This is used to prevent intermingling of notes between contracts.
pub fn silo_note_hash(note_hash: Scoped<Counted<NoteHash>>) -> Field {
    if note_hash.contract_address.is_zero() {
        0
    } else {
        compute_siloed_note_hash(note_hash.contract_address, note_hash.innermost())
    }
}

pub fn compute_siloed_nullifier(app: AztecAddress, nullifier: Field) -> Field {
    poseidon2_hash_with_separator(
        [app.to_field(), nullifier],
        GENERATOR_INDEX__OUTER_NULLIFIER,
    )
}

pub fn silo_nullifier(nullifier: Scoped<Counted<Nullifier>>) -> Field {
    let value = nullifier.innermost().value;
    // Q: shouldn't we be checking whether the _whole_ nullifier is empty?
    // A: We don't have to. The init and inner circuits add contract address to non-empty nullifiers.
    // So we know we should silo it if the contract address is not empty.
    if nullifier.contract_address.is_zero() {
        value // Return `value` instead of 0 because an already-siloed nullifier's contract address is zero.
    } else {
        compute_siloed_nullifier(nullifier.contract_address, value)
    }
}

pub fn compute_siloed_private_log_field(contract_address: AztecAddress, field: Field) -> Field {
    poseidon2_hash([contract_address.to_field(), field])
}

pub fn silo_private_log(private_log: Scoped<Counted<PrivateLogData>>) -> PrivateLog {
    let log = private_log.innermost().log;
    if private_log.contract_address.is_zero() {
        log
    } else {
        let mut fields = log.fields;
        fields[0] = compute_siloed_private_log_field(private_log.contract_address, fields[0]);
        PrivateLog::new(fields, log.length)
    }
}

pub fn compute_contract_class_log_hash(log: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]) -> Field {
    poseidon2_hash(log)
}

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
    let contract_address_bytes: [u8; 32] = contract_address.to_field().to_be_bytes();
    let recipient_bytes: [u8; 20] = recipient.to_be_bytes();
    let content_bytes: [u8; 32] = content.to_be_bytes();
    let rollup_version_id_bytes: [u8; 32] = rollup_version_id.to_be_bytes();
    let chain_id_bytes: [u8; 32] = chain_id.to_be_bytes();

    let mut bytes: [u8; 148] = std::mem::zeroed();
    for i in 0..32 {
        bytes[i] = contract_address_bytes[i];
        bytes[i + 32] = rollup_version_id_bytes[i];
        // 64 - 84 are for recipient.
        bytes[i + 84] = chain_id_bytes[i];
        bytes[i + 116] = content_bytes[i];
    }

    for i in 0..20 {
        bytes[64 + i] = recipient_bytes[i];
    }

    sha256_to_field(bytes)
}

pub fn silo_l2_to_l1_message(
    msg: Scoped<L2ToL1Message>,
    rollup_version_id: Field,
    chain_id: Field,
) -> Field {
    if msg.contract_address.is_zero() {
        0
    } else {
        compute_l2_to_l1_hash(
            msg.contract_address,
            msg.inner.recipient,
            msg.inner.content,
            rollup_version_id,
            chain_id,
        )
    }
}

/// Computes sha256 hash of 2 input fields.
///
/// @returns A truncated field (i.e., the first byte is always 0).
pub fn accumulate_sha256(v0: Field, v1: Field) -> Field {
    // Concatenate two fields into 32 x 2 = 64 bytes
    let v0_as_bytes: [u8; 32] = v0.to_be_bytes();
    let v1_as_bytes: [u8; 32] = v1.to_be_bytes();
    let hash_input_flattened = v0_as_bytes.concat(v1_as_bytes);

    sha256_to_field(hash_input_flattened)
}

#[inline_always]
pub fn pedersen_hash<let N: u32>(inputs: [Field; N], hash_index: u32) -> Field {
    std::hash::pedersen_hash_with_separator(inputs, hash_index)
}

pub fn poseidon2_hash<let N: u32>(inputs: [Field; N]) -> Field {
    poseidon::poseidon2::Poseidon2::hash(inputs, N)
}

#[no_predicates]
pub fn poseidon2_hash_with_separator<let N: u32, T>(inputs: [Field; N], separator: T) -> Field
where
    T: ToField,
{
    let inputs_with_separator = [separator.to_field()].concat(inputs);
    poseidon2_hash(inputs_with_separator)
}

// Performs a fixed length hash with a subarray of the given input.
// Useful for SpongeBlob in which we absorb M things and want to check it vs a hash of M elts of an N-len array.
// Using stdlib poseidon, this will always absorb an extra 1 as a 'variable' hash, and not match spongeblob.squeeze()
// or any ts implementation. Also checks that any remaining elts not hashed are empty.
#[no_predicates]
pub fn poseidon2_hash_subarray<let N: u32>(input: [Field; N], in_len: u32) -> Field {
    let mut sponge = poseidon2_absorb_in_chunks(input, in_len, false);
    sponge.squeeze()
}

// NB the below is the same as poseidon::poseidon2::Poseidon2::hash(), but replacing a range check with a bit check,
// and absorbing in chunks of 3 below.
#[no_predicates]
pub fn poseidon2_cheaper_variable_hash<let N: u32>(input: [Field; N], in_len: u32) -> Field {
    let mut sponge = poseidon2_absorb_in_chunks(input, in_len, true);
    // In the case where the hash preimage is variable-length, we append `1` to the end of the input, to distinguish
    // from fixed-length hashes. (the combination of this additional field element + the hash IV ensures
    // fixed-length and variable-length hashes do not collide)
    if in_len != N {
        sponge.absorb(1);
    }
    sponge.squeeze()
}

pub fn poseidon2_hash_with_separator_slice<T>(inputs: [Field], separator: T) -> Field
where
    T: ToField,
{
    let in_len = inputs.len() + 1;
    let iv: Field = (in_len as Field) * TWO_POW_64;
    let mut sponge = Poseidon2Sponge::new(iv);
    sponge.absorb(separator.to_field());

    for i in 0..inputs.len() {
        sponge.absorb(inputs[i]);
    }

    sponge.squeeze()
}

// This function is  unconstrained because it is intended to be used in unconstrained context only as
// in constrained contexts it would be too inefficient.
pub unconstrained fn poseidon2_hash_with_separator_bounded_vec<let N: u32, T>(
    inputs: BoundedVec<Field, N>,
    separator: T,
) -> Field
where
    T: ToField,
{
    let in_len = inputs.len() + 1;
    let iv: Field = (in_len as Field) * TWO_POW_64;
    let mut sponge = Poseidon2Sponge::new(iv);
    sponge.absorb(separator.to_field());

    for i in 0..inputs.len() {
        sponge.absorb(inputs.get(i));
    }

    sponge.squeeze()
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
    if field_index != fields.len() {
        fields[field_index] = field_from_bytes(current_field, false);
    }
    poseidon2_hash(fields)
}

#[test]
fn poseidon_chunks_matches_fixed() {
    let in_len = 501;
    let mut input: [Field; 4096] = [0; 4096];
    let mut fixed_input = [3; 501];
    assert(in_len == fixed_input.len()); // sanity check
    for i in 0..in_len {
        input[i] = 3;
    }
    let sub_chunk_hash = poseidon2_hash_subarray(input, in_len);
    let fixed_len_hash = poseidon::poseidon2::Poseidon2::hash(fixed_input, fixed_input.len());
    assert(sub_chunk_hash == fixed_len_hash);
}

#[test]
fn poseidon_chunks_matches_variable() {
    let in_len = 501;
    let mut input: [Field; 4096] = [0; 4096];
    for i in 0..in_len {
        input[i] = 3;
    }
    let variable_chunk_hash = poseidon2_cheaper_variable_hash(input, in_len);
    let variable_len_hash = poseidon::poseidon2::Poseidon2::hash(input, in_len);
    assert(variable_chunk_hash == variable_len_hash);
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
    let result_bytes = sha256::digest(full_buffer);
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
    assert(hash_result == 0x3b18c58c739716e76429634a61375c45b3b5cd470c22ab6d3e14cee23dd992);

    // Non-zero case
    let hash_result = compute_l2_to_l1_hash(
        AztecAddress::from_field(1),
        EthAddress::from_field(3),
        5,
        2,
        4,
    );
    assert(hash_result == 0xaab2a5828156782b12a1dc6f336e2bc627eb1b9514b02d511f66296990c050);
}

#[test]
fn silo_l2_to_l1_message_matches_typescript() {
    let version = 4;
    let chainId = 5;

    let hash = silo_l2_to_l1_message(
        L2ToL1Message { recipient: EthAddress::from_field(1), content: 2 }.scope(
            AztecAddress::from_field(3),
        ),
        version,
        chainId,
    );

    // The following value was generated by `yarn-project/stdlib/src/hash/hash.test.ts`
    let hash_from_typescript = 0x0081edf209e087ad31b3fd24263698723d57190bd1d6e9fe056fc0c0a68ee661;

    assert_eq(hash, hash_from_typescript);
}

#[test]
unconstrained fn poseidon2_hash_with_separator_bounded_vec_matches_non_bounded_vec_version() {
    let inputs = BoundedVec::<Field, 4>::from_array([1, 2, 3]);
    let separator = 42;

    // Hash using bounded vec version
    let bounded_result = poseidon2_hash_with_separator_bounded_vec(inputs, separator);

    // Hash using regular version
    let regular_result = poseidon2_hash_with_separator([1, 2, 3], separator);

    // Results should match
    assert_eq(bounded_result, regular_result);
}
