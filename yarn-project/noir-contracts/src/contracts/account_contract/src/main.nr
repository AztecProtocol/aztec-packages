contract Account {
    mod entrypoint;
    use entrypoint::EntrypointPayload;

    use dep::aztec3::abi;
    use dep::aztec3::abi::Inputs;
    use dep::aztec3::abi::CallContext;
    use dep::aztec3::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec3::public_call_stack_item::PublicCallStackItem;
    use dep::aztec3::context::PrivateFunctionContext;

    fn entrypoint(
        inputs: pub Inputs,
        payload: pub EntrypointPayload,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        let mut context = PrivateFunctionContext::new();

        // Since the payload exceeds MAX_ARGS, we only push its hash
        // TODO: Does the kernel circuit need to validate that this hash matches?
        //
        // See https://hackmd.io/LpoQhtx-QDeIbv8xtAiEcA#Signing-Key:
        // Q: TxRequest is larger than args[]. Do we need to allow bigger input args size for this particular function? Or not sending the entire TxRequest to the entry point?
        // A: We need every Noir Contract function to support unpacked_args: a private input which can be be any size, but which MUST hash to equal one of the args. That way, the unpacked_args can be a deserialisation of the TxRequest (an array of Fields), and there can be a single arg which is the hash of that data.
        context.args = context.args.push(payload.hash());

        for i in 0..entrypoint::ACCOUNT_MAX_PRIVATE_CALLS {
            let target_address = payload.flattened_targets[i];
            if target_address != 0 {
                let function_selector = payload.flattened_selectors[i];
                let mut args = [0; abi::MAX_ARGS];
                for j in 0..abi::MAX_ARGS {
                    args[j] = payload.flattened_args[i * abi::MAX_ARGS + j];
                }
                let (_callStackItem, _context) = PrivateCallStackItem::call(target_address, function_selector, args, context);
            }
        }

        for i in entrypoint::ACCOUNT_MAX_PRIVATE_CALLS..entrypoint::ACCOUNT_MAX_CALLS {
            let target_address = payload.flattened_targets[i];
            if target_address != 0 {
                let function_selector = payload.flattened_selectors[i];
                let mut args = [0; abi::MAX_ARGS];
                for j in 0..abi::MAX_ARGS {
                    args[j] = payload.flattened_args[i * abi::MAX_ARGS + j];
                }
                let (_callStackItem, _context) = PublicCallStackItem::call(target_address, function_selector, args, context);
            }
        }

        context.finish(inputs)
    }

    fn constructor(
        inputs: pub Inputs,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        PrivateFunctionContext::new().finish(inputs)
    }
}
