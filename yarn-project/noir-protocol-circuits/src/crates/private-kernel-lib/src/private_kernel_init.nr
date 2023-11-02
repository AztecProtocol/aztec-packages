use dep::aztec::constants_gen;
use crate::common;
use crate::mocked::{Proof, verify_previous_kernel_state};
use crate::transaction::request::TxRequest;
use crate::abis::{
    combined_constant_data::CombinedConstantData,
    private_kernel::private_call_data::PrivateCallData,
    kernel_circuit_public_inputs::{KernelCircuitPublicInputs, KernelCircuitPublicInputsBuilder}
};
use crate::utils::arrays;
use dep::std::unsafe;

// Initialization struct for private inputs to the private kernel
struct PrivateKernelInputsInit {
    tx_request : TxRequest,
    private_call : PrivateCallData,
}

impl PrivateKernelInputsInit {
    fn initialize_end_values(self, public_inputs : &mut KernelCircuitPublicInputsBuilder) {
        let private_call_public_inputs = self.private_call.call_stack_item.public_inputs();
        let constants = CombinedConstantData{
            block_data : private_call_public_inputs.historical_block_data,
            tx_context : self.tx_request.tx_context,
        };

        public_inputs.constants = constants;
    }

    // Confirm that the TxRequest (user's intent) 
    // matches the private call being executed
    fn validate_this_private_call_against_tx_request(self) {
        let tx_request = self.tx_request;
        // Call stack item for the initial call
        let call_stack_item = self.private_call.call_stack_item;
        
        // Checks to ensure that the user's intent matches the initial private call
        //
        // We use the word correct to denote whether it matches the user intent.
        //
        // Ensure we are calling the correct initial contract
        let origin_address_matches = tx_request.origin.eq(call_stack_item.contract_address());
        assert(origin_address_matches, "origin address does not match call stack items contract address");
        //
        // Ensure we are calling the correct initial function in the contract
        let entry_point_function_matches = tx_request.function_data.hash() == call_stack_item.function_data().hash();
        // TODO - Allow special characters in error message.
        // assert(entry_point_function_matches, "tx_request.function_data must match call_stack_item.function_data");
        assert(entry_point_function_matches, "tx_request function_data must match call_stack_item function_data");
        //
        // Ensure we are passing the correct arguments to the function.
        let args_match = tx_request.args_hash == call_stack_item.public_inputs().args_hash;
        assert(args_match, "noir function args passed to tx_request must match args in the call_stack_item");
    }

    fn validate_inputs(self) {
        let call_stack_item = self.private_call.call_stack_item;
        let function_data = call_stack_item.function_data();

        let public_inputs = call_stack_item.public_inputs();

        /* TODO(Mike/David): If we are going to have 3 initial calls on the private call stack,
        * then do we still need the `private_call_stack`
        * despite no longer needing a full `previous_kernel`
        */

        assert(function_data.is_private, "Private kernel circuit can only execute a private function");
        assert(public_inputs.call_context.is_delegate_call == false, "Users cannot make a delegatecall");
        assert(public_inputs.call_context.is_static_call == false, "Users cannot make a static call");
        
        // The below also prevents delegatecall/staticcall in the base case
        assert(public_inputs.call_context.storage_contract_address.eq(call_stack_item.contract_address()), "Storage contract address must be that of the called contract");
    }

