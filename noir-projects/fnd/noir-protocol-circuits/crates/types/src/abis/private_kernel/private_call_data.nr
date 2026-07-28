use crate::{
    abis::private_circuit_public_inputs::PrivateCircuitPublicInputs,
    address::SaltedInitializationHash,
    constants::{FUNCTION_TREE_HEIGHT, PROOF_TYPE_HN, PROOF_TYPE_OINK, PUBLIC_DATA_TREE_HEIGHT},
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    merkle_tree::MembershipWitness,
    proof::verification_key::MegaAppVerificationKey,
    public_keys::PublicKeys,
};

pub struct PrivateCallData {
    pub public_inputs: PrivateCircuitPublicInputs,
    pub vk: MegaAppVerificationKey,
    pub verification_key_hints: PrivateVerificationKeyHints,
}

impl PrivateCallData {
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
    pub fn verify(self, is_first_function_call: bool) {
        let proof_type = if is_first_function_call {
            PROOF_TYPE_OINK
        } else {
            PROOF_TYPE_HN
        };

        // verify_proof_with_type sends the verification data to barretenberg, which adds to the circuit the required
        // constraints to recursively verify the proof. For recursive verification happening inside the kernels, barretenberg
        // only needs the vk, the proof type, and the purported vk hash. Then, barretenberg adds to the circuit:
        // 1. Witnesses for the proofs. These are added based on the proofs generated during the accumulation steps.
        //    The function in barretenberg that generates these proofs is `accumulate`.
        // 2. Constraints that enforce self.vk.hash = Hash(self.vk.key)
        // 3. Constraints that recursively verify the proofs.
        //
        // Note: We talk about proofs because if proof_type = PROOF_TYPE_OINK, then there is only one proof (the accumulation of the first app)
        //       If proof_type = PROOF_TYPE_HN, then there are two proofs (the accumulation of the previous kernel and that of the new app).
        // Note 2: There are no public inputs because CHONK uses that databus to propagate public inputs. This means that the public inputs of the kernel
        //         are not represented as single field elements, but rather as commitments (points on BN254). Barretenberg handles these public inputs internally
        //         and requires no input from Noir.
        std::verify_proof_with_type(self.vk.key, [], [], self.vk.hash, proof_type);
    }
}

pub struct PrivateVerificationKeyHints {
    pub salted_initialization_hash: SaltedInitializationHash,
    pub public_keys: PublicKeys,
    pub contract_class_artifact_hash: Field,
    pub contract_class_public_bytecode_commitment: Field,
    pub function_leaf_membership_witness: MembershipWitness<FUNCTION_TREE_HEIGHT>,
    pub updated_class_id_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    pub updated_class_id_leaf: PublicDataTreeLeafPreimage,
    pub updated_class_id_delayed_public_mutable_values: [Field; 3],
}

pub struct PrivateCallDataWithoutPublicInputs {
    pub vk: MegaAppVerificationKey,
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
