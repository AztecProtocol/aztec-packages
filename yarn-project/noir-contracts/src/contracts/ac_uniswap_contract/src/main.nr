mod non_native_token_interface;
mod hash;
mod storage;

// TODO:
// - Add events
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

    use dep::safe_math::SafeU120;
    use crate::non_native_token_interface::NonNativeTokenContractInterface;
    use crate::storage::{Storage, Swap, SwapClaimNote};

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        PrivateContext::new(inputs, 0).finish()
    }

    fn participate_in_swap(
        inputs: PrivateContextInputs,
        input_asset: Field,
        input_amount: Field,
        output_asset: Field,
        secret: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            input_asset,
            input_amount,
            output_asset,
            secret,
        ]));
        // Right now. FULL Yolo, no minimums. We are just flying without safety checks.

        // Todo: 
        // - Need to specify some values for the swap, fee and all the jazz

        let _void = NonNativeTokenContractInterface::at(input_asset).unshieldTokens(
            &mut context,
            input_amount,
            context.msg_sender(),
            context.this_address(),
        );

        let secret_hash = dep::std::hash::pedersen_with_separator([secret], GENERATOR_INDEX__L1_TO_L2_MESSAGE_SECRET)[0];

        let _void2 = context.call_public_function(
            context.this_address(),
            0xc196dec5,
            [input_asset, input_amount, output_asset, secret_hash],
        );

        context.return_values.push_array([1]);
        context.finish()
    }

    // uint256(keccak256("_participate_in_swap(field,field,field,field)")) >> 224 -> 0xc196dec5
    open internal fn _participate_in_swap(
        inputs: PublicContextInputs,
        input_asset: Field,
        input_amount: Field,
        output_asset: Field,
        secret_hash: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([
            input_asset,
            input_amount,
            output_asset,
            secret_hash,
        ]));

        let storage = Storage::init();

        let mut count = storage.swap_count.at(input_asset).at(output_asset).read();
        let mut swap = storage.swaps.at(input_asset).at(output_asset).at(count).read();

        if !swap.is_pending {
            count = count + 1;
            storage.swap_count.at(input_asset).at(output_asset).write(count);
            swap = Swap { input_amount: 0, output_amount: 0, is_pending: true };
        }

        swap.input_amount = swap.input_amount + input_amount;
        storage.swaps.at(input_asset).at(output_asset).at(count).write(swap);

         let swap_claim_note = SwapClaimNote {
            input_asset,
            input_amount,
            output_asset,
            index: count,
            secret_hash,
        };

        let note_hash = swap_claim_note.compute_note_hash();
        assert(storage.swap_notes.at(note_hash).read() == 0);
        storage.swap_notes.at(note_hash).write(1);

        context.finish()
    }

    open fn swap(
        inputs: PublicContextInputs,
        input_asset: Field, 
        output_asset: Field,
        index: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        // Todo:
        // - Fix matching price 
        let mut context = PublicContext::new(inputs, abi::hash_args([
            input_asset,
            output_asset,
            index,
        ]));

        let storage = Storage::init();
        let mut swap = storage.swaps.at(input_asset).at(output_asset).at(index).read();
        assert(swap.is_pending);
        swap.is_pending = false;
        storage.swaps.at(input_asset).at(output_asset).at(index).write(swap);

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
            swap.input_amount,
            my_portal,
            my_portal,
        );
        
        let content_hash = crate::hash::compute_swap_content_hash(
           input_asset_portal_address,
           swap.input_amount,
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
        output_asset: Field,
        index: Field,
        output_amount: Field,
        msg_key: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([
            input_asset,
            output_asset,
            index,
            output_amount,
            msg_key,
        ]));

        let storage = Storage::init();
        let mut swap = storage.swaps.at(input_asset).at(output_asset).at(index).read();

        assert(!swap.is_pending);
        assert(swap.output_amount == 0);

        swap.output_amount = output_amount;
        storage.swaps.at(input_asset).at(output_asset).at(index).write(swap);

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

    // Note that this can be called by anyone! 
    // The user will still need to `redeemShield` himself.
    open fn claim(
        inputs: PublicContextInputs,
        input_asset: Field,
        input_amount: Field,
        output_asset: Field,
        index: Field,
        secret_hash: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([
            input_asset,
            input_amount,
            output_asset,
            index,
            secret_hash,
        ]));
        let storage = Storage::init();

        let swap_claim_note = SwapClaimNote {
            input_asset,
            input_amount,
            output_asset,
            index,
            secret_hash,
        };

        let note_hash = swap_claim_note.compute_note_hash();

        assert(storage.swap_notes.at(note_hash).read() == 1);
        storage.swap_notes.at(note_hash).write(0);

        let swap = storage.swaps.at(input_asset).at(output_asset).at(index).read();

        let total_input = SafeU120 { value: swap.input_amount as u120 };
        let total_output = SafeU120 { value: swap.output_amount as u120 };
        let input_amount = SafeU120 { value: input_amount as u120 };

        // TODO: Compute my share of the output amount. Overflowing currently because of 1e18 precision of both tokens.
        let output_amount = 1;//input_amount.mul_div(total_output, total_input).value;

        let _success = NonNativeTokenContractInterface::at(output_asset).shield(
            context,
            output_amount as Field,
            secret_hash,
        );

        context.finish()
    }

    unconstrained fn get_swap(
        input_asset: Field, 
        output_asset: Field, 
        index: Field
    ) -> Swap {
        let storage = Storage::init();
        storage.swaps.at(input_asset).at(output_asset).at(index).read()
    }

    unconstrained fn note_exists(
        input_asset: Field, 
        input_amount: Field,
        output_asset: Field, 
        index: Field, 
        secret_hash: Field
    ) -> bool {
        let storage = Storage::init();
        let swap_claim_note = SwapClaimNote {
            input_asset,
            input_amount,
            output_asset,
            index,
            secret_hash,
        };

        let note_hash = swap_claim_note.compute_note_hash();
        storage.swap_notes.at(note_hash).read() == 1
    }
}