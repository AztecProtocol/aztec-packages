use crate::abi::CallContext;
use crate::abi::MAX_RETURN_VALUES;
use crate::abi::MAX_PUBLIC_CALL_STACK;
use crate::abi::MAX_L1_MSG_STACK;
use crate::abi::MAX_LOGS;
use crate::abi::MAX_ARGS;

use crate::notes::value_note::Note;
use crate::types::vec::BoundedVec;

struct PublicInputs {
    call_context : CallContext,
    args: [Field; MAX_ARGS],
}

struct PublicOutputs {
    return_values: [Field; MAX_RETURN_VALUES],
    logs: [Field; MAX_LOGS],

    public_call_stack: [Field; MAX_PUBLIC_CALL_STACK],
    l1_message_stack: [Field; MAX_L1_MSG_STACK],

    // state_transitions: [Field; STATE_TRANSITIONS_LENGTH],
    // state_reads: [Field; STATE_TRANSITIONS_LENGTH],
}

// Equivalent to Outputs, but uses BoundedVecs instead of arrays to
// make it easier to push onto the ends of the arrays.
// When finished, one can call .finish() to convert back to Outputs
struct IntermediatePublicOutputs {
    return_values : BoundedVec<Field, MAX_RETURN_VALUES>,
    logs : BoundedVec<Field, MAX_LOGS>,

    public_call_stack : BoundedVec<Field, MAX_PUBLIC_CALL_STACK>,
    l1_message_stack : BoundedVec<Field, MAX_L1_MSG_STACK>,
}

impl PublicOutputs {
    // We're a bit tricky here in that we return IntermediateOutputs
    // instead of Outputs to hide this implementation detail from users
    fn new() -> IntermediatePublicOutputs {
        IntermediatePublicOutputs::new()
    }
}

struct FinalPublicOutputs {
    ord_00_msg_sender : Field,
    ord_01_storage_contract_address : Field,
    ord_02_portal_contract_address : Field,

    ord_03_is_delegate_call : Field,
    ord_04_is_static_call : Field,
    ord_05_is_contract_deployment: Field,

    ord_12_args: [Field; MAX_ARGS],
    ord_13_return_values: [Field; MAX_RETURN_VALUES],
    ord_14_logs: [Field; MAX_LOGS],
    
    ord_18_public_call_stack: [Field; MAX_PUBLIC_CALL_STACK],
    ord_19_l1_message_stack: [Field; MAX_L1_MSG_STACK],
}

impl IntermediatePublicOutputs {
    fn new() -> IntermediatePublicOutputs {
        IntermediatePublicOutputs {
            return_values: BoundedVec::new(0),
            logs: BoundedVec::new(0),

            public_call_stack: BoundedVec::new(0),
            l1_message_stack: BoundedVec::new(0),
        }
    }

    // Convert back to Outputs so it can be returned
    fn finish(self, inputs: PublicInputs) -> FinalPublicOutputs {
        FinalPublicOutputs {
            ord_00_msg_sender: inputs.call_context.msg_sender ,
            ord_01_storage_contract_address:  inputs.call_context.storage_contract_address,
            ord_02_portal_contract_address:  inputs.call_context.portal_contract_address,

            ord_03_is_delegate_call : inputs.call_context.is_delegate_call as Field,
            ord_04_is_static_call : inputs.call_context.is_static_call as Field,
            ord_05_is_contract_deployment: inputs.call_context.is_contract_deployment as Field,

            ord_12_args: inputs.args,
            ord_13_return_values: self.return_values.storage,
            ord_14_logs: self.logs.storage,

            ord_18_public_call_stack: self.public_call_stack.storage,
            ord_19_l1_message_stack: self.l1_message_stack.storage,
        }
    }
}
