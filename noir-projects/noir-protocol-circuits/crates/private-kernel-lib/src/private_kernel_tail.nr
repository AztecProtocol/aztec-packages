use crate::components::{
    previous_kernel_validator::PreviousKernelValidator, tail_output_composer::TailOutputComposer,
    tail_output_validator::TailOutputValidator,
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        private_kernel_data::{PrivateKernelData, PrivateKernelDataWithoutPublicInputs},
    },
    constants::{PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX},
    PrivateKernelCircuitPublicInputs,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX];

pub struct PrivateKernelTailCircuitPrivateInputs {
    previous_kernel: PrivateKernelData,
    // The `include_by_timestamp` set by the wallet. The wallet should take the value aggregated during the transaction
    // and decide whether to keep it or lower it.
    // For example, it may round the value down to the nearest hour to improve privacy.
    // If this value is higher than the `include_by_timestamp` requested during tx execution, it will be ignored.
    include_by_timestamp_upper_bound: u64,
}

impl PrivateKernelTailCircuitPrivateInputs {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        include_by_timestamp_upper_bound: u64,
    ) -> Self {
        Self {
            previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
            include_by_timestamp_upper_bound,
        }
    }

    unconstrained fn generate_output(self) -> PrivateToRollupKernelCircuitPublicInputs {
        TailOutputComposer::new(
            self.previous_kernel.public_inputs,
            self.include_by_timestamp_upper_bound,
        )
            .finish()
    }

    pub fn execute(self) -> PrivateToRollupKernelCircuitPublicInputs {
        // Validate inputs.
        let mut previous_kernel_validator = PreviousKernelValidator::new(self.previous_kernel);

        previous_kernel_validator.verify_proof(ALLOWED_PREVIOUS_CIRCUITS);

        previous_kernel_validator.validate_for_private_tail();

        // Generate output.
        // Safety: The output is validated below by TailOutputValidator.
        let output = unsafe { self.generate_output() };

        // Validate output.
        if dep::types::validate::should_validate_output() {
            TailOutputValidator::new(
                output,
                self.previous_kernel.public_inputs,
                self.include_by_timestamp_upper_bound,
            )
                .validate();
        }

        output
    }
}

mod tests {
    use crate::private_kernel_tail::{
        ALLOWED_PREVIOUS_CIRCUITS, PrivateKernelTailCircuitPrivateInputs,
    };
    use dep::types::{
        abis::{gas::Gas, kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs},
        address::{AztecAddress, EthAddress},
        point::Point,
        tests::{fixture_builder::FixtureBuilder, utils::{assert_array_eq, swap_items}},
        traits::FromField,
    };
    use dep::types::constants::{
        AVM_L2_GAS_PER_NOTE_HASH_WRITE, AVM_L2_GAS_PER_NULLIFIER_WRITE, DA_BYTES_PER_FIELD,
        DA_GAS_PER_BYTE, GENERATOR_INDEX__IVSK_M, L2_GAS_PER_CONTRACT_CLASS_LOG,
        L2_GAS_PER_L2_TO_L1_MSG, L2_GAS_PER_PRIVATE_LOG, PRIVATE_KERNEL_INNER_INDEX,
        PRIVATE_KERNEL_TAIL_INDEX, PRIVATE_LOG_SIZE_IN_FIELDS,
    };

    // TODO: Reduce the duplicated code/tests for PrivateKernelTailInputs and PrivateKernelTailToPublicInputs.
    struct PrivateKernelTailInputsBuilder {
        previous_kernel: FixtureBuilder,
        include_by_timestamp_upper_bound: u64,
    }

    impl PrivateKernelTailInputsBuilder {
        pub fn new() -> Self {
            let mut previous_kernel = FixtureBuilder::new().in_vk_tree(PRIVATE_KERNEL_INNER_INDEX);
            previous_kernel.tx_context.gas_settings.gas_limits = Gas::new(1_000_000, 1_000_000);
            previous_kernel.set_protocol_nullifier();
            previous_kernel.set_fee_payer(AztecAddress::from_field(234234));
            previous_kernel.is_private_only = true;

            PrivateKernelTailInputsBuilder {
                previous_kernel,
                include_by_timestamp_upper_bound: previous_kernel.include_by_timestamp,
            }
        }

        pub fn execute(self) -> PrivateToRollupKernelCircuitPublicInputs {
            let kernel = PrivateKernelTailCircuitPrivateInputs {
                previous_kernel: self.previous_kernel.to_private_kernel_data(),
                include_by_timestamp_upper_bound: self.include_by_timestamp_upper_bound,
            };
            kernel.execute()
        }

        pub fn failed(self) {
            let _ = self.execute();
        }

        pub fn succeeded(self) {
            let _ = self.execute();
        }
    }

