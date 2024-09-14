use crate::{
    components::{
    enqueued_call_data_validator::EnqueuedCallDataValidator,
    previous_kernel_validator::PreviousKernelValidator,
    public_kernel_output_composer::PublicKernelOutputComposer,
    public_kernel_output_validator::PublicKernelOutputValidator
},
    public_kernel_phase::PublicKernelPhase
};
use dep::types::{
    abis::{
    enqueued_call_data::EnqueuedCallData, kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
    public_kernel_data::PublicKernelData
},
    constants::{PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX, PUBLIC_KERNEL_MERGE_INDEX}
};

global ALLOWED_PREVIOUS_CIRCUITS = [
    PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
    PUBLIC_KERNEL_MERGE_INDEX,
];

struct PublicKernelMergeCircuitPrivateInputs {
    previous_kernel: PublicKernelData,
    enqueued_call: EnqueuedCallData,
}

impl PublicKernelMergeCircuitPrivateInputs {
    unconstrained fn generate_output(self, phase: u8) -> PublicKernelCircuitPublicInputs {
        // noir-fmt:ignore
        PublicKernelOutputComposer::new_from_previous_kernel(self.previous_kernel.public_inputs)
            .remove_top_call_request(phase)
            .propagate_from_enqueued_call(self.enqueued_call.data, phase)
            .finish()
    }

    fn get_phase(self) -> u8 {
        let public_inputs = self.previous_kernel.public_inputs;
        let needs_setup = !public_inputs.end_non_revertible.public_call_stack[0].contract_address.is_zero();
        let needs_app_logic = !public_inputs.end.public_call_stack[0].contract_address.is_zero();
        if needs_setup {
            PublicKernelPhase.SETUP
        } else if needs_app_logic {
            PublicKernelPhase.APP_LOGIC
        } else {
            PublicKernelPhase.TEARDOWN
        }
    }

    fn execute(self) -> PublicKernelCircuitPublicInputs {
        let phase = self.get_phase();

        let previous_kernel_validator = PreviousKernelValidator::new(self.previous_kernel);
        previous_kernel_validator.validate_proof(ALLOWED_PREVIOUS_CIRCUITS);

        let enqueued_call_data_validator = EnqueuedCallDataValidator::new(self.enqueued_call, phase);
        enqueued_call_data_validator.validate_proof();
        enqueued_call_data_validator.validate_against_previous_kernel(self.previous_kernel.public_inputs);

        let output = unsafe {
            self.generate_output(phase)
        };

        PublicKernelOutputValidator::new(
            output,
            self.previous_kernel.public_inputs,
            self.enqueued_call.data,
            phase
        ).validate();

        output
    }
}

// mod tests {
//     use crate::{public_kernel_merge::{PublicKernelMergeCircuitPrivateInputs, ALLOWED_PREVIOUS_CIRCUITS}};
//     use dep::types::{
//         abis::{
//         gas::Gas,
//         kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs, max_block_number::MaxBlockNumber,
//         public_call_stack_item_compressed::PublicCallStackItemCompressed,
//         public_data_read::PublicDataRead, public_data_update_request::PublicDataUpdateRequest,
//     },
//         address::AztecAddress, constants::PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
//         contrakt::{storage_read::StorageRead, storage_update_request::StorageUpdateRequest},
//         tests::{fixture_builder::FixtureBuilder, utils::assert_array_eq}, traits::is_empty
//     };

//     struct PublicKernelMergeCircuitPrivateInputsBuilder {
//         previous_kernel: FixtureBuilder,
//         previous_revertible: FixtureBuilder,
//         public_call: FixtureBuilder,
//     }

//     impl PublicKernelMergeCircuitPrivateInputsBuilder {
//         pub fn new() -> Self {
//             let previous_kernel = FixtureBuilder::new().as_parent_contract().in_vk_tree(PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX);
//             let previous_revertible = FixtureBuilder::new();
//             let mut public_call = FixtureBuilder::new().is_public_function();
//             public_call.value_offset = 9999; // Add an offset so that the mock data won't be the same as the values in previous_kernel.

//             PublicKernelMergeCircuitPrivateInputsBuilder { previous_kernel, previous_revertible, public_call }
//         }

