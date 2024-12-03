use dep::types::{
    block_header::BlockHeader,
    KernelCircuitPublicInputs,
    proof::{
        recursive_proof::RecursiveProof,
        traits::Verifiable,
        verification_key::{HonkVerificationKey, VerificationKey},
    },
    traits::Empty,
};

pub struct EmptyNestedCircuitPublicInputs {
    proof: RecursiveProof,
    vk: HonkVerificationKey,
}

impl Verifiable for EmptyNestedCircuitPublicInputs {
    fn verify(self) {
        std::verify_proof(self.vk.key, self.proof.fields, [], self.vk.hash);
    }
}

impl Empty for EmptyNestedCircuitPublicInputs {
    fn empty() -> Self {
        Self { proof: RecursiveProof::empty(), vk: VerificationKey::empty() }
    }
}

pub struct PrivateKernelEmptyPrivateInputs {
    empty_nested: EmptyNestedCircuitPublicInputs,
    historical_header: BlockHeader,
    chain_id: Field,
    version: Field,
    vk_tree_root: Field,
    protocol_contract_tree_root: Field,
}

impl PrivateKernelEmptyPrivateInputs {
    pub fn execute(self) -> KernelCircuitPublicInputs {
        self.empty_nested.verify();

        let mut public_inputs = KernelCircuitPublicInputs::empty();
        public_inputs.constants.historical_header = self.historical_header;
        public_inputs.constants.tx_context.chain_id = self.chain_id;
        public_inputs.constants.tx_context.version = self.version;
        public_inputs.constants.vk_tree_root = self.vk_tree_root;
        public_inputs.constants.protocol_contract_tree_root = self.protocol_contract_tree_root;

        public_inputs
    }
}

impl Empty for PrivateKernelEmptyPrivateInputs {
    fn empty() -> Self {
        PrivateKernelEmptyPrivateInputs {
            empty_nested: EmptyNestedCircuitPublicInputs::empty(),
            historical_header: BlockHeader::empty(),
            chain_id: 0,
            version: 0,
            vk_tree_root: 0,
            protocol_contract_tree_root: 0,
        }
    }
}

mod tests {
    use crate::private_kernel_empty::{
        EmptyNestedCircuitPublicInputs, PrivateKernelEmptyPrivateInputs,
    };
    use dep::types::block_header::BlockHeader;

    #[test]
    unconstrained fn works() {
        let private_inputs = PrivateKernelEmptyPrivateInputs {
            empty_nested: EmptyNestedCircuitPublicInputs::empty(),
            historical_header: BlockHeader::empty(),
            chain_id: 1,
            version: 2,
            vk_tree_root: 3,
            protocol_contract_tree_root: 4,
        };
        let public_inputs = private_inputs.execute();
        assert_eq(public_inputs.constants.tx_context.chain_id, 1);
        assert_eq(public_inputs.constants.tx_context.version, 2);
        assert_eq(public_inputs.constants.vk_tree_root, 3);
        assert_eq(public_inputs.constants.protocol_contract_tree_root, 4);
    }
}
