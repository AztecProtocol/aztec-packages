use crate::{
    abis::private_circuit_public_inputs::PrivateCircuitPublicInputs,
    address::SaltedInitializationHash,
    constants::{FUNCTION_TREE_HEIGHT, PROTOCOL_CONTRACT_TREE_HEIGHT},
    merkle_tree::membership::MembershipWitness,
    proof::verification_key::ClientIVCVerificationKey,
    public_keys::PublicKeys,
};

pub struct PrivateCallData {
    pub public_inputs: PrivateCircuitPublicInputs,

    pub vk: ClientIVCVerificationKey,

    pub salted_initialization_hash: SaltedInitializationHash,
    pub public_keys: PublicKeys,
    pub contract_class_artifact_hash: Field,
    pub contract_class_public_bytecode_commitment: Field,
    pub function_leaf_membership_witness: MembershipWitness<FUNCTION_TREE_HEIGHT>,
    pub protocol_contract_sibling_path: [Field; PROTOCOL_CONTRACT_TREE_HEIGHT],

    pub acir_hash: Field,
}

pub struct PrivateCallDataWithoutPublicInputs {
    pub vk: ClientIVCVerificationKey,

    pub salted_initialization_hash: SaltedInitializationHash,
    pub public_keys: PublicKeys,
    pub contract_class_artifact_hash: Field,
    pub contract_class_public_bytecode_commitment: Field,
    pub function_leaf_membership_witness: MembershipWitness<FUNCTION_TREE_HEIGHT>,
    pub protocol_contract_sibling_path: [Field; PROTOCOL_CONTRACT_TREE_HEIGHT],

    pub acir_hash: Field,
}

impl PrivateCallDataWithoutPublicInputs {
    pub fn to_private_call_data(
        self,
        public_inputs: PrivateCircuitPublicInputs,
    ) -> PrivateCallData {
        PrivateCallData {
            public_inputs,
            vk: self.vk,
            salted_initialization_hash: self.salted_initialization_hash,
            public_keys: self.public_keys,
            contract_class_artifact_hash: self.contract_class_artifact_hash,
            contract_class_public_bytecode_commitment: self
                .contract_class_public_bytecode_commitment,
            function_leaf_membership_witness: self.function_leaf_membership_witness,
            protocol_contract_sibling_path: self.protocol_contract_sibling_path,
            acir_hash: self.acir_hash,
        }
    }
}
