use crate::components::{
    private_call_data_validator::PrivateCallDataValidator,
    private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
    private_kernel_circuit_public_inputs_composer::PrivateKernelCircuitPublicInputsComposer,
};
use dep::types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_circuit_public_inputs::PrivateCircuitPublicInputs,
    private_kernel::private_call_data::{PrivateCallData, PrivateCallDataWithoutPublicInputs},
    transaction::tx_request::TxRequest,
};

// Initialization struct for private inputs to the private kernel
pub struct PrivateKernelInitCircuitPrivateInputs {
    tx_request: TxRequest,
    vk_tree_root: Field,
    protocol_contract_tree_root: Field,
    private_call: PrivateCallData,
    is_private_only: bool,
    first_nullifier_hint: Field,
}

impl PrivateKernelInitCircuitPrivateInputs {
    pub fn new(
        tx_request: TxRequest,
        vk_tree_root: Field,
        protocol_contract_tree_root: Field,
        private_call: PrivateCallDataWithoutPublicInputs,
        app_public_inputs: PrivateCircuitPublicInputs,
        is_private_only: bool,
        first_nullifier_hint: Field,
    ) -> Self {
        Self {
            tx_request,
            vk_tree_root,
            protocol_contract_tree_root,
            private_call: private_call.to_private_call_data(app_public_inputs),
            is_private_only,
            first_nullifier_hint,
        }
    }

    unconstrained fn generate_output(self) -> PrivateKernelCircuitPublicInputs {
        PrivateKernelCircuitPublicInputsComposer::new_from_tx_request(
            self.tx_request,
            self.private_call.public_inputs,
            self.vk_tree_root,
            self.protocol_contract_tree_root,
            self.is_private_only,
            self.first_nullifier_hint,
        )
            .with_private_call(
                // TODO: consider moving this call into `new_from_tx_request`?
                self.private_call,
            )
            .finish()
    }

    pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
        // Validate inputs.

        let private_call_data_validator = PrivateCallDataValidator::new(self.private_call);

        private_call_data_validator.verify_proof(true /* is_first_app */);

        private_call_data_validator.validate_common(self.protocol_contract_tree_root);

        private_call_data_validator.validate_as_first_call();

        private_call_data_validator.validate_against_tx_request(self.tx_request);
        // Q: missing some checks that are included in `validate_against_call_request`?

        // Generate output.
        // Note: the 0th nullifier is computed within here from the txRequest.
        // Safety: The output is validated below by PrivateKernelCircuitOutputValidator.
        let output = unsafe { self.generate_output() };

        // Validate output.
        if dep::types::validate::should_validate_output() {
            PrivateKernelCircuitOutputValidator::new(output).validate_as_first_call(
                self.tx_request,
                self.private_call,
                self.vk_tree_root,
                self.protocol_contract_tree_root,
                self.is_private_only,
                self.first_nullifier_hint,
            );
        }
        output
    }
}

mod tests {
    use crate::private_kernel_init::PrivateKernelInitCircuitPrivateInputs;
    use dep::types::{
        abis::{
            kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
            transaction::tx_request::TxRequest,
        },
        tests::{
            fixture_builder::{claimed_length_array_from_bounded_vec, FixtureBuilder},
            utils::assert_array_eq,
        },
    };

    struct PrivateKernelInitInputsBuilder {
        tx_request: TxRequest,
        private_call: FixtureBuilder,
    }

    impl PrivateKernelInitInputsBuilder {
        pub fn new() -> Self {
            let private_call = FixtureBuilder::new().is_first_call();
            let tx_request = private_call.build_tx_request();

            PrivateKernelInitInputsBuilder { tx_request, private_call }
        }

        pub fn execute(mut self) -> PrivateKernelCircuitPublicInputs {
            self.private_call.compute_update_tree_and_hints();
            let private_call = self.private_call.to_private_call_data();

            PrivateKernelInitCircuitPrivateInputs {
                tx_request: self.tx_request,
                private_call,
                vk_tree_root: FixtureBuilder::vk_tree_root(),
                protocol_contract_tree_root: self.private_call.protocol_contract_tree_root,
                is_private_only: false,
                first_nullifier_hint: 0,
            }
                .execute()
        }
    }

    #[test]
    fn private_kernel_init_output_as_expected() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        // note_hash_read_requests
        builder.private_call.append_note_hash_read_requests(2);
        let note_hash_read_requests =
            claimed_length_array_from_bounded_vec(builder.private_call.note_hash_read_requests);

        // private_logs
        builder.private_call.append_private_logs(2);
        let private_logs = claimed_length_array_from_bounded_vec(builder.private_call.private_logs);

        let public_inputs = builder.execute();
        assert_array_eq(
            public_inputs.validation_requests.note_hash_read_requests.array,
            [note_hash_read_requests.array[0], note_hash_read_requests.array[1]],
        );
        assert_array_eq(
            public_inputs.end.private_logs.array,
            [private_logs.array[0], private_logs.array[1]],
        );
    }
}
