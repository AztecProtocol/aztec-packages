use crate::{public_kernel_phase::PublicKernelPhase};
use dep::types::{
    abis::{
    accumulated_data::public_accumulated_data::{PublicAccumulatedData, PublicAccumulatedDataArrayLengths},
    kernel_circuit_public_inputs::{PublicKernelCircuitPublicInputs, VMCircuitPublicInputs},
    validation_requests::public_validation_requests::PublicValidationRequestArrayLengths
},
    traits::is_empty, transaction::RevertCode,
    utils::arrays::{array_length, assert_array_appended, assert_array_prepended}
};

pub struct PublicKernelOutputValidator {
    output: PublicKernelCircuitPublicInputs,
    previous_kernel: PublicKernelCircuitPublicInputs,
    enqueued_call: VMCircuitPublicInputs,
    phase: u8,
    revertible: bool,
    previous_validation_request_array_lengths: PublicValidationRequestArrayLengths,
    previous_non_revertible_data_array_lengths: PublicAccumulatedDataArrayLengths,
    previous_revertible_data_array_lengths: PublicAccumulatedDataArrayLengths
}

impl PublicKernelOutputValidator {
    pub fn new(
        output: PublicKernelCircuitPublicInputs,
        previous_kernel: PublicKernelCircuitPublicInputs,
        enqueued_call: VMCircuitPublicInputs,
        phase: u8
    ) -> Self {
        let revertible = phase != PublicKernelPhase.SETUP;
        let previous_validation_request_array_lengths = PublicValidationRequestArrayLengths::new(previous_kernel.validation_requests);
        let previous_non_revertible_data_array_lengths = PublicAccumulatedDataArrayLengths::new(previous_kernel.end_non_revertible);
        let previous_revertible_data_array_lengths = PublicAccumulatedDataArrayLengths::new(previous_kernel.end);
        PublicKernelOutputValidator {
            output,
            previous_kernel,
            enqueued_call,
            phase,
            revertible,
            previous_validation_request_array_lengths,
            previous_non_revertible_data_array_lengths,
            previous_revertible_data_array_lengths
        }
    }

    pub fn validate(self) {
        self.validate_constants();
        self.validate_validation_requests();
        self.validate_accumulated_data();
        self.validate_end_side_effect_counter();
        self.validate_public_teardown_call_request();
        self.validate_fee_payer();
        self.validate_revert_code();
    }

    fn validate_constants(self) {
        let prev = self.previous_kernel.constants;
        let out = self.output.constants;
        assert_eq(out.historical_header, prev.historical_header, "mismatch historical_header");
        assert_eq(out.tx_context, prev.tx_context, "mismatch tx_context");
        assert_eq(out.vk_tree_root, prev.vk_tree_root, "mismatch vk_tree_root");
        assert_eq(
            out.protocol_contract_tree_root, prev.protocol_contract_tree_root, "mismatch protocol_contract_tree_root"
        );
        assert_eq(out.global_variables, self.enqueued_call.global_variables, "mismatch global_variables");
    }

    fn validate_public_teardown_call_request(self) {
        let out = self.output.public_teardown_call_request;
        if self.phase == PublicKernelPhase.TEARDOWN {
            assert(is_empty(out), "public_teardown_call_request must be empty after teardown");
        } else {
            assert_eq(
                out, self.previous_kernel.public_teardown_call_request, "mismatch public_teardown_call_request"
            );
        }
    }

    fn validate_fee_payer(self) {
        assert_eq(self.output.fee_payer, self.previous_kernel.fee_payer, "mismatch fee payer");
    }

    fn validate_validation_requests(self) {
        self.validate_validation_requests_from_previous_kernel();
        self.validate_validation_requests_from_enqueued_call();
    }

    fn validate_validation_requests_from_previous_kernel(self) {
        let out = self.output.validation_requests;
        let prev = self.previous_kernel.validation_requests;
        let prev_lengths = self.previous_validation_request_array_lengths;

        assert_eq(out.for_rollup, prev.for_rollup);

        assert_array_prepended(
            out.note_hash_read_requests,
            prev.note_hash_read_requests,
            prev_lengths.note_hash_read_requests
        );

        assert_array_prepended(
            out.nullifier_read_requests,
            prev.nullifier_read_requests,
            prev_lengths.nullifier_read_requests
        );

        assert_array_prepended(
            out.nullifier_non_existent_read_requests,
            prev.nullifier_non_existent_read_requests,
            prev_lengths.nullifier_non_existent_read_requests
        );

        assert_array_prepended(
            out.l1_to_l2_msg_read_requests,
            prev.l1_to_l2_msg_read_requests,
            prev_lengths.l1_to_l2_msg_read_requests
        );

        assert_array_prepended(
            out.public_data_reads,
            prev.public_data_reads,
            prev_lengths.public_data_reads
        );
    }

