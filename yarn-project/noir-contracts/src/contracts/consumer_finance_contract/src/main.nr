// Demonstrates how to send a message to a portal contract on L1. We use Uniswap here as it's the most typical example.
contract ConsumerFinance {
    use dep::aztec3::abi;
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::abi::PublicContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::oracle::public_call;
    use dep::aztec3::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec3::public_call_stack_item::PublicCallStackItem;
    use dep::aztec3::types::point::Point;
    use crate::make_args_array;
    fn constructor(
        inputs: PrivateContextInputs
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut initialContext = PrivateFunctionContext::new();
        initialContext.finish(inputs)
    }

    fn processPayroll(
        inputs: PrivateContextInputs,
        asset: Field, // Asset to distribute
        addresses: [Point;3], // Addresses to distribute to
        amounts: [Field;3], // Amounts to distribute
        owner: Point, // Owner of the asset
        batchTransferFnSelector: Field, // Function selector for transfer
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut initialContext = PrivateFunctionContext::new();
        initialContext.args = initialContext.args.push_array([
            asset, 
            addresses[0].x, 
            addresses[0].y, 
            addresses[1].x, 
            addresses[1].y, 
            addresses[2].x, 
            addresses[2].y, 
            amounts[0], 
            amounts[1], 
            amounts[2], 
            owner.x, 
            owner.y, 
            batchTransferFnSelector
        ]);

        // asset.batchTransfer()
        let args = make_args_array([
            owner.x, 
            owner.y,
            amounts[0],
            amounts[1],
            amounts[2],
            addresses[0].x,
            addresses[0].y,
            addresses[1].x,
            addresses[1].y,
            addresses[2].x,
            addresses[2].y,
            true as Field,
        ]);
        let (callStackItem, mut context) = PrivateCallStackItem::call(asset, batchTransferFnSelector, args, initialContext);
        let result = callStackItem.public_inputs.return_values[0];
        context.return_values = context.return_values.push(result);
        context.finish(inputs)
    }
}

use dep::aztec3::abi;
fn make_args_array<N>(args: [Field; N]) -> [Field; abi::MAX_ARGS] {
    let mut result = [0; abi::MAX_ARGS];
    for i in 0..N {
        result[i] = args[i];
    }
    result
}