//         pub fn is_delegate_call(&mut self) -> Self {
//             let _ = self.public_call.is_delegate_call();
//             *self
//         }

//         pub fn to_public_data_reads<let N: u32>(self, contract_storage_reads: [StorageRead; N]) -> [PublicDataRead; N] {
//             let storage_contract_address = self.public_call.storage_contract_address;
//             contract_storage_reads.map(|r: StorageRead| PublicDataRead::from_contract_storage_read(storage_contract_address, r))
//         }

//         pub fn to_public_data_update_requests<let N: u32>(
//             self,
//             storage_update_requests: [StorageUpdateRequest; N]
//         ) -> [PublicDataUpdateRequest; N] {
//             let storage_contract_address = self.public_call.storage_contract_address;
//             storage_update_requests.map(
//                 |r: StorageUpdateRequest|
//                 PublicDataUpdateRequest::from_contract_storage_update_request(storage_contract_address, r)
//             )
//         }

//         pub fn execute(&mut self) -> PublicKernelCircuitPublicInputs {
//             let public_call = self.public_call.to_public_call_data();

//             // In order to run the setup circuit, we must have an enqueued public call for setup.
//             let compressed_item = public_call.call_stack_item.get_compressed();
//             self.previous_kernel.push_public_call_request(compressed_item);

//             let mut previous_kernel = self.previous_kernel.to_public_kernel_data(false);

//             previous_kernel.public_inputs.end = self.previous_revertible.to_public_accumulated_data();

//             // Run the kernel on the setup call
//             let kernel = PublicKernelMergeCircuitPrivateInputs { previous_kernel, public_call };
//             kernel.execute()
//         }

//         pub fn succeeded(&mut self) {
//             let _ = self.execute();
//         }

//         pub fn failed(&mut self) {
//             let _ = self.execute();
//         }
//     }

//     #[test]
//     fn circuit_outputs_should_be_correctly_populated_with_previous_private_kernel() {
//         let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();

//         builder.previous_kernel.max_block_number = MaxBlockNumber::new(13);

//         builder.public_call.append_public_call_requests(2);
//         let curr_calls = builder.public_call.public_call_requests.storage;

//         builder.previous_kernel.append_public_call_requests(1);
//         let prev_calls = builder.previous_kernel.public_call_requests.storage;

//         builder.public_call.append_contract_storage_update_requests(2);
//         let update_requests = builder.public_call.contract_storage_update_requests.storage;

//         builder.public_call.append_contract_storage_read_requests(3);
//         let read_requests = builder.public_call.contract_storage_reads.storage;

//         let public_inputs = builder.execute();

//         assert_eq(public_inputs.validation_requests.for_rollup.max_block_number.unwrap(), 13);
//         assert_array_eq(
//             public_inputs.end_non_revertible.public_call_stack,
//             [prev_calls[0], curr_calls[0], curr_calls[1]]
//         );
//         assert_array_eq(
//             public_inputs.end_non_revertible.public_data_update_requests,
//             builder.to_public_data_update_requests([update_requests[0], update_requests[1]])
//         );
//         assert_array_eq(
//             public_inputs.validation_requests.public_data_reads,
//             builder.to_public_data_reads([read_requests[0], read_requests[1], read_requests[2]])
//         );
//     }

//     #[test]
//     fn logs_are_handled_as_expected() {
//         let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();

//         // Logs for the current call stack.
//         let unencrypted_logs_hash = 26;
//         let unencrypted_log_preimages_length = 50;
//         builder.public_call.add_unencrypted_log_hash(unencrypted_logs_hash, unencrypted_log_preimages_length);

//         // Logs for the previous call stack.
//         let prev_encrypted_logs_hash = 80;
//         let prev_encrypted_log_preimages_length = 13;
//         let prev_unencrypted_logs_hash = 956;
//         let prev_unencrypted_log_preimages_length = 24;
//         builder.previous_kernel.add_encrypted_log_hash(prev_encrypted_logs_hash, prev_encrypted_log_preimages_length);
//         builder.previous_kernel.add_unencrypted_log_hash(
//             prev_unencrypted_logs_hash,
//             prev_unencrypted_log_preimages_length
//         );
//         let prev_data = builder.previous_kernel.to_public_accumulated_data();

