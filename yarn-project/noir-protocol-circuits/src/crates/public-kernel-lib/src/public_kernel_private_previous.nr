use crate::common;
use dep::types::abis::{
    kernel_circuit_public_inputs::{KernelCircuitPublicInputs, KernelCircuitPublicInputsBuilder},
    previous_kernel_data::PreviousKernelData,
    public_call_data::PublicCallData,
};
use dep::std::unsafe;
// translated from cpp impl in 
// aztec-packages/circuits/cpp/src/aztec3/circuits/kernel/public/native_public_kernel_circuit_private_previous_kernel.cpp

struct PublicKernelPrivatePreviousInputs {
    previous_kernel: PreviousKernelData,
    public_call: PublicCallData,
}

impl PublicKernelPrivatePreviousInputs {
    fn validate_inputs(self) {
        let private_call_stack = self.previous_kernel.public_inputs.end.private_call_stack;
        for i in 0..private_call_stack.len() {
            let private_call = private_call_stack[i];
            assert(private_call == 0,
                "Private call stack must be empty when executing in the public kernel (i.e. all private calls must have been completed)");
        }

        let previous_call_is_private = self.previous_kernel.public_inputs.is_private;
        assert(previous_call_is_private == true,
            "Previous kernel must be private when in this public kernel version");
    }

    fn public_kernel_private_previous(self) -> KernelCircuitPublicInputs {
        // construct the circuit outputs
        let mut public_inputs: KernelCircuitPublicInputsBuilder = unsafe::zeroed();

        // initialise the end state with our provided previous kernel state
        common::initialize_end_values(self.previous_kernel, &mut public_inputs);

        // validate the inputs common to all invocation circumstances
        common::validate_inputs(self.public_call);

        // validate the inputs unique to having a previous private kernel
        self.validate_inputs();

        // validate the kernel execution common to all invocation circumstances
        common::validate_kernel_execution(self.public_call);

        // validate our public call hash
        common::validate_this_public_call_hash(self.public_call,&mut public_inputs);

        common::update_public_end_values(self.public_call,&mut public_inputs);

        common::accumulate_unencrypted_logs(self.public_call, self.previous_kernel,&mut public_inputs);

        public_inputs.finish()
    }
}

mod tests {
    use crate::{
        public_kernel_private_previous::PublicKernelPrivatePreviousInputs,
        utils::{
            compute_public_data_reads,
            compute_public_data_update_requests,
        },
    };
    use dep::types::{
        abis::{
            function_selector::FunctionSelector,
            kernel_circuit_public_inputs::KernelCircuitPublicInputs,
            public_data_read::PublicDataRead,
            public_data_update_request::PublicDataUpdateRequest,
        },
        address::Address,
        contrakt::storage_read::StorageRead,
        tests::{
            public_call_data_builder::PublicCallDataBuilder,
            testing_harness::{
                PreviousKernelDataBuilder,
            },
        },
        utils::{
            arrays::{
                array_length,
                expect_array_values,
            },
            bounded_vec::BoundedVec,
        },
    };
    use dep::aztec::constants_gen::{
        MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
        MAX_PUBLIC_DATA_READS_PER_CALL,
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
    };

    fn expect_public_data_reads<N, S>(public_data_reads: [PublicDataRead; N], expected: [PublicDataRead; S]) {
        assert(expect_array_values(
            public_data_reads,
            expected,
            |pdr1: PublicDataRead, pdr2: PublicDataRead| pdr1.equals(pdr2),
            |pdr: PublicDataRead| pdr.is_empty(),
        ));
    }

    fn expect_public_data_update_requests<N, S>(
        public_data_update_requests: [PublicDataUpdateRequest; N],
        expected: [PublicDataUpdateRequest; S],
    ) {
        assert(expect_array_values(
            public_data_update_requests,
            expected,
            |r1: PublicDataUpdateRequest, r2: PublicDataUpdateRequest| r1.equals(r2),
            |r: PublicDataUpdateRequest| r.is_empty(),
        ));
    }

    struct PublicKernelPrivatePreviousInputsBuilder {
        previous_kernel: PreviousKernelDataBuilder,
        public_call: PublicCallDataBuilder,
    }

    impl PublicKernelPrivatePreviousInputsBuilder {
        pub fn new() -> Self {
            let previous_kernel = PreviousKernelDataBuilder::new(false, true);
            let public_call = PublicCallDataBuilder::new();
            
            PublicKernelPrivatePreviousInputsBuilder {
                previous_kernel,
                public_call,
            }
        }