    fn validate_validation_requests_from_enqueued_call(self) {
        let out = self.output.validation_requests;
        let curr = self.enqueued_call;
        let prev_lengths = self.previous_validation_request_array_lengths;

        assert_array_appended(
            out.note_hash_read_requests,
            curr.note_hash_read_requests,
            array_length(curr.note_hash_read_requests),
            prev_lengths.note_hash_read_requests
        );

        assert_array_appended(
            out.nullifier_read_requests,
            curr.nullifier_read_requests,
            array_length(curr.nullifier_read_requests),
            prev_lengths.nullifier_read_requests
        );

        assert_array_appended(
            out.nullifier_non_existent_read_requests,
            curr.nullifier_non_existent_read_requests,
            array_length(curr.nullifier_non_existent_read_requests),
            prev_lengths.nullifier_non_existent_read_requests
        );

        assert_array_appended(
            out.l1_to_l2_msg_read_requests,
            curr.l1_to_l2_msg_read_requests,
            array_length(curr.l1_to_l2_msg_read_requests),
            prev_lengths.l1_to_l2_msg_read_requests
        );

        assert_array_appended(
            out.public_data_reads,
            curr.public_data_reads,
            array_length(curr.public_data_reads),
            prev_lengths.public_data_reads
        );
    }

    fn validate_accumulated_data(self) {
        // TODO: Should keep the data even when reverts.
        let revert_in_phase = (self.output.revert_code != RevertCode.OK) & ((self.phase != PublicKernelPhase.TEARDOWN)
                | (self.output.revert_code != RevertCode.APP_LOGIC_REVERTED));

        self.validate_accumulated_data_from_private(revert_in_phase);
        self.validate_combined_accumulated_data(revert_in_phase);
        self.validate_gas_used();
    }

    fn validate_accumulated_data_from_private(self, revert_in_phase: bool) {
        let out = self.output.end_non_revertible;
        let prev = self.previous_kernel.end_non_revertible;
        assert_eq(
            out.note_encrypted_logs_hashes, prev.note_encrypted_logs_hashes, "mismatch non-revertible note_encrypted_logs_hashes"
        );
        assert_eq(
            out.encrypted_logs_hashes, prev.encrypted_logs_hashes, "mismatch non-revertible encrypted_logs_hashes"
        );

        let out = self.output.end;
        let prev = self.previous_kernel.end;
        if revert_in_phase {
            assert_eq(
                array_length(out.note_encrypted_logs_hashes), 0, "revertible note_encrypted_logs_hashes must be cleared after revert"
            );
            assert_eq(
                array_length(out.encrypted_logs_hashes), 0, "revertible encrypted_logs_hashes must be cleared after revert"
            );
        } else {
            assert_eq(
                out.note_encrypted_logs_hashes, prev.note_encrypted_logs_hashes, "mismatch revertible note_encrypted_logs_hashes"
            );
            assert_eq(
                out.encrypted_logs_hashes, prev.encrypted_logs_hashes, "mismatch revertible encrypted_logs_hashes"
            );
        }
    }

    fn validate_combined_accumulated_data(self, revert_in_phase: bool) {
        // Prepended from previous kernel.
        let out_non_revertible = self.output.end_non_revertible;
        let out_revertible = self.output.end;
        let prev_non_revertible = self.previous_kernel.end_non_revertible;
        let prev_revertible = self.previous_kernel.end;
        let mut prev_non_revertible_lengths = self.previous_non_revertible_data_array_lengths;
        let mut prev_revertible_lengths = self.previous_revertible_data_array_lengths;
        let empty_lengths = PublicAccumulatedDataArrayLengths::empty();

        if self.phase == PublicKernelPhase.SETUP {
            prev_non_revertible_lengths.public_call_stack -= 1;
        } else if self.phase == PublicKernelPhase.APP_LOGIC {
            prev_revertible_lengths.public_call_stack -= 1;
        }

        self.validate_prepended_accumulated_data(
            out_non_revertible,
            prev_non_revertible,
            prev_non_revertible_lengths
        );
        let prepended_revertible_lengths = if revert_in_phase {
            empty_lengths
        } else {
            prev_revertible_lengths
        };
        self.validate_prepended_accumulated_data(out_revertible, prev_revertible, prepended_revertible_lengths);

        // Appended from enqueued call.
        self.validate_appended_accumulated_data(
            out_non_revertible,
            self.enqueued_call,
            prev_non_revertible_lengths,
            !self.revertible /* should_append */
        );
        self.validate_appended_accumulated_data(
            out_revertible,
            self.enqueued_call,
            prev_revertible_lengths,
            self.revertible & !revert_in_phase /* should_append */
        );
    }