//         let expected_unencrypted_logs = [prev_data.unencrypted_logs_hashes[0], builder.public_call.unencrypted_logs_hashes.storage[0]];
//         // we assume the encrypted log is already siloed from private kernels
//         let expected_encrypted_logs = [prev_data.encrypted_logs_hashes[0]];

//         let public_inputs = builder.execute();

//         assert_array_eq(
//             public_inputs.end_non_revertible.encrypted_logs_hashes,
//             expected_encrypted_logs
//         );
//         assert_array_eq(
//             public_inputs.end_non_revertible.unencrypted_logs_hashes,
//             expected_unencrypted_logs
//         );
//     }

//     #[test(should_fail_with="Public call cannot be reverted")]
//     fn fails_if_public_call_reverted() {
//         let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();
//         builder.public_call.revert_code = 1;

//         builder.failed();
//     }

//     #[test]
//     fn updates_non_revertible_gas_used() {
//         let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();

//         // Transaction gas limit is 1k
//         builder.previous_kernel.tx_context.gas_settings.gas_limits = Gas::new(1000, 1000);

//         // Revertible has already used 100
//         builder.previous_revertible.gas_used = Gas::new(100, 100);

//         // And non-revertible has used another 200
//         builder.previous_kernel.gas_used = Gas::new(200, 200);

//         // So this call starts with 700 gas left
//         builder.public_call.start_gas_left = Gas::new(700, 700);

//         // And uses 300, ending with 400 left
//         builder.public_call.end_gas_left = Gas::new(400, 400);

//         // So the updated gas used by non-revertible must go up by 300, and revertible must stay the same
//         let output = builder.execute();
//         assert_eq(output.end_non_revertible.gas_used, Gas::new(500, 500));
//         assert_eq(output.end.gas_used, Gas::new(100, 100));
//     }

//     #[test]
//     unconstrained fn propagate_fee_payer() {
//         let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();
//         let fee_payer = AztecAddress::from_field(123);
//         builder.previous_kernel.set_fee_payer(fee_payer);
//         let public_inputs = builder.execute();
//         assert_eq(public_inputs.fee_payer, fee_payer);

//         // Check that the fee payer is not set if is_fee_payer is false
//         let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();
//         assert_eq(is_empty(builder.previous_kernel.fee_payer), true);
//         let public_inputs = builder.execute();
//         assert_eq(public_inputs.fee_payer, AztecAddress::empty());
//     }

//     #[test]
//     fn propagate_call_stacks_on_success() {
//         let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();

//         builder.previous_kernel.append_public_call_requests(1);
//         let prev_non_rev_calls = builder.previous_kernel.public_call_requests.storage;

//         builder.previous_revertible.append_public_call_requests(2);
//         let prev_rev_calls = builder.previous_revertible.public_call_requests.storage;

//         builder.previous_kernel.set_public_teardown_call_request();
//         let prev_teardoen_calls = builder.previous_kernel.public_teardown_call_request;

//         builder.public_call.append_public_call_requests(2);
//         let curr_calls = builder.public_call.public_call_requests.storage;

//         let public_inputs = builder.execute();

//         assert_array_eq(
//             public_inputs.end_non_revertible.public_call_stack,
//             [prev_non_rev_calls[0], curr_calls[0], curr_calls[1]]
//         );
//         assert_array_eq(
//             public_inputs.end.public_call_stack,
//             [prev_rev_calls[0], prev_rev_calls[1]]
//         );
//         assert_array_eq(
//             public_inputs.public_teardown_call_request,
//             [prev_teardoen_calls[0]]
//         );
//     }

//     #[test]
//     fn valid_previous_kernel() {
//         for i in 0..ALLOWED_PREVIOUS_CIRCUITS.len() {
//             let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();
//             builder.previous_kernel = builder.previous_kernel.in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS[i]);

//             let _res = builder.execute();
//         }
//     }
//     // TODO(#7410) we need the tube vk to reinstate this
//     // #[test(should_fail_with="Invalid vk index")]
//     // fn invalid_previous_kernel() {
//     //     let mut builder = PublicKernelSetupCircuitPrivateInputsBuilder::new();
//     //     builder.previous_kernel = builder.previous_kernel.in_vk_tree(BASE_ROLLUP_INDEX);
//     //     let _res = builder.execute();
//     // }
// }
