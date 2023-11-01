use crate::address::{Address, EthAddress};
use crate::mocked::VerificationKey;
use crate::point::Point;
use crate::abis::function_selector::FunctionSelector;
use crate::abis::function_leaf_preimage::FunctionLeafPreimage;
use crate::abis::new_contract_data::NewContractData as ContractLeafPreimage;
use crate::abis::function_data::FunctionData;
use crate::utils::uint128::U128;
use crate::utils::uint256::U256;
use crate::utils::bounded_vec::BoundedVec;

use dep::aztec::{
    constants_gen,
    constants_gen::{CONTRACT_TREE_HEIGHT, FUNCTION_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT, PUBLIC_LEAF_INDEX},
    hash::sha256_to_field,
};

// Calculate the Merkle tree root from the sibling path and leaf.
//
// The leaf is hashed with its sibling, and then the result is hashed
// with the next sibling etc in the path. The last hash is the root.
//
// TODO(David/Someone): The cpp code is using a uint256, whereas its
// TODO a bit simpler in Noir to just have a bit array.
// TODO: I'd generally like to avoid u256 for algorithms like 
// this because it means we never even need to consider cases where 
// the index is greater than p.
fn root_from_sibling_path<N>(leaf : Field, leaf_index : Field, sibling_path : [Field; N]) -> Field {
    let mut node = leaf;
    let indices = leaf_index.to_le_bits(N);

    for i in 0..N {
        // indices[i]; // This line will fail.
        if indices[i] == 1 {
            node = merkle_hash(sibling_path[i], node);
        } else {
            node = merkle_hash(node, sibling_path[i]);
        }
    }
    node
}

fn merkle_hash(left : Field, right : Field) -> Field {
    dep::std::hash::pedersen_hash_with_separator([left, right], 0)
}

pub fn stdlib_recursion_verification_key_compress_native_vk(_vk : VerificationKey) -> Field {
    // Original cpp code
    // stdlib::recursion::verification_key<CT::bn254>::compress_native(private_call.vk, GeneratorIndex::VK);
    // The above cpp method is only ever called on verification key, so it has been special cased here
    let _hash_index = constants_gen::GENERATOR_INDEX__VK;
    0
}

pub fn compute_l2_to_l1_hash(contract_address : Address, rollup_version_id: Field, portal_contract_address : EthAddress, chain_id : Field, content : Field) -> Field {
    let mut bytes: BoundedVec<u8, 160> = BoundedVec::new(0);

    let inputs = [contract_address.to_field(), rollup_version_id, portal_contract_address.to_field(), chain_id, content];
    for i in 0..inputs.len() {
        // TODO are bytes be in fr.to_buffer() ?
        let item_bytes = inputs[i].to_be_bytes(32);
        for j in 0..32 {
            bytes.push(item_bytes[j]);
        }
    }

    sha256_to_field(bytes.storage)
}

// sha256 hash is stored in two fields to accommodate all 256-bits of the hash
global NUM_FIELDS_PER_SHA256 : Field = 2;

// Computes sha256 hash of 2 input hashes stored in 4 fields.
// 
// This method is bn254 specific. Two fields is needed in order to 
// encode the sha256 output. It can be abstracted away with any 4-2 hash function.
//
// TODO(Jan and David): This is used for the encrypted_log hashes.
// Can we check to see if we can just use hash_to_field or pedersen_compress here?
//
// Returning a Field would be desirable because then this can be replaced with 
// poseidon without changing the rest of the code
//
fn accumulate_sha256(input : [U128; 4]) -> [Field; NUM_FIELDS_PER_SHA256] {
    // This is a note about the cpp code, since it takes an array of Fields
    // instead of a U128.
    // 4 Field elements when converted to bytes will usually 
    // occupy 4 * 32 = 128 bytes.
    // However, this function is making the assumption that each Field 
    // only occupies 128 bits.
    //
    // TODO(David): This does not seem to be getting guaranteed anywhere in the code?
    //
    // Concatenate 4 u128 bit integers into a byte array.
    let mut hash_input_flattened = [0;64];
    for offset in 0..4 {
        let input_as_bytes = input[offset].to_be_bytes();
        for byte_index in 0..16 {
            hash_input_flattened[offset * 16 + byte_index] = input_as_bytes[byte_index];
        }
    }

    let sha_digest = dep::std::hash::sha256(hash_input_flattened);

    U256::from_bytes32(sha_digest).to_u128_limbs()
}

pub fn compute_logs_hash(previous_log_hash : [Field;2], current_log_hash : [Field;2]) -> [Field; NUM_FIELDS_PER_SHA256] {
    accumulate_sha256([
        U128::from_field(previous_log_hash[0]),
        U128::from_field(previous_log_hash[1]),
        U128::from_field(current_log_hash[0]),
        U128::from_field(current_log_hash[1])
    ])
}

pub fn compute_partial_address(contract_address_salt : Field, function_tree_root : Field, constructor_hash : Field) -> Field {
    dep::std::hash::pedersen_hash_with_separator([
        // TODO why the zeroes?
        0,
        0,
        contract_address_salt,
        function_tree_root,
        constructor_hash
    ],constants_gen::GENERATOR_INDEX__PARTIAL_ADDRESS)
}

pub fn compute_public_data_tree_index(contract_address: Address, storage_slot: Field) -> Field {
    dep::std::hash::pedersen_hash_with_separator([
        contract_address.to_field(),
        storage_slot
    ], constants_gen::GENERATOR_INDEX__PUBLIC_LEAF_INDEX)
}

pub fn compute_public_data_tree_value(value: Field) -> Field {
    // as it's a public value, it doesn't require hashing.
    // leaving this function here in case we decide to change this.
    value;
}