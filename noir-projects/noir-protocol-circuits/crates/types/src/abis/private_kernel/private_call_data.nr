use crate::{
    abis::{
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        protocol_contract_leaf_preimage::ProtocolContractLeafPreimage,
    },
    address::SaltedInitializationHash,
    constants::{
        FUNCTION_TREE_HEIGHT, PROOF_TYPE_OINK, PROOF_TYPE_PG, PROTOCOL_CONTRACT_TREE_HEIGHT,
        PUBLIC_DATA_TREE_HEIGHT,
    },
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    merkle_tree::membership::MembershipWitness,
    proof::verification_key::ClientIVCVerificationKey,
    public_keys::PublicKeys,
};

pub struct PrivateCallData {
    pub public_inputs: PrivateCircuitPublicInputs,
    pub vk: ClientIVCVerificationKey,
    pub verification_key_hints: PrivateVerificationKeyHints,
}

impl PrivateCallData {
    /**
     * Verifies the proof, public inputs, vk.
     */
    pub fn verify(self, is_first_app: bool) {
        self.vk.check_hash();

        let proof_type = if is_first_app {
            PROOF_TYPE_OINK
        } else {
            PROOF_TYPE_PG
        };

        // Client IVC public inputs are linked in the backend via the databus.
        //
        // Seeing empty args being passed to verify_proof is quite jarring, so I think it could do with more explanation about exactly what's happening behind the scenes, so that a reader can gain confidence in what's being done "magically" by bberg.
        // How does bb know the locations of the proof and public inputs in the databus?
        // How does bb know how many public inputs to extract from the databus?
        // What if we change the public inputs; how does bb adjust to that?
        // There's a comment in the bberg acir code that the recursive verifier expects a single public input. Are the public inputs being hashed behind the scenes? Where?
        // How does bb hash the vk?
        // Where does `get_public_inputs_witness_indices_from_proof` (in acir_format.cpp) get the size of the public inputs from?
        //
        // Does bberg compute a key_hash (aka vk_hash)? If so, we'd have duplicate vk_hash constraints, because it also gets computed within this Noir code. That would be a waste. BB appears to say "not used" next to `key_hash` values, but I just want to make sure I'm not misreading their code.
        std::verify_proof_with_type(self.vk.key, [], [], self.vk.hash, proof_type);
    }
}

pub struct PrivateVerificationKeyHints {
    pub salted_initialization_hash: SaltedInitializationHash,
    pub public_keys: PublicKeys,
    pub contract_class_artifact_hash: Field,
    pub contract_class_public_bytecode_commitment: Field,
    pub function_leaf_membership_witness: MembershipWitness<FUNCTION_TREE_HEIGHT>,
    pub protocol_contract_membership_witness: MembershipWitness<PROTOCOL_CONTRACT_TREE_HEIGHT>,
    pub protocol_contract_leaf: ProtocolContractLeafPreimage,
    pub updated_class_id_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    pub updated_class_id_leaf: PublicDataTreeLeafPreimage,
    pub updated_class_id_shared_mutable_values: [Field; 3],
}

pub struct PrivateCallDataWithoutPublicInputs {
    pub vk: ClientIVCVerificationKey,
    pub verification_key_hints: PrivateVerificationKeyHints,
}

impl PrivateCallDataWithoutPublicInputs {
    pub fn to_private_call_data(
        self,
        public_inputs: PrivateCircuitPublicInputs,
    ) -> PrivateCallData {
        PrivateCallData {
            public_inputs,
            vk: self.vk,
            verification_key_hints: self.verification_key_hints,
        }
    }
}