    fn validate_prepended_accumulated_data(
        _self: Self,
        out: PublicAccumulatedData,
        prev: PublicAccumulatedData,
        lengths: PublicAccumulatedDataArrayLengths
    ) {
        assert_array_prepended(out.note_hashes, prev.note_hashes, lengths.note_hashes);
        assert_array_prepended(out.nullifiers, prev.nullifiers, lengths.nullifiers);
        assert_array_prepended(out.l2_to_l1_msgs, prev.l2_to_l1_msgs, lengths.l2_to_l1_msgs);
        assert_array_prepended(
            out.unencrypted_logs_hashes,
            prev.unencrypted_logs_hashes,
            lengths.unencrypted_logs_hashes
        );
        assert_array_prepended(
            out.public_data_update_requests,
            prev.public_data_update_requests,
            lengths.public_data_update_requests
        );
        assert_array_prepended(
            out.public_call_stack,
            prev.public_call_stack,
            lengths.public_call_stack
        );
    }

    fn validate_appended_accumulated_data(
        _self: Self,
        out: PublicAccumulatedData,
        curr: VMCircuitPublicInputs,
        prev_lengths: PublicAccumulatedDataArrayLengths,
        should_append: bool
    ) {
        let num_appended = if should_append {
            array_length(curr.note_hashes)
        } else {
            0
        };
        assert_array_appended(
            out.note_hashes,
            curr.note_hashes,
            num_appended,
            prev_lengths.note_hashes
        );

        let num_appended = if should_append {
            array_length(curr.nullifiers)
        } else {
            0
        };
        assert_array_appended(
            out.nullifiers,
            curr.nullifiers,
            num_appended,
            prev_lengths.nullifiers
        );

        let num_appended = if should_append {
            array_length(curr.l2_to_l1_msgs)
        } else {
            0
        };
        assert_array_appended(
            out.l2_to_l1_msgs,
            curr.l2_to_l1_msgs,
            num_appended,
            prev_lengths.l2_to_l1_msgs
        );

        let num_appended = if should_append {
            array_length(curr.unencrypted_logs_hashes)
        } else {
            0
        };
        assert_array_appended(
            out.unencrypted_logs_hashes,
            curr.unencrypted_logs_hashes,
            num_appended,
            prev_lengths.unencrypted_logs_hashes
        );

        let num_appended = if should_append {
            array_length(curr.public_data_update_requests)
        } else {
            0
        };
        assert_array_appended(
            out.public_data_update_requests,
            curr.public_data_update_requests,
            num_appended,
            prev_lengths.public_data_update_requests
        );
    }

    fn validate_gas_used(self) {
        let out_non_revertible_gas_used = self.output.end_non_revertible.gas_used;
        let out_revertible_gas_used = self.output.end.gas_used;
        let curr_gas_used = self.enqueued_call.start_gas_left.sub(self.enqueued_call.end_gas_left);
        let mut expected_non_revertible_gas_used = self.previous_kernel.end_non_revertible.gas_used;
        let mut expected_revertible_gas_used = self.previous_kernel.end.gas_used;
        if self.phase == PublicKernelPhase.SETUP {
            expected_non_revertible_gas_used += curr_gas_used;
        } else if self.phase == PublicKernelPhase.APP_LOGIC {
            expected_revertible_gas_used += curr_gas_used;
        }
        assert_eq(
            out_non_revertible_gas_used, expected_non_revertible_gas_used, "wrong non-revertible gas used"
        );
        assert_eq(out_revertible_gas_used, expected_revertible_gas_used, "wrong revertible gas used");
    }

    fn validate_end_side_effect_counter(self) {
        assert_eq(
            self.output.end_side_effect_counter, self.enqueued_call.end_side_effect_counter, "mismatch end_side_effect_counter"
        );
    }

    fn validate_revert_code(self) {
        let prev = self.previous_kernel.revert_code;
        let out = self.output.revert_code;
        if self.phase == PublicKernelPhase.SETUP {
            // enqueued_call.reverted should be false. If not, EnqueuedCallDataValidator > validate_revert_flag will fail.
            let expected = RevertCode.OK; // Assign to a new variable because f"{RevertCode.OK}"" does not print the actual value.
            assert_eq(out, expected, f"expected revert code to be {expected}");
        }
        if !self.enqueued_call.reverted {
            assert_eq(out, prev, "mismatch revert code");
        } else {
            if self.phase == PublicKernelPhase.APP_LOGIC {
                let expected = RevertCode.APP_LOGIC_REVERTED;
                assert_eq(out, expected, f"expected revert code to be {expected}");
            }
            if self.phase == PublicKernelPhase.TEARDOWN {
                // See https://docs.aztec.network/protocol-specs/gas-and-fees/kernel-tracking#handling-reverts
                if prev == RevertCode.OK {
                    // Case where there is a new error in teardown
                    let expected = RevertCode.TEARDOWN_REVERTED;
                    assert_eq(out, expected, f"expected revert code to be {expected}");
                } else {
                    // Case where there is an error in both app logic and teardown
                    let expected = RevertCode.BOTH_REVERTED;
                    assert_eq(out, expected, f"expected revert code to be {expected}");
                };
            }
        }
    }
}
