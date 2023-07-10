// Demonstrates how to send a message to a portal contract on L1. We use Uniswap here as it's the most typical example.
contract MultiTransfer {
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

    fn multiTransfer(
        inputs: PrivateContextInputs,
        asset: Field, // Asset to distribute
        addresses: [Field; 12], // Addresses to distribute to
        amounts: [Field; 12], // Amounts to distribute
        owner: Field, // Owner of the asset
        batch_transfer_selector: Field, // Function selector for transfer
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([
            asset, 
            addresses[0], 
            addresses[1], 
            addresses[2], 
            addresses[3],
            addresses[4],
            addresses[5],
            addresses[6], 
            addresses[7], 
            addresses[8], 
            addresses[9],
            addresses[10],
            addresses[11],
            amounts[0], 
            amounts[1], 
            amounts[2], 
            amounts[3],
            amounts[4],
            amounts[5],
            amounts[6], 
            amounts[7], 
            amounts[8], 
            amounts[9],
            amounts[10],
            amounts[11],
            owner,
            batch_transfer_selector
        ]));

        // First batch transfer call
        let return_values_1 = context.call_private_function(asset, batch_transfer_selector, [
            owner, 
            amounts[0],
            amounts[1],
            amounts[2],
            addresses[0],
            addresses[1],
            addresses[2],
            0 as Field,
            0 as Field,
        ]);
        let result1 = return_values_1[0];
        context.return_values.push(result1);

        // Second batch transfer call
        let return_values_2 = context.call_private_function(asset, batch_transfer_selector, [
            owner, 
            amounts[3],
            amounts[4],
            amounts[5],
            addresses[3],
            addresses[4],
            addresses[5],
            1 as Field,
            1 as Field,
        ]);
        let result2 = return_values_2[0];
        context.return_values.push(result2);

        // Third batch transfer call
        let return_values_3 = context.call_private_function(asset, batch_transfer_selector, [
            owner, 
            amounts[6],
            amounts[7],
            amounts[8],
            addresses[6],
            addresses[7],
            addresses[8],
            2 as Field,
            2 as Field,
        ]);
        let result3 = return_values_3[0];
        context.return_values.push(result3);

        // Fourth batch transfer call
        let return_values_4 = context.call_private_function(asset, batch_transfer_selector, [
            owner, 
            amounts[9],
            amounts[10],
            amounts[11],
            addresses[9],
            addresses[10],
            addresses[11],
            3 as Field,
            3 as Field,
        ]);
        let result4 = return_values_4[0];
        context.return_values.push(result4);

        context.finish()
    }
}