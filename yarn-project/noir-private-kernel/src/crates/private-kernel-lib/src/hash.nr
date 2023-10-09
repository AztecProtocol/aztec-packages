use crate::address::{Address, EthAddress};
use crate::mocked::VerificationKey;
use crate::point::Point;
use crate::abis::function_selector::FunctionSelector;
use crate::abis::function_leaf_preimage::FunctionLeafPreimage;
use crate::abis::new_contract_data::NewContractData as ContractLeafPreimage;
use crate::abis::function_data::FunctionData;
use crate::utils::uint128::U128;
use crate::utils::uint256::U256;

use dep::aztec::{
    constants_gen,
    constants_gen::{CONTRACT_TREE_HEIGHT, FUNCTION_TREE_HEIGHT},
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
fn root_from_sibling_path<N>(leaf : Field, leaf_index : Field,sibling_path : [Field; N]) -> Field {
    let mut node = leaf;
    let indices = leaf_index.to_le_bits(N as u32);
    for i in 0..N {
        if indices[i] == 1 {
            node = merkle_hash(sibling_path[i], node);
        } else {
            node = merkle_hash(node, sibling_path[i]);
        }
    }
    node
}
// Calculate the function tree root from the sibling path and leaf preimage.
//
// TODO: The cpp code passes in components of the FunctionLeafPreimage and then 
// builds it up. We should build it up and then pass the leaf preimage as a parameter.
// We can then choose to have a general method that takes in anything hashable
// and deduplicate the logic in `contract_tree_root_from_siblings`
fn function_tree_root_from_siblings(selector : FunctionSelector, is_internal : bool, is_private : bool, vk_hash : Field, acir_hash : Field, function_leaf_index : Field, function_leaf_sibling_path : [Field; FUNCTION_TREE_HEIGHT]) -> Field {
    let function_leaf_preimage = FunctionLeafPreimage{
        selector: selector,
        is_internal : is_internal,
        is_private : is_private,
        vk_hash : vk_hash,
        acir_hash : acir_hash,
    };

    let function_leaf = function_leaf_preimage.hash();

    let function_tree_root =
        root_from_sibling_path(function_leaf, function_leaf_index, function_leaf_sibling_path);

    function_tree_root
}

// Calculate the contract tree root from the sibling path and leaf preimage.
fn contract_tree_root_from_siblings(function_tree_root : Field, storage_contract_address : Address, portal_contract_address : EthAddress, contract_leaf_index : Field,contract_leaf_sibling_path : [Field; CONTRACT_TREE_HEIGHT]) -> Field {
    //TODO(Kev): if we use shorthand syntax here, we get an error as expected,
    // since variable name is `storage_contract_address` but the span is incorrect.
    let contract_leaf_preimage = ContractLeafPreimage { contract_address: storage_contract_address,
                                    portal_contract_address,
                                    function_tree_root };
        
    let contract_leaf = contract_leaf_preimage.hash();

    let computed_contract_tree_root =
        root_from_sibling_path(contract_leaf, contract_leaf_index, contract_leaf_sibling_path);
    
    computed_contract_tree_root
}

// TODO(hash)
fn silo_commitment(address : Address, read_request : Field) -> Field {
    let _hash_index = constants_gen::GENERATOR_INDEX__SILOED_COMMITMENT;
    0
}

// TODO(hash)
fn silo_nullifier(address : Address, read_request : Field) -> Field {
    let _hash_index = constants_gen::GENERATOR_INDEX__OUTER_NULLIFIER;
    0
}

// TODO: add merkle hash implementation
fn merkle_hash(left : Field, right : Field) -> Field {
    0
}

fn stdlib_recursion_verification_key_compress_native_vk(vk : VerificationKey) -> Field {
    // Original cpp code
    // stdlib::recursion::verification_key<CT::bn254>::compress_native(private_call.vk, GeneratorIndex::VK);
    // The above cpp method is only ever called on verification key, so it has been special cased here
    let _hash_index = constants_gen::GENERATOR_INDEX__VK;
    0
}

// TODO(David): In most* places where I use this, it was previously convert a field to
// bytes and then taking a blake3s hash and then converting the 32 byte hash output to a 
// Field. 
//
// *See `compute_l2_to_l1_hash`
//
// For now, I have replaced this with `hash_to_field` for two reasons:
// - Hash to field takes as input Field, so we can avoid the to_bytes conversion
//   on the Noir layer.
// - Hash_to_field abstracts away the fact that we need blake3s 
fn hash_to_field<N>(_input : [Field; N]) -> Field {
   // TODO: call the stdlib hash_to_field method
   // This method is not being called directly because I want to have the comments
   // above while we are refactoring.
   
   0
}
fn compute_new_contract_address_hash(new_contract_address : Address) -> Field {
    hash_to_field([new_contract_address.to_field()])
}

// TODO(Lasse and David)
// This diverges from the cpp code for simplicity.
// The cpp code was converting all of the inputs into a bytes vector and then 
// doing a sha256_to_field.
// In other parts of the code, we do a "blake3s_to_field". (See hash_to_field) in this file.
// Its not clear if sha256 is being used for a particular reason. I propose 
// we use one out of the two and just call hash_to_field everywhere.
fn compute_l2_to_l1_hash(contract_address : Address, rollup_version_id: Field, portal_contract_address : EthAddress, chain_id : Field, content : Field) -> Field {
    let inputs = [contract_address.to_field(), rollup_version_id, portal_contract_address.to_field(), chain_id, content];
    hash_to_field(inputs)
}

fn compute_constructor_hash(function_data : FunctionData, args_hash : Field, constructor_vk_hash : Field) -> Field {
    let function_data_hash = function_data.hash();

    let inputs = [function_data_hash,args_hash,constructor_vk_hash];

    let _hash_index = constants_gen::GENERATOR_INDEX__CONSTRUCTOR;

    0
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

fn compute_logs_hash(previous_log_hash : [Field;2], current_log_hash : [Field;2]) -> [Field; NUM_FIELDS_PER_SHA256] {
    accumulate_sha256([
        U128::from_field(previous_log_hash[0]),
        U128::from_field(previous_log_hash[1]),
        U128::from_field(current_log_hash[0]),
        U128::from_field(current_log_hash[1])
    ])
}

fn compute_partial_address(contract_address_salt : Field, function_tree_root : Field, constructor_hash : Field) -> Field {
    let _hash_index = constants_gen::GENERATOR_INDEX__PARTIAL_ADDRESS;
    0
}

fn compute_contract_address_from_partial(point : Point, partial_address : Field) -> Address {
    let _hash_index = constants_gen::GENERATOR_INDEX__CONTRACT_ADDRESS;
    Address::default()
}

fn compute_unique_commitment(nonce : Field, siloed_commitment : Field) -> Field {
    let _hash_index = constants_gen::GENERATOR_INDEX__UNIQUE_COMMITMENT;
    0
}

fn compute_commitment_nonce(first_nullifier : Field, commitment_index : Field) -> Field {
    let _hash_index = constants_gen::GENERATOR_INDEX__COMMITMENT_NONCE;
    0
}