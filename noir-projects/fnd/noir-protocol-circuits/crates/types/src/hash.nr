mod poseidon2_chunks;

use crate::{
    abis::{
        contract_class_function_leaf_preimage::ContractClassFunctionLeafPreimage,
        function_selector::FunctionSelector, nullifier::Nullifier, private_log::PrivateLog,
        transaction::tx_request::TxRequest,
    },
    address::{AztecAddress, EthAddress},
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, DOM_SEP__NOTE_HASH_NONCE,
        DOM_SEP__PRIVATE_LOG_FIRST_FIELD, DOM_SEP__SILOED_NOTE_HASH, DOM_SEP__SILOED_NULLIFIER,
        DOM_SEP__UNIQUE_NOTE_HASH, FUNCTION_TREE_HEIGHT, NULL_MSG_SENDER_CONTRACT_ADDRESS,
        TWO_POW_64,
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

// TODO: refactor these into their own files: sha256, poseidon2, some protocol-specific hash computations, some merkle computations.

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

/// Siloing in the context of Aztec refers to the process of hashing a note hash with a contract address (this way
/// the note hash is scoped to a specific contract). This is used to prevent intermingling of notes between contracts.
pub fn compute_siloed_note_hash(contract_address: AztecAddress, note_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [contract_address.to_field(), note_hash],
        DOM_SEP__SILOED_NOTE_HASH,
    )
}

/// Computes unique, siloed note hashes from siloed note hashes.
///
/// The protocol injects uniqueness into every note_hash, so that every single note_hash in the
/// tree is unique. This prevents faerie gold attacks, where a malicious sender could create
/// two identical note_hashes for a recipient (meaning only one would be nullifiable in future).
///
/// Most privacy protocols will inject the note's leaf_index (its position in the Note Hashes Tree)
/// into the note, but this requires the creator of a note to wait until their tx is included in
/// a block to know the note's final note hash (the unique, siloed note hash), because inserting
/// leaves into trees is the job of a block producer.
///
/// We took a different approach so that the creator of a note will know each note's unique, siloed
/// note hash before broadcasting their tx to the network.
/// (There was also a historical requirement relating to "chained transactions" -- a feature that
/// Aztec Connect had to enable notes to be spent from distinct txs earlier in the same block,
/// and hence before an archive block root had been established for that block -- but that feature
/// was abandoned for the Aztec Network for having too many bad tradeoffs).
///
/// (
///   Edit: it is no longer true that all final note_hashes will be known by the creator of a tx
///   before they send it to the network. If a tx makes public function calls, then _revertible_
///   note_hashes that are created in private will not be made unique in private by the Reset circuit,
///   but will instead be made unique by the AVM, because the `note_index_in_tx` will not be known
///   until the AVM has executed the public functions of the tx. (See an explanation in
///   reset_output_composer.nr for why).
///   For some such txs, the `note_index_in_tx` might still be predictable through simulation, but
///   for txs whose public functions create a varying number of non-revertible notes (determined at
///   runtime), the `note_index_in_tx` will not be deterministically derivable before submitting the
///   tx to the network.
/// )
///
/// We use the `first_nullifier` of a tx as a seed of uniqueness. We have a guarantee that there will
/// always be at least one nullifier per tx, because the init circuit will create one if one isn't
/// created naturally by any functions of the tx. (Search "protocol_nullifier").
/// We combine the `first_nullifier` with the note's index (its position within this tx's new
/// note_hashes array) (`note_index_in_tx`) to get a truly unique value to inject into a note, which
/// we call a `note_nonce`.
pub fn compute_unique_note_hash(note_nonce: Field, siloed_note_hash: Field) -> Field {
    let inputs = [note_nonce, siloed_note_hash];
    poseidon2_hash_with_separator(inputs, DOM_SEP__UNIQUE_NOTE_HASH)
}

pub fn compute_note_hash_nonce(first_nullifier_in_tx: Field, note_index_in_tx: u32) -> Field {
    // Hashing the first nullifier with note index in tx is guaranteed to be unique (because all nullifiers are also
    // unique).
    poseidon2_hash_with_separator(
        [first_nullifier_in_tx, note_index_in_tx as Field],
        DOM_SEP__NOTE_HASH_NONCE,
    )
}

pub fn compute_note_nonce_and_unique_note_hash(
    siloed_note_hash: Field,
    first_nullifier: Field,
    note_index_in_tx: u32,
) -> Field {
    let note_nonce = compute_note_hash_nonce(first_nullifier, note_index_in_tx);
    compute_unique_note_hash(note_nonce, siloed_note_hash)
}

pub fn compute_siloed_nullifier(contract_address: AztecAddress, nullifier: Field) -> Field {
    poseidon2_hash_with_separator(
        [contract_address.to_field(), nullifier],
        DOM_SEP__SILOED_NULLIFIER,
    )
}