    fn update_end_values(self, public_inputs : &mut KernelCircuitPublicInputsBuilder) {
        // We only initialized constants member of public_inputs so far. Therefore, there must not be any
        // new nullifiers or logs as part of public_inputs.
        
        let new_commitments_empty = arrays::is_empty_array(public_inputs.end.new_commitments.storage);
        assert(new_commitments_empty, "public_inputs.end.new_commitments must start as empty in initial kernel iteration");

        let new_nullifiers_empty = arrays::is_empty_array(public_inputs.end.new_nullifiers.storage);
        assert(new_nullifiers_empty, "public_inputs.end.new_nullifiers must start as empty in initial kernel iteration");

        let end_nullified_commitments_empty = arrays::is_empty_array(public_inputs.end.nullified_commitments.storage);
        assert(end_nullified_commitments_empty, "public_inputs.end.nullified_commitments must start as empty in initial kernel iteration");

        let encrypted_logs_hash_empty = arrays::log_hashes_empty(public_inputs.end.encrypted_logs_hash);
        assert(encrypted_logs_hash_empty, "public_inputs.end.encrypted_logs_hash must start as empty in initial kernel iteration");

        let unencrypted_logs_hash_empty = arrays::log_hashes_empty(public_inputs.end.unencrypted_logs_hash);
        assert(unencrypted_logs_hash_empty, "public_inputs.end.unencrypted_logs_hash must start as empty in initial kernel iteration");

        let read_requests_empty = arrays::is_empty_array(public_inputs.end.read_requests.storage);
        assert(read_requests_empty, "public_inputs.end.read_requests must start as empty in initial kernel iteration");

        let pending_read_requests_empty = arrays::is_empty_array(public_inputs.end.pending_read_requests.storage);
        assert(pending_read_requests_empty, "public_inputs.end.pending_read_requests_empty must start as empty in initial kernel iteration");

        assert(public_inputs.end.encrypted_log_preimages_length == 0,"public_inputs.end.encrypted_log_preimages_length must start as 0 in initial kernel iteration");
        assert(public_inputs.end.unencrypted_log_preimages_length == 0,"public_inputs.end.unencrypted_log_preimages_length must start as 0 in initial kernel iteration");

        // Since it's the first iteration, we need to push the the tx hash nullifier into the `new_nullifiers` array
        public_inputs.end.new_nullifiers.push(self.tx_request.hash());
        
        // Push an empty nullified commitment too since each nullifier must
        // be paired with a nonzero (real or "empty") nullified commitment
        public_inputs.end.nullified_commitments.push(constants_gen::EMPTY_NULLIFIED_COMMITMENT);

        // Note that we do not need to nullify the transaction request nonce anymore.
        // Should an account want to additionally use nonces for replay protection or handling cancellations,
        // they will be able to do so in the account contract logic:
        // https://github.com/AztecProtocol/aztec-packages/issues/660
    }

    pub fn native_private_kernel_circuit_initial(self) -> KernelCircuitPublicInputs {
        let mut public_inputs : KernelCircuitPublicInputsBuilder = unsafe::zeroed();
        public_inputs.is_private = true;
        
        self.initialize_end_values(&mut public_inputs);

        self.validate_inputs();

        common::validate_arrays(self.private_call.call_stack_item.public_inputs());

        self.validate_this_private_call_against_tx_request();

        common::validate_call_stack(self.private_call);

        common::validate_read_requests(
            public_inputs.constants.block_data.note_hash_tree_root(),
            self.private_call.call_stack_item.public_inputs().read_requests,
            self.private_call.read_request_membership_witnesses
        );

        // TODO(dbanks12): feels like update_end_values should happen after contract logic
        self.update_end_values(&mut public_inputs);
        common::update_end_values(self.private_call, &mut public_inputs);

        common::contract_logic(self.private_call,
                          &mut public_inputs,
                          self.tx_request.tx_context.contract_deployment_data,
                          self.tx_request.function_data);

        // TODO(David): What previous kernel proof are we talking about, since this is private-kernel-init
        let (is_previous_state_valid, updated_aggregation_object) = verify_previous_kernel_state(public_inputs.end.aggregation_object,self.private_call.proof);
        assert(is_previous_state_valid);

        public_inputs.end.aggregation_object = updated_aggregation_object;

        public_inputs.finish()
    }
}

mod tests {
    use crate::private_kernel_init::PrivateKernelInputsInit;
    use crate::abis::{
        complete_address::CompleteAddress,
        kernel_circuit_public_inputs::KernelCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallData,
        read_request_membership_witness::ReadRequestMembershipWitness,
    };
    use crate::tests::{
        fixtures::{
            read_requests::generate_read_requests,
        },
        testing_harness::{
            create_private_call_data,
            build_tx_request,
        },
    };
    use crate::transaction::request::TxRequest;
    use crate::address::Address;
    use crate::hash::{
        compute_constructor_hash,
        compute_logs_hash,
        stdlib_recursion_verification_key_compress_native_vk,
    };
    use crate::utils::arrays::array_length;
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

    struct PrivateKernelInitInputsBuilder {
        tx_request: TxRequest,
        private_call: PrivateCallData,
    }

    impl PrivateKernelInitInputsBuilder {
        pub fn new() -> Self {
            PrivateKernelInitInputsBuilder::new_with_config(false)
        }

        pub fn new_constructor() -> Self {
            PrivateKernelInitInputsBuilder::new_with_config(true)
        }

        fn new_with_config(is_constructor: bool) -> Self {
            let private_call = create_private_call_data(is_constructor);

            let tx_request = build_tx_request(
                is_constructor,
                private_call,
            );

            PrivateKernelInitInputsBuilder {
                tx_request,
                private_call,
            }
        }

        pub fn execute(self) -> KernelCircuitPublicInputs {
            let kernel = PrivateKernelInputsInit {
                tx_request: self.tx_request,
                private_call: self.private_call,
            };

            kernel.native_private_kernel_circuit_initial()
        }

