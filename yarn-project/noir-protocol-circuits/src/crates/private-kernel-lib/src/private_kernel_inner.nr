use dep::aztec::constants_gen::{MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX};
use crate::common;
use crate::mocked::{Proof, AggregationObject, verify_previous_kernel_state};
use crate::transaction::request::TxRequest;
use crate::abis::{
    combined_constant_data::CombinedConstantData,
    previous_kernel_data::PreviousKernelData,
    private_kernel::private_call_data::PrivateCallData,
    new_contract_data::NewContractData,
    kernel_circuit_public_inputs::{KernelCircuitPublicInputs, KernelCircuitPublicInputsBuilder}
};
use crate::utils::{
    arrays,
    bounded_vec::BoundedVec,
};
use dep::std::unsafe;

struct PrivateKernelInputsInner {
    previous_kernel : PreviousKernelData,
    private_call : PrivateCallData,
}

impl PrivateKernelInputsInner {
    // TODO: We can create a type alias for private call stack item
    fn pop_and_validate_this_private_call_hash(self, public_inputs : &mut KernelCircuitPublicInputsBuilder){
        let private_call = self.private_call;
        let popped_private_call_hash = public_inputs.end.private_call_stack.pop();

        let calculated_this_private_call_hash = private_call.call_stack_item.hash();
        assert(popped_private_call_hash == calculated_this_private_call_hash, "calculated private_call_hash does not match provided private_call_hash at the top of the callstack");
    }

    fn validate_contract_tree_root(self) {
        let purported_contract_tree_root = self.private_call.call_stack_item.public_inputs().historical_block_data.contract_tree_root();
        let previous_kernel_contract_tree_root = self.previous_kernel.public_inputs.constants.block_data.contract_tree_root();

        assert(purported_contract_tree_root == previous_kernel_contract_tree_root, "purported_contract_tree_root doesn't match previous_kernel_contract_tree_root");
    }

    fn validate_inputs(self) {
        let this_call_stack_item = self.private_call.call_stack_item;
        assert(this_call_stack_item.function_data().is_private, "Cannot execute a non-private function with the private kernel circuit");

        let start = self.previous_kernel.public_inputs.end;
        let start_private_call_stack_length = arrays::array_length(start.private_call_stack);

        assert(self.previous_kernel.public_inputs.is_private, "Cannot verify a non-private kernel snark in the private kernel circuit");
        assert(this_call_stack_item.function_data().is_constructor == false, "A constructor must be executed as the first tx in the recursion");
        assert(start_private_call_stack_length != 0, "Cannot execute private kernel circuit with an empty private call stack");
    }

    fn native_private_kernel_circuit_inner(self) -> KernelCircuitPublicInputs {
        let mut public_inputs : KernelCircuitPublicInputsBuilder = unsafe::zeroed();
        public_inputs.is_private = true;

        common::validate_previous_kernel_values(self.previous_kernel.public_inputs.end);

        // Do this before any functions can modify the inputs.
        common::initialize_end_values(self.previous_kernel, &mut public_inputs);

        self.validate_inputs();

        common::validate_arrays(self.private_call.call_stack_item.public_inputs());

        self.pop_and_validate_this_private_call_hash(&mut public_inputs);

        common::validate_call_stack(self.private_call);

        common::validate_read_requests(
            public_inputs.constants.block_data.note_hash_tree_root(),
            self.private_call.call_stack_item.public_inputs().read_requests,  // read requests from private call
            self.private_call.read_request_membership_witnesses);

        //TODO(David): feels like update_end_values should happen later
        common::update_end_values(self.private_call, &mut public_inputs);

        // ensure that historic/purported contract tree root matches the one in previous kernel
        self.validate_contract_tree_root();

        let private_call_stack_item = self.private_call.call_stack_item;

        common::contract_logic(self.private_call,
                          &mut public_inputs,
                          private_call_stack_item.public_inputs().contract_deployment_data,
                          private_call_stack_item.function_data());

        let (is_previous_state_valid, updated_aggregation_object) = verify_previous_kernel_state(public_inputs.end.aggregation_object,self.private_call.proof);
        assert(is_previous_state_valid);

        public_inputs.end.aggregation_object = updated_aggregation_object;

        public_inputs.finish()
    }
}


