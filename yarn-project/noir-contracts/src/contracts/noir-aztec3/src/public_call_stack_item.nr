use crate::abi::CallContext;
use crate::abi::ContractDeploymentData;
use crate::context::PrivateFunctionContext;
use crate::abi::PublicCircuitPublicInputs;
use crate::abi::FunctionData;
use crate::types::vec::BoundedVec;
use crate::utils::arr_copy_slice;

// 1 +
// crate::abi::FUNCTION_DATA_SIZE +
// crate::abi::CALL_CONTEXT_SIZE +
// crate::abi::MAX_ARGS
// = 1 + 3 + 6 + 8
global ENQUEUE_PUBLIC_FUNCTION_CALL_RETURN_SIZE: comptime Field = 18;

#[oracle(enqueuePublicFunctionCall)]
fn enqueue_public_function_call_oracle(
    _contract_address: Field, 
    _function_selector: Field, 
    _args: [Field; crate::abi::MAX_ARGS]
) -> [Field; ENQUEUE_PUBLIC_FUNCTION_CALL_RETURN_SIZE] {}

unconstrained fn enqueue_public_function_call_internal(
    contract_address: Field, 
    function_selector: Field,
    args: [Field; crate::abi::MAX_ARGS]
) -> [Field; ENQUEUE_PUBLIC_FUNCTION_CALL_RETURN_SIZE] {
    enqueue_public_function_call_oracle(
        contract_address, 
        function_selector, 
        args,
    )
}

struct PublicCallStackItem {
    contract_address: Field,
    function_data: FunctionData,
    public_inputs: PublicCircuitPublicInputs,
}

impl PublicCallStackItem {
    fn call(contract_address: Field, function_selector: Field, args: [Field; crate::abi::MAX_ARGS], mut context: PrivateFunctionContext) -> (Self, PrivateFunctionContext) {
        let fields = enqueue_public_function_call_internal(
            contract_address, 
            function_selector, 
            args
        );
        let item = PublicCallStackItem {
            contract_address: fields[0],
            function_data: FunctionData {
                function_selector: fields[1],
                is_private: fields[2] as bool,
                is_constructor: fields[3] as bool,
            },
            public_inputs: PublicCircuitPublicInputs {
                call_context: CallContext {
                    msg_sender : fields[4],
                    storage_contract_address : fields[5],
                    portal_contract_address : fields[6],

                    is_delegate_call : fields[7] as bool,
                    is_static_call : fields[8] as bool,
                    is_contract_deployment: fields[9] as bool
                },
                args: arr_copy_slice(fields, [0; crate::abi::MAX_ARGS], 10),
                return_values: [0; crate::abi::MAX_RETURN_VALUES],
                emitted_events: [0; crate::abi::MAX_LOGS],
                contract_storage_update_requests: [crate::abi::empty_contract_storage_update_request(); crate::abi::CONTRACT_STORAGE_UPDATE_REQUESTS_LENGTH],
                contract_storage_read: [crate::abi::empty_contract_storage_read(); crate::abi::CONTRACT_STORAGE_READS_LENGTH],
                public_call_stack: [0; crate::abi::MAX_PUBLIC_CALL_STACK],
                new_l2_to_l1_msgs:[0; crate::abi::MAX_L1_MSG_STACK],
                historic_public_data_tree_root: 0,
                prover_address: 0,
            },
        };
        constrain contract_address == item.contract_address;
        constrain function_selector == item.function_data.function_selector;
        for i in 0..crate::abi::MAX_ARGS {
            constrain args[i] == item.public_inputs.args[i];
        }

        // TODO: Do we need to constrain the returned call_context here?

        context.public_call_stack = context.public_call_stack.push(item.hash());

        (item, context)
    }

    fn hash(self) -> Field {
        dep::std::hash::pedersen([
            // TODO hash_index
            self.contract_address,
            self.function_data.hash(),
            self.public_inputs.hash(),
        ])[0]
    }
}