    #[test]
    fn correct_private_kernel_tail_output_propagated_values() {
        let mut builder = PrivateKernelTailInputsBuilder::new();

        let constants = builder.previous_kernel.to_tx_constant_data();
        builder.previous_kernel.fee_payer = AztecAddress::from_field(90);
        builder.include_by_timestamp_upper_bound = 999;
        builder.previous_kernel.include_by_timestamp = 13;

        let public_inputs = builder.execute();

        assert_eq(public_inputs.constants, constants);
        assert_eq(public_inputs.fee_payer, AztecAddress::from_field(90));
        assert_eq(public_inputs.include_by_timestamp, 13);
    }

    #[test]
    fn ordering_of_msgs() {
        let mut builder = PrivateKernelTailInputsBuilder::new();

        let num_msg = 4;
        builder.previous_kernel.append_l2_to_l1_msgs(num_msg);

        // Reorder the msgs
        let original_msgs = builder.previous_kernel.l2_to_l1_msgs.storage();
        for i in 0..num_msg / 2 {
            swap_items(
                &mut builder.previous_kernel.l2_to_l1_msgs,
                i,
                num_msg - 1 - i,
            );
        }

        let public_inputs = builder.execute();

        let resulting_msgs = public_inputs.end.l2_to_l1_msgs;

        assert_eq(resulting_msgs, original_msgs.map(|msg| msg.expose_to_public()));
    }