pub fn create_protocol_nullifier(tx_request: TxRequest) -> Scoped<Counted<Nullifier>> {
    // The protocol nullifier is ascribed a special side-effect counter of 1. No other side-effect
    // can have counter 1 (see `validate_as_first_call` for that assertion).
    Nullifier { value: tx_request.hash(), note_hash: 0 }.count(1).scope(
        NULL_MSG_SENDER_CONTRACT_ADDRESS,
    )
}

pub fn compute_log_tag(raw_tag: Field, dom_sep: u32) -> Field {
    poseidon2_hash_with_separator([raw_tag], dom_sep)
}

pub fn compute_siloed_private_log_first_field(
    contract_address: AztecAddress,
    field: Field,
) -> Field {
    poseidon2_hash_with_separator(
        [contract_address.to_field(), field],
        DOM_SEP__PRIVATE_LOG_FIRST_FIELD,
    )
}

pub fn compute_siloed_private_log(contract_address: AztecAddress, log: PrivateLog) -> PrivateLog {
    let mut fields = log.fields;
    fields[0] = compute_siloed_private_log_first_field(contract_address, fields[0]);
    PrivateLog::new(fields, log.length)
}

pub fn compute_contract_class_log_hash(log: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]) -> Field {
    poseidon2_hash(log)
}

pub fn compute_app_siloed_secret_key(
    master_secret_key: EmbeddedCurveScalar,
    app_address: AztecAddress,
    key_type_domain_separator: Field,
) -> Field {
    poseidon2_hash_with_separator(
        [master_secret_key.hi, master_secret_key.lo, app_address.to_field()],
        key_type_domain_separator,
    )
}

