use crate::{
    abis::{private_call_stack_item::PrivateCallStackItem},
    address::{SaltedInitializationHash, PublicKeysHash},
    constants::{FUNCTION_TREE_HEIGHT, PROTOCOL_CONTRACT_TREE_HEIGHT},
    merkle_tree::membership::MembershipWitness, recursion::{verification_key::VerificationKey}
};

pub struct PrivateCallData {
    call_stack_item: PrivateCallStackItem,

    vk: VerificationKey,

    salted_initialization_hash: SaltedInitializationHash,
    public_keys_hash: PublicKeysHash,
    contract_class_artifact_hash: Field,
    contract_class_public_bytecode_commitment: Field,
    function_leaf_membership_witness: MembershipWitness<FUNCTION_TREE_HEIGHT>,

    protocol_contract_sibling_path: [Field; PROTOCOL_CONTRACT_TREE_HEIGHT],

    acir_hash: Field,
}
