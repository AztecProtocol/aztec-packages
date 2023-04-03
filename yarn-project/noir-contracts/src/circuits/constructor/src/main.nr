use dep::abi;

fn main(
    public_inputs: pub abi::PublicInputs,
    ) {
    for i in 0..abi::MAX_RETURN_VALUES {
        constrain public_inputs.return_values[i] == 0;
    }
    for i in 0..abi::MAX_LOGS {
        constrain public_inputs.logs[i] == 0;
    }


    for i in 0..abi::MAX_NEW_COMMITMENTS {
        constrain public_inputs.new_commitments[i] == 0;
    }
    for i in 0..abi::MAX_NEW_NULLIFIERS {
        constrain public_inputs.new_nullifiers[i] == 0;
    }


    for i in 0..abi::MAX_PRIVATE_CALL_STACK {
        constrain public_inputs.private_call_stack[i] == 0;
    }
    for i in 0..abi::MAX_PUBLIC_CALL_STACK {
        constrain public_inputs.public_call_stack[i] == 0;
    }
    for i in 0..abi::MAX_L1_MSG_STACK {
        constrain public_inputs.l1_message_stack[i] == 0;
    }
}