mod tests {
    use crate::private_kernel_inner::PrivateKernelInputsInner;
    use crate::abis::{
        kernel_circuit_public_inputs::{KernelCircuitPublicInputs, KernelCircuitPublicInputsBuilder},
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        read_request_membership_witness::ReadRequestMembershipWitness,
        combined_constant_data::CombinedConstantData,
        previous_kernel_data::PreviousKernelData,
    };
    use crate::tests::{
        testing_harness::{
            create_private_call_data,
            generate_read_requests,
            build_tx_request,
            PrivateAppInputs,
            non_zero_items,
            build_tx_context,
        },
        apps::deposit::{
            deposit_app,
            DepositParams,
        },
        apps::constructor::{
            constructor_app,
            ConstructorParams,
        }
    };
    use crate::address::Address;
    use crate::hash::{accumulate_sha256};
    use crate::utils::uint128::U128;
    use dep::aztec::constants_gen::{
        MAX_READ_REQUESTS_PER_CALL,
        MAX_NEW_COMMITMENTS_PER_CALL,
        MAX_NEW_NULLIFIERS_PER_CALL,
        EMPTY_NULLIFIED_COMMITMENT,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
        MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
        MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
        NOTE_HASH_TREE_HEIGHT,
    };

    fn build_inputs<T>(
        function: fn (PrivateAppInputs, T) -> PrivateCircuitPublicInputs,
        app_params: T,
    ) -> PrivateKernelInputsInner {

        let msg_sender = Address::from_field(27);
        let (private_call, contract_deployment_data) = create_private_call_data(
            false,
            function,
            app_params,
            msg_sender,
        );

        let tx_context = build_tx_context(false, contract_deployment_data);

        let mut previous_kernel: PreviousKernelData = dep::std::unsafe::zeroed();
        previous_kernel.public_inputs.constants = CombinedConstantData {
            block_data: private_call.call_stack_item.public_inputs().historical_block_data,
            tx_context,
        };

        previous_kernel.public_inputs.is_private = true;
        previous_kernel.public_inputs.end.encrypted_logs_hash = [0,0];
        previous_kernel.public_inputs.end.unencrypted_logs_hash = [0,0];
        previous_kernel.public_inputs.end.encrypted_log_preimages_length = 0;
        previous_kernel.public_inputs.end.unencrypted_log_preimages_length = 0;

        previous_kernel.public_inputs.end.new_nullifiers[0] = 321; // 0th nullifier must be non-zero.
        previous_kernel.public_inputs.end.nullified_commitments[0] = EMPTY_NULLIFIED_COMMITMENT;

        previous_kernel.public_inputs.end.private_call_stack[0] = private_call.call_stack_item.hash();

        PrivateKernelInputsInner {
            previous_kernel,
            private_call,
        }
    }


    // TODO

    // TODO


    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_return_values() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(constructor_app, params);

        let malformed_return_values = [0,0,0,553];
        private_inputs.private_call.call_stack_item.inner.public_inputs.return_values = malformed_return_values;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        let public_inputs = private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_read_requests() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(constructor_app, params);

        let mut malformed_read_requests = [0; MAX_READ_REQUESTS_PER_CALL];
        malformed_read_requests[1] = 9123;
        malformed_read_requests[3] = 12;
        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = malformed_read_requests;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_commitments() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(constructor_app, params);

        let mut malformed_commitments = [0; MAX_NEW_COMMITMENTS_PER_CALL];
        malformed_commitments[1] = 9123;
        private_inputs.private_call.call_stack_item.inner.public_inputs.new_commitments = malformed_commitments;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_nullifiers() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(constructor_app, params);

        let mut malformed_nullifiers = [0; MAX_NEW_NULLIFIERS_PER_CALL];
        malformed_nullifiers[MAX_NEW_NULLIFIERS_PER_CALL-1] = 12;
        private_inputs.private_call.call_stack_item.inner.public_inputs.new_nullifiers = malformed_nullifiers;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();
        
        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_nullified_commitments() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(constructor_app, params);

        let mut malformed_nullified_commitments = [0; MAX_NEW_NULLIFIERS_PER_CALL];
        malformed_nullified_commitments[2] = EMPTY_NULLIFIED_COMMITMENT;
        private_inputs.private_call.call_stack_item.inner.public_inputs.nullified_commitments = malformed_nullified_commitments;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();
        
        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_private_call_stack() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(constructor_app, params);

        let mut malformed_private_call_stack = [0; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL];
        malformed_private_call_stack[1] = 888;
        private_inputs.private_call.call_stack_item.inner.public_inputs.private_call_stack = malformed_private_call_stack;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();
        
        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_public_call_stack() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(constructor_app, params);

