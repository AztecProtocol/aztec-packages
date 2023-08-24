mod non_native_token_interface;
mod hash;

// Demonstrates how to send a message to a portal contract on L1. We use Uniswap here as it's the most typical example.
contract AcUniswap {
    use dep::aztec::abi;
    use dep::aztec::abi::{PrivateContextInputs, PublicContextInputs};
    use dep::aztec::context::{PrivateContext, PublicContext};
    use dep::aztec::oracle::{
        public_call,
        context::get_portal_address
    };
    use dep::aztec::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec::public_call_stack_item::PublicCallStackItem;
    use dep::aztec::types::point::Point;
    use dep::aztec::constants_gen::GENERATOR_INDEX__L1_TO_L2_MESSAGE_SECRET;

    use crate::non_native_token_interface::NonNativeTokenContractInterface;

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        PrivateContext::new(inputs, 0).finish()
    }

    fn participate_in_swap(
        inputs: PrivateContextInputs,
        input_asset: Field,
        input_amount: Field,
        output_asset: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            input_asset,
            input_amount,
            output_asset,
        ]));
        // Right now. FULL Yolo, no minimums. We are just flying without safety checks.

        // Todo: 
        // - Need to create a note that we can later use to get the funds back
        // - Need to specify some values for the swap, fee and all the jazz

        // This interfaces makes me want to puke. I'm sorry.
        let _void = NonNativeTokenContractInterface::at(input_asset).unshieldTokens(
            &mut context,
            input_amount,
            context.msg_sender(),
            context.this_address(),
        );

        context.return_values.push_array([1]);

        context.finish()
    }


    // What we need to make this nicer:
    // 1. A way to access other (and my own) contract's portal addresses (we need many additional args for no good reason now)
    // 2. don't pass all args manually to initial context
    // 3. Variable length arrays for input arguments (8 not enough)
    // 4. Should have storage for fixed values.
    // 5. account abstraction using its own "custom" constants instead of using shared constants...
    // 6. currently have to manually set the args array for calling other contracts which is inconvenient when using structs etc.

    open fn swap(
        inputs: PublicContextInputs,
        input_asset: Field, 
        input_amount: Field,
        output_asset: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        // Todo:
        // - Match against state values. Need to keep track of what we can actually execute in here.
        // - We will be using a hash of the values since we might not have enough storage otherwise...
        // - Fix matching price 
        let mut context = PublicContext::new(inputs, abi::hash_args([
            input_asset,
            input_amount,
            output_asset,
        ]));

        // We should read the input_amount from storage!

        // We allow anyone to perform the call that insersts money into this contract again.
        // Makes sense since it is multi-user case and we are going from public anyway :shrug:
        let secret_hash = dep::std::hash::pedersen_with_separator([1], GENERATOR_INDEX__L1_TO_L2_MESSAGE_SECRET)[0];
        // Set deadline to be L2 time + 1 day. Notice that this can get messy if blocks are rare,
        // since this deadline could still be in the past for L1.
        let deadline = context.timestamp() + 86400; // in 1 day
        // This value is currently not used, but could be part of the struct such that the contract can more easily 
        // be integrated into other stuff.
        let caller_on_l1 = 0;

        // Hard coded uniswap fee tier to use (eg 3000 for 0.3% fee)
        let uniswap_fee_tier = 3000;

        // Currently accept all slippage in the world.
        let minimum_output_amount = 0;

        // Get portal addresses
        let my_portal = context.this_portal_address();
        let me = context.this_address();
        let input_asset_portal_address = get_portal_address(input_asset);
        let output_asset_portal_address = get_portal_address(output_asset);

        let _success = NonNativeTokenContractInterface::at(input_asset).withdrawPublic(
            context,
            input_amount,
            my_portal,
            my_portal,
        );
        
        let content_hash = crate::hash::compute_swap_content_hash(
           input_asset_portal_address,
           input_amount,
           uniswap_fee_tier,
           output_asset_portal_address,
           minimum_output_amount,
           me,
           secret_hash,
           deadline,
           my_portal,
           caller_on_l1,
        );
        context.message_portal(content_hash);

        context.finish()
    }

    // Then we need something to claim the funds again afterwards.
    open fn finalise_swap(
        inputs: PublicContextInputs,
        input_asset: Field, 
        input_amount: Field,
        output_asset: Field,
        output_amount: Field,
        msg_key: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([
            input_asset,
            input_amount,
            output_asset,
            output_amount,
            msg_key,
        ]));
        
        // TODO:
        // - Check against the values in storage 
        // - Update some value in storage to mark that we have gotten the funds.
        // - Get that dough

        let me = context.this_address();
        let canceller = context.this_portal_address();
        let secret = 1;

        let _success = NonNativeTokenContractInterface::at(output_asset).mintPublic(
            context,
            output_amount,
            me,
            msg_key,
            secret,
            canceller,
        );
        
        context.finish()
    }

}