        // A helper function that uses the contract address defined in the public call data to compute the public data 
        // reads for the given requests.
        pub fn compute_public_data_reads<N>(self, read_requests: [StorageRead; N]) -> [PublicDataRead; N] {
            compute_public_data_reads(self.public_call.contract_address, read_requests)
        }

        pub fn get_current_public_data_reads(self) -> [PublicDataRead; MAX_PUBLIC_DATA_READS_PER_CALL] {
            self.compute_public_data_reads(self.public_call.public_inputs.contract_storage_reads.storage)
        }

        pub fn get_current_public_data_update_requests(self) -> [PublicDataUpdateRequest; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL] {
            compute_public_data_update_requests(
                self.public_call.contract_address,
                self.public_call.public_inputs.contract_storage_update_requests.storage,
            )
        }

        pub fn execute(self) -> KernelCircuitPublicInputs {
            let mut previous_kernel = self.previous_kernel.finish();
            let public_call = self.public_call.finish();
            // Adjust the call stack item hash for the current call in the previous iteration.
            previous_kernel.public_inputs.end.public_call_stack[0] = public_call.call_stack_item.hash();

            let kernel = PublicKernelPrivatePreviousInputs {
                previous_kernel,
                public_call,
            };

            kernel.public_kernel_private_previous()
        }

        pub fn succeeded(self) {
            let _ = self.execute();
        }

        pub fn failed(self) {
            let _ = self.execute();
        }
    }

    #[test]
    fn only_valid_public_data_reads_should_be_propagated() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_read_requests(1);
        builder.public_call.push_empty_read_requests(1);
        builder.public_call.push_read_requests(1);
        let public_data_reads = builder.get_current_public_data_reads();

        let public_inputs = builder.execute();