pub fn compute_l2_to_l1_message_hash(
    message: Scoped<L2ToL1Message>,
    rollup_version_id: Field,
    chain_id: Field,
) -> Field {
    let contract_address_bytes: [u8; 32] = message.contract_address.to_field().to_be_bytes();
    let recipient_bytes: [u8; 20] = message.inner.recipient.to_be_bytes();
    let content_bytes: [u8; 32] = message.inner.content.to_be_bytes();
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

/// Computes sha256 hash of 2 input fields, prefixed by a domain separator, so that the result cannot collide with an
/// [`accumulate_sha256`] over the same two fields.
///
/// @returns A truncated field (i.e., the first byte is always 0).
pub fn accumulate_sha256_with_separator(separator: u32, v0: Field, v1: Field) -> Field {
    // Concatenate the separator and two fields into 4 + 32 x 2 = 68 bytes
    let separator_as_bytes: [u8; 4] = (separator as Field).to_be_bytes();
    let v0_as_bytes: [u8; 32] = v0.to_be_bytes();
    let v1_as_bytes: [u8; 32] = v1.to_be_bytes();
    let hash_input_flattened = separator_as_bytes.concat(v0_as_bytes).concat(v1_as_bytes);

    sha256_to_field(hash_input_flattened)
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

/// Computes a Poseidon2 hash over a dynamic-length subarray of the given input.
/// Only the first `in_len` fields of `input` are absorbed; any remaining fields are ignored.
/// The caller is responsible for ensuring that the input is padded with zeros if required.
#[no_predicates]
pub fn poseidon2_hash_subarray<let N: u32>(input: [Field; N], in_len: u32) -> Field {
    let mut sponge = poseidon2_absorb_in_chunks(input, in_len);
    sponge.squeeze()
}

/// Computes a Poseidon2 hash with a domain separator over a dynamic-length subarray of the given input.
/// Only the first `in_len` fields of `input` are absorbed; any remaining fields are ignored.
/// For `in_len == N` this is equivalent to [`poseidon2_hash_with_separator`].
#[no_predicates]
pub fn poseidon2_hash_subarray_with_separator<let N: u32, T>(
    input: [Field; N],
    in_len: u32,
    separator: T,
) -> Field
where
    T: ToField,
{
    let inputs_with_separator = [separator.to_field()].concat(input);
    poseidon::poseidon2::Poseidon2::hash(inputs_with_separator, in_len + 1)
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
fn subarray_hash_matches_fixed() {
    let values_to_hash = [3; 17];
    let padded = values_to_hash.concat([0; 11]);
    let subarray_hash = poseidon2_hash_subarray(padded, values_to_hash.len());

    // Hash the entire values_to_hash.
    let fixed_len_hash = poseidon::poseidon2::Poseidon2::hash(values_to_hash, values_to_hash.len());

    assert_eq(subarray_hash, fixed_len_hash);
}

#[test]
fn subarray_hash_matches_variable() {
    let values_to_hash = [3; 17];
    let padded = values_to_hash.concat([0; 11]);
    let subarray_hash = poseidon2_hash_subarray(padded, values_to_hash.len());

    // Hash up to values_to_hash.len() fields of the padded array.
    let variable_len_hash = poseidon::poseidon2::Poseidon2::hash(padded, values_to_hash.len());

    assert_eq(subarray_hash, variable_len_hash);
}

#[test]
fn subarray_hash_with_separator_matches_fixed_len_with_separator() {
    let values_to_hash = [3; 17];
    let padded = values_to_hash.concat([0; 11]);
    let separator = 42;

    assert_eq(
        poseidon2_hash_subarray_with_separator(padded, values_to_hash.len(), separator),
        poseidon2_hash_with_separator(values_to_hash, separator),
    );
    // Hashing the whole array must differ from hashing a prefix of it, even though the padding is zero.
    assert(
        poseidon2_hash_subarray_with_separator(padded, padded.len(), separator)
            != poseidon2_hash_subarray_with_separator(padded, values_to_hash.len(), separator),
    );
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
fn unique_siloed_note_hash_matches_typescript() {
    let inner_note_hash = 1;
    let contract_address = AztecAddress::from_field(2);
    let first_nullifier = 3;
    let note_index_in_tx = 4;

    let siloed_note_hash = compute_siloed_note_hash(contract_address, inner_note_hash);
    let siloed_note_hash_from_ts =
        0x1986a4bea3eddb1fff917d629a13e10f63f514f401bdd61838c6b475db949169;
    assert_eq(siloed_note_hash, siloed_note_hash_from_ts);

    let nonce: Field = compute_note_hash_nonce(first_nullifier, note_index_in_tx);
    let note_hash_nonce_from_ts =
        0x28e7799791bf066a57bb51fdd0fbcaf3f0926414314c7db515ea343f44f5d58b;
    assert_eq(nonce, note_hash_nonce_from_ts);

    let unique_siloed_note_hash_from_nonce = compute_unique_note_hash(nonce, siloed_note_hash);
    let unique_siloed_note_hash = compute_note_nonce_and_unique_note_hash(
        siloed_note_hash,
        first_nullifier,
        note_index_in_tx,
    );
    assert_eq(unique_siloed_note_hash_from_nonce, unique_siloed_note_hash);

    let unique_siloed_note_hash_from_ts =
        0x29949aef207b715303b24639737c17fbfeb375c1d965ecfa85c7e4f0febb7d16;
    assert_eq(unique_siloed_note_hash, unique_siloed_note_hash_from_ts);
}

#[test]
fn siloed_nullifier_matches_typescript() {
    let contract_address = AztecAddress::from_field(123);
    let nullifier = 456;

    let res = compute_siloed_nullifier(contract_address, nullifier);

    let siloed_nullifier_from_ts =
        0x169b50336c1f29afdb8a03d955a81e485f5ac7d5f0b8065673d1e407e5877813;

    assert_eq(res, siloed_nullifier_from_ts);
}

#[test]
fn siloed_private_log_first_field_matches_typescript() {
    let contract_address = AztecAddress::from_field(123);
    let field = 456;
    let res = compute_siloed_private_log_first_field(contract_address, field);

    let siloed_private_log_first_field_from_ts =
        0x29480984f7b9257fded523d50addbcfc8d1d33adcf2db73ef3390a8fd5cdffaa;

    assert_eq(res, siloed_private_log_first_field_from_ts);
}

#[test]
fn empty_l2_to_l1_message_hash_matches_typescript() {
    // All zeroes
    let res = compute_l2_to_l1_message_hash(
        L2ToL1Message { recipient: EthAddress::zero(), content: 0 }.scope(AztecAddress::from_field(
            0,
        )),
        0,
        0,
    );

    let empty_l2_to_l1_msg_hash_from_ts =
        0x003b18c58c739716e76429634a61375c45b3b5cd470c22ab6d3e14cee23dd992;

    assert_eq(res, empty_l2_to_l1_msg_hash_from_ts);
}

#[test]
fn l2_to_l1_message_hash_matches_typescript() {
    let message = L2ToL1Message { recipient: EthAddress::from_field(1), content: 2 }.scope(
        AztecAddress::from_field(3),
    );
    let version = 4;
    let chainId = 5;

    let hash = compute_l2_to_l1_message_hash(message, version, chainId);

    // The following value was generated by `yarn-project/stdlib/src/hash/hash.test.ts`
    let l2_to_l1_message_hash_from_ts =
        0x0081edf209e087ad31b3fd24263698723d57190bd1d6e9fe056fc0c0a68ee661;

    assert_eq(hash, l2_to_l1_message_hash_from_ts);
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