        pub fn failed(self) {
            let _ = self.execute();
        }
    }

    pub fn validate_deployed_contract_address(tx_request: TxRequest, private_call: PrivateCallData, public_inputs: KernelCircuitPublicInputs) {
        assert_eq(public_inputs.end.new_contracts.len(), 1);
        let cdd = tx_request.tx_context.contract_deployment_data;

        let private_circuit_vk_hash = stdlib_recursion_verification_key_compress_native_vk(private_call.vk);
        let constructor_hash = compute_constructor_hash(tx_request.function_data, tx_request.args_hash, private_circuit_vk_hash);
        let contract_address = CompleteAddress::compute(cdd.deployer_public_key,
            cdd.contract_address_salt,
            cdd.function_tree_root,
            constructor_hash).address;
        assert(public_inputs.end.new_contracts[0].contract_address.eq(contract_address));
    }

    pub fn validate_no_new_deployed_contract(public_inputs: KernelCircuitPublicInputs) {
        for new_contract in public_inputs.end.new_contracts {
            assert(new_contract.is_empty());
        }
    }

    #[test]
    fn deposit() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        // Logs for the private call.
        let encrypted_logs_hash = [16, 69];
        let encrypted_log_preimages_length = 100;
        let unencrypted_logs_hash = [26, 47];
        let unencrypted_log_preimages_length = 50;
        builder.private_call.call_stack_item.inner.public_inputs.encrypted_logs_hash = encrypted_logs_hash;
        builder.private_call.call_stack_item.inner.public_inputs.encrypted_log_preimages_length = encrypted_log_preimages_length;
        builder.private_call.call_stack_item.inner.public_inputs.unencrypted_logs_hash = unencrypted_logs_hash;
        builder.private_call.call_stack_item.inner.public_inputs.unencrypted_log_preimages_length = unencrypted_log_preimages_length;

        let public_inputs = builder.execute();

        validate_no_new_deployed_contract(public_inputs);

        // Check the first nullifier is hash of the signed tx request
        let tx_hash = builder.tx_request.hash();
        assert_eq(public_inputs.end.new_nullifiers[0], tx_hash);

        // Log preimages length should increase by `(un)encrypted_log_preimages_length` from private input
        assert_eq(public_inputs.end.encrypted_log_preimages_length, encrypted_log_preimages_length);
        assert_eq(public_inputs.end.unencrypted_log_preimages_length, unencrypted_log_preimages_length);

        // Logs hashes should be a sha256 hash of a 0 value (the previous log hash) and the `(un)encrypted_logs_hash` from private input
        let expected_encrypted_logs_hash = compute_logs_hash([0, 0], encrypted_logs_hash);
        assert_eq(public_inputs.end.encrypted_logs_hash, expected_encrypted_logs_hash);