        // Only the 2 valid reads should have been propagated.
        let expected = [public_data_reads[0], public_data_reads[2]];
        expect_public_data_reads(public_inputs.end.public_data_reads, expected);
    }

    #[test]
    fn only_valid_update_requests_should_be_propagated() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_update_requests(1);
        builder.public_call.push_empty_update_requests(1);
        builder.public_call.push_update_requests(1);
        let public_data_update_requests = builder.get_current_public_data_update_requests();

        let public_inputs = builder.execute();

        // Only the 2 valid reads should have been propagated.
        let expected = [public_data_update_requests[0], public_data_update_requests[2]];
        expect_public_data_update_requests(public_inputs.end.public_data_update_requests, expected);
    }

    #[test(should_fail_with="Constructors cannot be public functions")]
    fn constructor_should_fail() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.function_data.is_constructor = true;

        builder.failed();
    }

    #[test(should_fail_with="Contract deployment cannot be a public function")]
    fn constructor_should_fail_2() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.public_inputs.call_context.is_contract_deployment = true;

        builder.failed();
    }

    #[test(should_fail_with="Bytecode hash cannot be zero")]
    fn no_bytecode_hash_should_fail() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.bytecode_hash = 0;

        builder.failed();
    }

    #[test(should_fail_with="msg_sender must be self for internal calls")]
    fn invalid_is_internal() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.function_data.is_internal = true;
        builder.public_call.public_inputs.call_context.msg_sender = Address::from_field(1);
        builder.public_call.public_inputs.call_context.storage_contract_address = Address::from_field(2);

        builder.failed();
    }

    #[test(should_fail_with="Contract address cannot be zero")]
    fn contract_address_must_be_valid() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.contract_address = Address::ZERO();

        builder.failed();
    }

    #[test(should_fail_with="Function signature cannot be zero")]
    fn function_selector_must_be_valid() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.function_data.selector = FunctionSelector::zero();

        builder.failed();
    }

    #[test(should_fail_with="Cannot execute a private function with the public kernel circuit")]
    fn private_call_should_fail() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.function_data.is_private = true;

        builder.failed();
    }

    #[test(should_fail_with="calculated public_kernel_inputs_hash does not match provided public_kernel_inputs_hash at the top of the call stack")]
    fn inconsistent_call_hash_should_fail() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        let mut previous_kernel = builder.previous_kernel.finish();
        let public_call = builder.public_call.finish();
        // Tweak the call stack item hash.
        previous_kernel.public_inputs.end.public_call_stack[0] = public_call.call_stack_item.hash() + 1;

        let kernel = PublicKernelPrivatePreviousInputs {
            previous_kernel,
            public_call,
        };

        let _ = kernel.public_kernel_private_previous();
    }

    #[test(should_fail_with="call_stack_storage_address does not match expected_storage_address")]
    fn incorrect_storage_contract_address_fails_for_regular_calls() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_call_stacks(1);
        // Tweak the storage contract address of the preimage at index 0.
        let mut preimage = builder.public_call.public_call_stack_preimages.get(0);
        preimage.public_inputs.call_context.storage_contract_address.inner += 1;
        builder.public_call.update_call_stack(0, preimage, true);

        builder.failed();
    }

    #[test(should_fail_with="call_stack_msg_sender does not match expected_msg_sender")]
    fn incorrect_msg_sender_fails_for_regular_calls() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_call_stacks(1);
        // Tweak the msg_sender of the preimage at index 0.
        let mut preimage = builder.public_call.public_call_stack_preimages.get(0);
        preimage.public_inputs.call_context.msg_sender.inner += 1;
        builder.public_call.update_call_stack(0, preimage, true);

        builder.failed();
    }

    #[test]
    fn public_kernel_circuit_succeeds_for_mixture_of_regular_and_delegate_calls() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_call_stacks(1);
        builder.public_call.push_delegate_call_stacks(1);
        builder.public_call.push_call_stacks(1);
        builder.public_call.push_delegate_call_stacks(1);

        builder.succeeded();
    }

    #[test(should_fail_with="call_stack_msg_sender does not match expected_msg_sender")]
    fn public_kernel_circuit_fails_on_incorrect_msg_sender_in_delegate_call() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_delegate_call_stacks(1);
        // Tweak the msg_sender of the preimage at index 0.
        let mut preimage = builder.public_call.public_call_stack_preimages.get(0);
        preimage.public_inputs.call_context.msg_sender.inner += 1;
        builder.public_call.update_call_stack(0, preimage, true);

        builder.failed();
    }

    #[test(should_fail_with=""call_stack_storage_address doesnt match expected_storage_address")]
    fn public_kernel_circuit_fails_on_incorrect_storage_contract_in_delegate_call() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_delegate_call_stacks(1);
        // Tweak the storage contract address of the preimage at index 0.
        let mut preimage = builder.public_call.public_call_stack_preimages.get(0);
        preimage.public_inputs.call_context.storage_contract_address.inner += 1;
        builder.public_call.update_call_stack(0, preimage, true);

        builder.failed();
    }

    #[test(should_fail_with=""call_stack_portal_contract_address doesnt match expected_portal_address")]
    fn public_kernel_circuit_fails_on_incorrect_portal_contract_in_delegate_call() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_delegate_call_stacks(1);
        // Tweak the portal contract address of the preimage at index 0.
        let mut preimage = builder.public_call.public_call_stack_preimages.get(0);
        preimage.public_inputs.call_context.portal_contract_address.inner += 1;
        builder.public_call.update_call_stack(0, preimage, true);

        builder.failed();
    }

    #[test]
    fn public_kernel_circuit_only_checks_non_empty_call_stacks() {
        let mut builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.public_call.push_call_stacks(4);

        // Tweak the msg_sender of the preimage at index 1.
        let mut preimage = builder.public_call.public_call_stack_preimages.get(1);
        preimage.public_inputs.call_context.msg_sender.inner += 1;
        builder.public_call.update_call_stack(1, preimage, true);

        // Tweak the storage contract address of the preimage at index 2.
        let mut preimage = builder.public_call.public_call_stack_preimages.get(2);
        preimage.public_inputs.call_context.storage_contract_address.inner += 1;
        builder.public_call.update_call_stack(2, preimage, true);

        // Set all but the first call stack item to have a zero call stack hash.
        // These call stack items will have incorrect data but will be ignored as the hash is zero.
        let public_call_stack = builder.public_call.public_inputs.public_call_stack;
        let mut new_public_call_stack: BoundedVec<Field, MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL> = BoundedVec::new(0);
        new_public_call_stack.push(public_call_stack.get(0));
        builder.public_call.public_inputs.public_call_stack = new_public_call_stack;

        builder.succeeded();
    }

    #[test]
    fn public_kernel_circuit_with_private_previous_kernel_should_succeed() {
        let builder = PublicKernelPrivatePreviousInputsBuilder::new();
        builder.succeeded();
    }
}