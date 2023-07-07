// Demonstrates how to send a message to a portal contract on L1. We use Uniswap here as it's the most typical example.
contract ConsumerFinance {
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::PublicContextInputs;
    use dep::aztec::context::Context;
    use dep::aztec::oracle::public_call;
    use dep::aztec::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec::public_call_stack_item::PublicCallStackItem;
    use dep::aztec::types::point::Point;
    fn constructor(
        inputs: PrivateContextInputs
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        Context::new(inputs, 0).finish()
    }

    fn processPayroll(
        inputs: PrivateContextInputs,
        asset: Field, // Asset to distribute
        addresses: [Point;6], // Addresses to distribute to
        amounts: [Field;6], // Amounts to distribute
        owner: Point, // Owner of the asset
        batchTransferFnSelector: Field, // Function selector for transfer
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut initialContext = Context::new(inputs, abi::hash_args([
            asset, 
            addresses[0].x, 
            addresses[1].x, 
            addresses[2].x, 
            addresses[3].x,
            addresses[4].x,
            addresses[5].x,
            addresses[0].y, 
            addresses[1].y, 
            addresses[2].y, 
            addresses[3].y,
            addresses[4].y,
            addresses[5].y,
            amounts[0], 
            amounts[1], 
            amounts[2], 
            amounts[3],
            amounts[4],
            amounts[5],
            owner.x, 
            owner.y, 
            batchTransferFnSelector
        ]));
        let (callStackItem1, mut context1) = PrivateCallStackItem::call(asset, batchTransferFnSelector, [
            owner.x, 
            owner.y,
            amounts[0],
            amounts[1],
            amounts[2],
            addresses[0].x,
            addresses[1].x,
            addresses[2].x,
            addresses[0].y,
            addresses[1].y,
            addresses[2].y,
            true as Field,
        ], initialContext);
        let result1 = callStackItem1.public_inputs.return_values[0];
        context1.return_values = context1.return_values.push(result1);

        let (callStackItem2, mut context2) = PrivateCallStackItem::call(asset, batchTransferFnSelector, [
            owner.x, 
            owner.y,
            amounts[3],
            amounts[4],
            amounts[5],
            addresses[3].x,
            addresses[4].x,
            addresses[5].x,
            addresses[3].y,
            addresses[4].y,
            addresses[5].y,
            false as Field,
        ], context1);
        let result2 = callStackItem2.public_inputs.return_values[0];
        context2.return_values = context2.return_values.push(result2);

        context2.finish()
    }
}