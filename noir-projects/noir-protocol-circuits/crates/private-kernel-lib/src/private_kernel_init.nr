use crate::{
    components::private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
    private_call_data_validator::PrivateCallDataValidator,
    private_kernel_circuit_public_inputs_composer::PrivateKernelCircuitPublicInputsComposer
};
use dep::types::{
    abis::{
    private_kernel::private_call_data::PrivateCallData,
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs
},
    constants::MAX_NEW_NOTE_HASHES_PER_CALL, transaction::tx_request::TxRequest
};

struct PrivateKernelInitHints {
    note_hash_nullifier_counters: [u32; MAX_NEW_NOTE_HASHES_PER_CALL],
    first_revertible_private_call_request_index: u64,
}

// Initialization struct for private inputs to the private kernel
struct PrivateKernelInitCircuitPrivateInputs {
    tx_request: TxRequest,
    private_call: PrivateCallData,
    hints: PrivateKernelInitHints,
}

impl PrivateKernelInitCircuitPrivateInputs {
    unconstrained fn prepare_output(
        self,
        private_call_data_validator: PrivateCallDataValidator
    ) -> PrivateKernelCircuitPublicInputs {
        let private_call_public_inputs = self.private_call.call_stack_item.public_inputs;
        PrivateKernelCircuitPublicInputsComposer::new_from_tx_request(self.tx_request, private_call_public_inputs).compose(
            private_call_public_inputs,
            private_call_data_validator.array_lengths,
            self.private_call.call_stack_item.contract_address,
            self.hints.note_hash_nullifier_counters,
            self.private_call.public_call_stack,
            self.private_call.public_teardown_call_request
        ).finish()
    }

    fn validate_inputs(self) -> PrivateCallDataValidator {
        let private_call_data_validator = PrivateCallDataValidator::new(self.private_call);
        private_call_data_validator.validate();
        private_call_data_validator.validate_as_first_call(self.hints.first_revertible_private_call_request_index);
        private_call_data_validator.validate_against_tx_request(self.tx_request);
        private_call_data_validator
    }

    pub fn simulate(self) -> PrivateKernelCircuitPublicInputs {
        let private_call_data_validator = self.validate_inputs();
        self.prepare_output(private_call_data_validator)
    }

    pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
        // verify/aggregate the private call proof
        self.private_call.verify();
        let private_call_data_validator = self.validate_inputs();

        let output = self.prepare_output(private_call_data_validator);
        let output_validator = PrivateKernelCircuitOutputValidator::new(output);
        output_validator.validate_as_first_call(
            self.tx_request,
            self.private_call.call_stack_item.public_inputs,
            private_call_data_validator.array_lengths,
            self.private_call.call_stack_item.contract_address,
            self.hints.note_hash_nullifier_counters,
            self.private_call.public_call_stack,
            self.private_call.public_teardown_call_request
        );
        output
    }
}

mod tests {
    use crate::private_kernel_init::{PrivateKernelInitHints, PrivateKernelInitCircuitPrivateInputs};
    use dep::types::{
        abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        log_hash::{NoteLogHash, ScopedEncryptedLogHash, ScopedLogHash}
    },
        constants::MAX_NEW_NOTE_HASHES_PER_CALL,
        tests::private_call_data_builder::PrivateCallDataBuilder, transaction::tx_request::TxRequest,
        utils::arrays::array_eq
    };

    struct PrivateKernelInitInputsBuilder {
        tx_request: TxRequest,
        private_call: PrivateCallDataBuilder,
        hints: PrivateKernelInitHints,
    }

    impl PrivateKernelInitInputsBuilder {
        pub fn new() -> Self {
            let private_call = PrivateCallDataBuilder::new();
            let tx_request = private_call.build_tx_request();
            let hints = PrivateKernelInitHints {
                note_hash_nullifier_counters: [0; MAX_NEW_NOTE_HASHES_PER_CALL],
                first_revertible_private_call_request_index: 0
            };

            PrivateKernelInitInputsBuilder { tx_request, private_call, hints }
        }

        pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
            let kernel = PrivateKernelInitCircuitPrivateInputs { tx_request: self.tx_request, private_call: self.private_call.finish(), hints: self.hints };

            kernel.execute()
        }

        pub fn failed(self) {
            let _ = self.execute();
        }
    }

    #[test]
    fn deposit() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        // Logs for the private call.
        let encrypted_logs_hashes = [16, 36];
        let encrypted_log_preimages_length = [100, 75];
        let unencrypted_logs_hashes = [26, 46];
        let unencrypted_log_preimages_length = [50, 25];
        builder.private_call.public_inputs.add_encrypted_log(encrypted_logs_hashes[0], encrypted_log_preimages_length[0]);
        builder.private_call.public_inputs.add_unencrypted_log(
            unencrypted_logs_hashes[0],
            unencrypted_log_preimages_length[0]
        );
        builder.private_call.public_inputs.add_encrypted_log(encrypted_logs_hashes[1], encrypted_log_preimages_length[1]);
        builder.private_call.public_inputs.add_unencrypted_log(
            unencrypted_logs_hashes[1],
            unencrypted_log_preimages_length[1]
        );

        let expected_unencrypted_logs = [
            builder.private_call.public_inputs.unencrypted_logs_hashes.storage[0], builder.private_call.public_inputs.unencrypted_logs_hashes.storage[1]
        ];
        let expected_encrypted_logs = [
            builder.private_call.public_inputs.encrypted_logs_hashes.storage[0], builder.private_call.public_inputs.encrypted_logs_hashes.storage[1]
        ];

        let public_inputs = builder.execute();

        // Check the first nullifier is hash of the signed tx request
        let tx_hash = builder.tx_request.hash();
        assert_eq(public_inputs.end.new_nullifiers[0].value(), tx_hash);
        assert(
            array_eq(
                public_inputs.end.encrypted_logs_hashes.map(|l: ScopedEncryptedLogHash| l.log_hash),
                expected_encrypted_logs
            )
        );
        assert(
            array_eq(
                public_inputs.end.unencrypted_logs_hashes.map(|l: ScopedLogHash| l.log_hash),
                expected_unencrypted_logs
            )
        );
    }

    #[test(should_fail_with = "Could not find note hash linked to note log.")]
    fn input_validation_note_log_not_linked() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        builder.private_call.public_inputs.note_encrypted_logs_hashes.extend_from_array([NoteLogHash { value: 9123, counter: 2, length: 2, note_hash_counter: 1 }]);

        builder.failed();
    }
}