        let expected_unencrypted_logs_hash = compute_logs_hash([0, 0], unencrypted_logs_hash);
        assert_eq(public_inputs.end.unencrypted_logs_hash, expected_unencrypted_logs_hash);
    }

    #[test]
    fn basic_contract_deployment() {
        let builder = PrivateKernelInitInputsBuilder::new_constructor();

        let public_inputs = builder.execute();

        validate_deployed_contract_address(builder.tx_request, builder.private_call, public_inputs);

        // Since there are no logs, log preimages length should be 0 and both logs hashes should be a sha256 hash of 2 zero
        // values
        assert_eq(public_inputs.end.encrypted_log_preimages_length, 0);
        assert_eq(public_inputs.end.unencrypted_log_preimages_length, 0);

        let expected_logs_hash = compute_logs_hash([0, 0], [0, 0]);
        assert_eq(public_inputs.end.encrypted_logs_hash, expected_logs_hash);
        assert_eq(public_inputs.end.unencrypted_logs_hash, expected_logs_hash);
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_return_values() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let malformed_return_values = [0, 0, 0, 553];
        builder.private_call.call_stack_item.inner.public_inputs.return_values = malformed_return_values;

        builder.failed();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_read_requests() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let mut malformed_read_requests = [0; MAX_READ_REQUESTS_PER_CALL];
        malformed_read_requests[1] = 9123;
        malformed_read_requests[3] = 12;
        builder.private_call.call_stack_item.inner.public_inputs.read_requests = malformed_read_requests;
        
        builder.failed();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_commitments() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let mut malformed_commitments = [0; MAX_NEW_COMMITMENTS_PER_CALL];
        malformed_commitments[1] = 9123;
        builder.private_call.call_stack_item.inner.public_inputs.new_commitments = malformed_commitments;
        
        builder.failed();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_nullifiers() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let mut malformed_nullifiers = [0; MAX_NEW_NULLIFIERS_PER_CALL];
        malformed_nullifiers[MAX_NEW_NULLIFIERS_PER_CALL - 1] = 12;
        builder.private_call.call_stack_item.inner.public_inputs.new_nullifiers = malformed_nullifiers;
        
        builder.failed();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_nullified_commitments() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let mut malformed_nullified_commitments = [0; MAX_NEW_NULLIFIERS_PER_CALL];
        malformed_nullified_commitments[2] = EMPTY_NULLIFIED_COMMITMENT;
        builder.private_call.call_stack_item.inner.public_inputs.nullified_commitments = malformed_nullified_commitments;
        
        builder.failed();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_private_call_stack() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let mut malformed_private_call_stack = [0; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL];
        malformed_private_call_stack[1] = 888;
        builder.private_call.call_stack_item.inner.public_inputs.private_call_stack = malformed_private_call_stack;
        
        builder.failed();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_public_call_stack() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let mut malformed_public_call_stack = [0; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL];
        malformed_public_call_stack[1] = 888;
        builder.private_call.call_stack_item.inner.public_inputs.public_call_stack = malformed_public_call_stack;
        
        builder.failed();
    }

    #[test(should_fail_with = "invalid array")]
    fn input_validation_malformed_arrays_new_l2_to_l1_msgs() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let mut malformed_new_l2_to_l1_msgs = [0; MAX_NEW_L2_TO_L1_MSGS_PER_CALL];
        malformed_new_l2_to_l1_msgs[1] = 888;
        builder.private_call.call_stack_item.inner.public_inputs.new_l2_to_l1_msgs = malformed_new_l2_to_l1_msgs;
        
        builder.failed();
    }

    #[test(should_fail_with="call stack item hash does not match preimage hash")]
    fn contract_deployment_call_stack_item_hash_mismatch_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        builder.private_call.call_stack_item.inner.public_inputs.private_call_stack[0] = 27;
        
        builder.failed();
    }

    #[test(should_fail_with="contract address supplied does not match derived address")]
    fn contract_deployment_incorrect_contract_address_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let random_address = Address::from_field(27);
        builder.private_call.call_stack_item.inner.public_inputs.call_context.storage_contract_address = random_address;
        builder.tx_request.origin = random_address;
        builder.private_call.call_stack_item.inner.contract_address = random_address;

        builder.failed();
    }

    #[test(should_fail_with="origin address does not match call stack items contract address")]
    fn contract_deployment_contract_address_mismatch_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        let random_contract_address = Address::from_field(27);
        builder.private_call.call_stack_item.inner.public_inputs.call_context.storage_contract_address = random_contract_address;
        builder.private_call.call_stack_item.inner.contract_address = random_contract_address;

        builder.failed();
    }

    #[test(should_fail_with="tx_request function_data must match call_stack_item function_data")]
    fn contract_deployment_function_data_mismatch_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        builder.tx_request.function_data.selector.inner = 27;

        builder.failed();
    }

    #[test(should_fail_with="noir function args passed to tx_request must match args in the call_stack_item")]
    fn contract_deployment_args_hash_mismatch_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        // Modify the args hash in tx request.
        builder.tx_request.args_hash = 29;

        builder.failed();
    }

    #[test(should_fail_with="Private kernel circuit can only execute a private function")]
    fn private_function_is_private_false_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        // Set is_private in function data to false.
        builder.private_call.call_stack_item.inner.function_data.is_private = false;

        builder.failed();
    }

    #[test(should_fail_with="Users cannot make a static call")]
    fn private_function_static_call_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        // Set is_static_call to true.
        builder.private_call.call_stack_item.inner.public_inputs.call_context.is_static_call = true;

        builder.failed();
    }

    #[test(should_fail_with="Users cannot make a delegatecall")]
    fn private_function_delegate_call_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        // Set is_delegate_call to true.
        builder.private_call.call_stack_item.inner.public_inputs.call_context.is_delegate_call = true;

        builder.failed();
    }

    #[test(should_fail_with="Storage contract address must be that of the called contract")]
    fn private_function_incorrect_storage_contract_address_fails() {
        let mut builder = PrivateKernelInitInputsBuilder::new_constructor();

        // Set the storage_contract_address to a random scalar.
        builder.private_call.call_stack_item.inner.public_inputs.call_context.storage_contract_address = Address::from_field(356);

        builder.failed();
    }


    #[test(should_fail_with="private data tree root mismatch")]
    fn native_read_request_bad_request() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(2);

        // tweak read_request so it gives wrong root when paired with its sibling path
        read_requests[1] += 1;

        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

        builder.failed();
    }

    #[test(should_fail_with="private data tree root mismatch")]
    fn native_read_request_bad_leaf_index() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(2);

        // tweak leaf index so it gives wrong root when paired with its request and sibling path
        read_request_membership_witnesses[1].leaf_index += 1;
        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

        builder.failed();
    }

    #[test(should_fail_with="private data tree root mismatch")]
    fn native_read_request_bad_sibling_path() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(2);

        // tweak sibling path so it gives wrong root when paired with its request
        read_request_membership_witnesses[1].sibling_path[1] += 1;
        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

        builder.failed();
    }

    #[test]
    fn native_no_read_requests_works() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(0);

        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

        let public_inputs = builder.execute();

        validate_no_new_deployed_contract(public_inputs);
        // Check the first nullifier is hash of the signed tx request
        assert_eq(public_inputs.end.new_nullifiers[0], builder.tx_request.hash());

        // non-transient read requests are NOT forwarded
        assert_eq(array_length(public_inputs.end.read_requests), 0);
    }

    #[test]
    fn native_one_read_requests_works() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(1);

        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

        let public_inputs = builder.execute();

        validate_no_new_deployed_contract(public_inputs);
        // Check the first nullifier is hash of the signed tx request
        assert_eq(public_inputs.end.new_nullifiers[0], builder.tx_request.hash());

        // non-transient read requests are NOT forwarded
        assert_eq(array_length(public_inputs.end.read_requests), 0);
    }

    #[test]
    fn native_two_read_requests_works() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(2);

        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

        let public_inputs = builder.execute();

        validate_no_new_deployed_contract(public_inputs);
        // Check the first nullifier is hash of the signed tx request
        assert_eq(public_inputs.end.new_nullifiers[0], builder.tx_request.hash());

        // non-transient read requests are NOT forwarded
        assert_eq(array_length(public_inputs.end.read_requests), 0);
    }

    #[test]
    fn native_max_read_requests_works() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(MAX_READ_REQUESTS_PER_CALL as u64);

        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

        let public_inputs = builder.execute();

        validate_no_new_deployed_contract(public_inputs);
        // Check the first nullifier is hash of the signed tx request
        assert_eq(public_inputs.end.new_nullifiers[0], builder.tx_request.hash());

        // non-transient read requests are NOT forwarded
        assert_eq(array_length(public_inputs.end.read_requests), 0);
    }

    #[test]
    fn native_one_transient_read_requests_works() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(1);

        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses.map(|mut witness: ReadRequestMembershipWitness<NOTE_HASH_TREE_HEIGHT>| {
            witness.is_transient = true;
            witness
        });

        let public_inputs = builder.execute();

        validate_no_new_deployed_contract(public_inputs);
        // Check the first nullifier is hash of the signed tx request
        assert_eq(public_inputs.end.new_nullifiers[0], builder.tx_request.hash());

        // non-transient read requests are NOT forwarded
        assert_eq(array_length(public_inputs.end.read_requests), 1);
    }

    #[test]
    fn native_max_read_requests_one_transient_works() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(MAX_READ_REQUESTS_PER_CALL as u64);

        read_request_membership_witnesses[1].is_transient = true;
        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

        let public_inputs = builder.execute();

        validate_no_new_deployed_contract(public_inputs);
        // Check the first nullifier is hash of the signed tx request
        assert_eq(public_inputs.end.new_nullifiers[0], builder.tx_request.hash());

        // non-transient read requests are NOT forwarded
        assert_eq(array_length(public_inputs.end.read_requests), 1);
    }

     #[test]
    fn native_max_read_requests_all_transient_works() {
        let mut builder = PrivateKernelInitInputsBuilder::new();

        let (mut read_requests, mut read_request_membership_witnesses) = generate_read_requests(MAX_READ_REQUESTS_PER_CALL as u64);

        builder.private_call.call_stack_item.inner.public_inputs.read_requests = read_requests;
        builder.private_call.read_request_membership_witnesses = read_request_membership_witnesses.map(|mut witness: ReadRequestMembershipWitness<NOTE_HASH_TREE_HEIGHT>| {
            witness.is_transient = true;
            witness
        });

        let public_inputs = builder.execute();

        validate_no_new_deployed_contract(public_inputs);
        // Check the first nullifier is hash of the signed tx request
        assert_eq(public_inputs.end.new_nullifiers[0], builder.tx_request.hash());

        // non-transient read requests are NOT forwarded
        assert_eq(array_length(public_inputs.end.read_requests), MAX_READ_REQUESTS_PER_CALL);
    }
}