    #[test(should_fail_with = "Private call stack must be empty when executing the tail circuit")]
    fn non_empty_private_call_stack_should_fail() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.append_private_call_requests(1);
        builder.failed();
    }

    #[test(should_fail_with = "Public call stack must be empty when executing the tail circuit")]
    fn non_empty_public_call_stack_should_fail() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.append_public_call_requests(1);
        builder.failed();
    }

    #[test(should_fail_with = "Public teardown call request must be empty when executing the tail circuit")]
    fn non_empty_public_teardown_call_request_should_fail() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.set_public_teardown_call_request();
        builder.failed();
    }

    #[test(should_fail_with = "split_counter must be 0 for pure private tx")]
    fn non_zero_validation_requests_split_counter_fail() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.validation_requests_split_counter = Option::some(123);
        builder.failed();
    }

    #[test(should_fail_with = "Non empty note hash read requests")]
    fn non_empty_note_hash_read_requests() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.append_note_hashes(3);
        let _void = builder.previous_kernel.add_read_request_for_pending_note_hash(1);
        builder.failed();
    }

    #[test(should_fail_with = "Non empty nullifier read requests")]
    fn non_empty_nullifier_read_requests() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.append_nullifiers(3);
        let _void = builder.previous_kernel.add_read_request_for_pending_nullifier(1);
        builder.failed();
    }

    #[test(should_fail_with = "Non empty key validation requests")]
    fn non_empty_key_validations() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.add_request_for_key_validation(
            Point { x: 1, y: 2, is_infinite: false },
            27,
            GENERATOR_INDEX__IVSK_M as Field,
        );
        builder.failed();
    }

    #[test(should_fail_with = "First nullifier claim was not satisfied")]
    fn first_nullifier_validation() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        let mut first_nullifier = builder.previous_kernel.nullifiers.get(0);
        first_nullifier.nullifier.value += 1;
        builder.previous_kernel.nullifiers.set(0, first_nullifier);
        builder.failed();
    }

    #[test]
    fn empty_tx_consumes_fixed_gas() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.tx_context.gas_settings.teardown_gas_limits = Gas::new(300, 300);
        let public_inputs = builder.execute();

        // addition follows the form:
        // tx overhead
        // tx nullifier (which has DA and L2 gas)
        let expected_gas_consumed = Gas::tx_overhead()
            + Gas::new(
                DA_GAS_PER_BYTE * DA_BYTES_PER_FIELD * 1,
                AVM_L2_GAS_PER_NULLIFIER_WRITE * 1,
            );
        assert_eq(public_inputs.gas_used, expected_gas_consumed);
    }

    #[test]
    unconstrained fn tx_consumes_gas_from_l2_l1_msgs() {
        let mut builder = PrivateKernelTailInputsBuilder::new();

        builder.previous_kernel.add_l2_to_l1_message(42, EthAddress::zero());
        builder.previous_kernel.add_l2_to_l1_message(42, EthAddress::zero());
        builder.previous_kernel.end_setup();
        builder.previous_kernel.add_l2_to_l1_message(42, EthAddress::zero());

        let public_inputs = builder.execute();

        assert_eq(
            Gas::tx_overhead()
                + Gas::new(
                    4 * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE,
                    1 * AVM_L2_GAS_PER_NULLIFIER_WRITE + 3 * L2_GAS_PER_L2_TO_L1_MSG,
                ),
            public_inputs.gas_used,
        );
    }

    #[test]
    unconstrained fn tx_consumed_gas_from_logs() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.append_siloed_private_logs_for_note_with_lengths([7], 33);
        builder.previous_kernel.add_contract_class_log_hash(999, 12);
        builder.previous_kernel.end_setup();
        builder.previous_kernel.append_siloed_private_logs_for_note_with_lengths([8, 5], 44);

        let public_inputs = builder.execute();

        let num_nullifiers = 1; // A nullifier is added by default.
        let num_private_logs = 1 + 2;
        let num_private_log_fields = 7 + 8 + 5;
        let num_cc_logs = 1;
        let num_contract_class_log_fields = 12;

        let num_da_fields = num_nullifiers
            + num_private_log_fields
            + num_private_logs // One extra field per private log for its length.
            + num_contract_class_log_fields
            + num_cc_logs * 2; // Two extra fields per contract class log: length and contract address.
        let num_da_bytes = (num_da_fields * DA_BYTES_PER_FIELD);
        let da_gas = num_da_bytes * DA_GAS_PER_BYTE;

        let l2_gas = num_nullifiers * AVM_L2_GAS_PER_NULLIFIER_WRITE
            + num_private_logs * L2_GAS_PER_PRIVATE_LOG
            + num_cc_logs * L2_GAS_PER_CONTRACT_CLASS_LOG;

        assert_eq(Gas::tx_overhead() + Gas::new(da_gas, l2_gas), public_inputs.gas_used);
    }

    #[test(should_fail_with = "The gas used exceeds the gas limits")]
    fn gas_limits_are_enforced() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel.tx_context.gas_settings.teardown_gas_limits = Gas::new(300, 300);
        builder.previous_kernel.tx_context.gas_settings.gas_limits = Gas::new(1, 1);
        builder.failed();
    }

    #[test]
    fn private_kernel_tail__side_effects_with_padded_items() {
        let mut builder = PrivateKernelTailInputsBuilder::new();

        builder.previous_kernel.append_siloed_note_hashes(2);
        builder.previous_kernel.append_siloed_nullifiers(2); // First nullifier is added by default.
        builder.previous_kernel.append_siloed_private_logs(1);

        // Padded.
        builder.previous_kernel.append_padded_note_hashes(2);
        builder.previous_kernel.append_padded_nullifiers(1);
        builder.previous_kernel.append_padded_private_logs(3);

        let public_inputs = builder.execute();

        // Note hashes.
        let note_hashes = builder.previous_kernel.note_hashes.storage().map(|n| n.note_hash.value);
        assert_array_eq(
            public_inputs.end.note_hashes,
            [note_hashes[0], note_hashes[1], note_hashes[2], note_hashes[3]],
        );

        // Nullifiers.
        let nullifiers = builder.previous_kernel.nullifiers.storage().map(|n| n.nullifier.value);
        assert_array_eq(
            public_inputs.end.nullifiers,
            [nullifiers[0], nullifiers[1], nullifiers[2], nullifiers[3]],
        );

        // Private logs.
        let private_logs = builder.previous_kernel.private_logs.storage().map(|l| l.inner.log);
        assert_array_eq(
            public_inputs.end.private_logs,
            [private_logs[0], private_logs[1], private_logs[2], private_logs[3]],
        );

        // Gas.
        let num_note_hashes = 4;
        let num_nullifiers = 4;
        let num_private_logs = 4;
        let num_private_log_fields = num_private_logs * (PRIVATE_LOG_SIZE_IN_FIELDS + 1); // +1 for the length field
        let num_da_fields = num_note_hashes + num_nullifiers + num_private_log_fields;
        let da_gas = num_da_fields * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
        let l2_gas = num_note_hashes * AVM_L2_GAS_PER_NOTE_HASH_WRITE
            + num_nullifiers * AVM_L2_GAS_PER_NULLIFIER_WRITE
            + num_private_logs * L2_GAS_PER_PRIVATE_LOG;
        assert_eq(public_inputs.gas_used, Gas::tx_overhead() + Gas::new(da_gas, l2_gas));
    }

    #[test]
    fn valid_previous_kernel() {
        for i in 0..ALLOWED_PREVIOUS_CIRCUITS.len() {
            let mut builder = PrivateKernelTailInputsBuilder::new();
            builder.previous_kernel =
                builder.previous_kernel.in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS[i]);

            let _res = builder.execute();
        }
    }

    #[test(should_fail_with = "Invalid vk index")]
    fn invalid_previous_kernel() {
        let mut builder = PrivateKernelTailInputsBuilder::new();
        builder.previous_kernel = builder.previous_kernel.in_vk_tree(PRIVATE_KERNEL_TAIL_INDEX);
        let _res = builder.execute();
    }
}