        let mut malformed_public_call_stack = [0; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL];
        malformed_public_call_stack[1] = 888;
        private_inputs.private_call.call_stack_item.inner.public_inputs.public_call_stack = malformed_public_call_stack;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();
        
        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_new_l2_to_l1_msgs() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(constructor_app, params);

        let mut malformed_new_l2_to_l1_msgs = [0; MAX_NEW_L2_TO_L1_MSGS_PER_CALL];
        malformed_new_l2_to_l1_msgs[1] = 888;
        private_inputs.private_call.call_stack_item.inner.public_inputs.new_l2_to_l1_msgs = malformed_new_l2_to_l1_msgs;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();
        
        private_inputs.native_private_kernel_circuit_inner();
    }

    // TODO

    // TODO


    #[test(should_fail_with="private data tree root mismatch")]
    fn native_read_request_bad_request() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(2);

        // tweak read_request so it gives wrong root when paired with its sibling path
        read_requests[1] += 1;

        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with="private data tree root mismatch")]
    fn native_read_request_bad_leaf_index() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(2);

        // tweak leaf index so it gives wrong root when paired with its request and sibling path
        read_request_membership_witnesses[1].leaf_index += 1;
        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test(should_fail_with="private data tree root mismatch")]
    fn native_read_request_bad_sibling_path() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(2);

        // tweak sibling path so it gives wrong root when paired with its request
        read_request_membership_witnesses[1].sibling_path[1] += 1;
        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        private_inputs.native_private_kernel_circuit_inner();
    }

    #[test]
    fn native_no_read_requests_works() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(0);

        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        let public_inputs = private_inputs.native_private_kernel_circuit_inner();

        // non-transient read requests are NOT forwarded
        assert_eq(non_zero_items(public_inputs.end.read_requests), 0);
    }

    #[test]
    fn native_one_read_requests_works() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(1);

        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        let public_inputs = private_inputs.native_private_kernel_circuit_inner();

        // non-transient read requests are NOT forwarded
        assert_eq(non_zero_items(public_inputs.end.read_requests), 0);
    }

    #[test]
    fn native_two_read_requests_works() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(2);

        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        let public_inputs = private_inputs.native_private_kernel_circuit_inner();

        // non-transient read requests are NOT forwarded
        assert_eq(non_zero_items(public_inputs.end.read_requests), 0);
    }

    #[test]
    fn native_max_read_requests_works() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(MAX_READ_REQUESTS_PER_CALL as u64);

        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        let public_inputs = private_inputs.native_private_kernel_circuit_inner();

        // non-transient read requests are NOT forwarded
        assert_eq(non_zero_items(public_inputs.end.read_requests), 0);
    }

    #[test]
    fn native_one_transient_read_requests_works() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(1);

        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses.map(|mut witness: ReadRequestMembershipWitness<NOTE_HASH_TREE_HEIGHT>| {
            witness.is_transient = true;
            witness
        });
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        let public_inputs = private_inputs.native_private_kernel_circuit_inner();

        // non-transient read requests are NOT forwarded
        assert_eq(non_zero_items(public_inputs.end.read_requests), 1);
    }

    #[test]
    fn native_max_read_requests_one_transient_works() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(MAX_READ_REQUESTS_PER_CALL as u64);

        read_request_membership_witnesses[1].is_transient = true;
        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        let public_inputs = private_inputs.native_private_kernel_circuit_inner();

        // non-transient read requests are NOT forwarded
        assert_eq(non_zero_items(public_inputs.end.read_requests), 1);
    }

     #[test]
    fn native_max_read_requests_all_transient_works() {
        let params = dep::std::unsafe::zeroed();
        let mut private_inputs = build_inputs(deposit_app, params);

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(MAX_READ_REQUESTS_PER_CALL as u64);

        private_inputs.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses.map(|mut witness: ReadRequestMembershipWitness<NOTE_HASH_TREE_HEIGHT>| {
            witness.is_transient = true;
            witness
        });
        private_inputs.previous_kernel.public_inputs.end.private_call_stack[0] = private_inputs.private_call.call_stack_item.hash();

        let public_inputs = private_inputs.native_private_kernel_circuit_inner();

        // non-transient read requests are NOT forwarded
        assert_eq(non_zero_items(public_inputs.end.read_requests), MAX_READ_REQUESTS_PER_CALL as u64);
    }


    // TODO

    // TODO


}
