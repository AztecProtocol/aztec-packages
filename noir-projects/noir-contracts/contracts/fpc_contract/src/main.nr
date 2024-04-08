mod interfaces;

contract FPC {
    use dep::aztec::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress, traits::is_empty};
    use dep::aztec::state_vars::SharedImmutable;

    use dep::token::Token;

    #[aztec(storage)]
    struct Storage {
        other_asset: SharedImmutable<AztecAddress>,
        gas_token_address: SharedImmutable<AztecAddress>,
    }

    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor(other_asset: AztecAddress, gas_token_address: AztecAddress) {
        storage.other_asset.initialize(other_asset);
        storage.gas_token_address.initialize(gas_token_address);
    }

    // #[contract_library_function]
    // pub fn test(
    //     context: &mut dep::aztec::context::PrivateContext,
    //     target_contract: dep::aztec::protocol_types::address::AztecAddress,
    //     amount: Field,
    //     an_array: [Field; 4]
    // ) -> pub [Field; 4] {
    //     let mut args: [Field] = [0; 0].as_slice();
    //     let hash_0 = amount.serialize();
    //     args = args.append(hash_0.as_slice());
    //     let hash_1 = an_array.map(|x: Field| x.serialize());
    //     for i in 0..hash_1.len() {
    //         args = args.append(hash_1[i].as_slice());
    //     }
    //     let args_hash = dep::aztec::hash::hash_args(args);
    //     assert(args_hash == dep::aztec::oracle::arguments::pack_arguments(args));
    //     context.call_private_function_with_packed_args(
    //         target_contract,
    //         dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_signature(""),
    //         args_hash,
    //         false,
    //         false
    //     )
    // }

    #[aztec(private)]
    fn fee_entrypoint_private(amount: Field, asset: AztecAddress, secret_hash: Field, nonce: Field) {
        assert(asset == storage.other_asset.read_private());
        let _res = Token::at(asset).unshield(
            &mut context,
            context.msg_sender(),
            context.this_address(),
            amount,
            nonce
        );
        at(context.this_address()).pay_fee_with_shielded_rebate(&mut context, amount, asset, secret_hash);
    }

    #[aztec(private)]
    fn fee_entrypoint_public(amount: Field, asset: AztecAddress, nonce: Field) {
        let _void = context.call_public_function(
            context.this_address(),
            FunctionSelector::from_signature("prepare_fee((Field),Field,(Field),Field)"),
            [context.msg_sender().to_field(), amount, asset.to_field(), nonce]
        );

        let _void = context.call_public_function(
            context.this_address(),
            FunctionSelector::from_signature("pay_fee((Field),Field,(Field))"),
            [context.msg_sender().to_field(), amount, asset.to_field()]
        );
    }

    #[aztec(public)]
    #[aztec(internal)]
    fn prepare_fee(from: AztecAddress, amount: Field, asset: AztecAddress, nonce: Field) {
        let _res = Token::at(asset).transfer_public(&mut context, from, context.this_address(), amount, nonce);
    }

    #[aztec(public)]
    #[aztec(internal)]
    fn pay_fee(refund_address: AztecAddress, amount: Field, asset: AztecAddress) {
        let refund = context.call_public_function(
            storage.gas_token_address.read_public(),
            FunctionSelector::from_signature("pay_fee(Field)"),
            [amount]
        )[0];

        // Just do public refunds for the present
        Token::at(asset).transfer_public(&mut context, context.this_address(), refund_address, refund, 0)
    }

    #[aztec(public)]
    #[aztec(internal)]
    fn pay_fee_with_shielded_rebate(amount: Field, asset: AztecAddress, secret_hash: Field) {
        let refund = context.call_public_function(
            storage.gas_token_address.read_public(),
            FunctionSelector::from_signature("pay_fee(Field)"),
            [amount]
        )[0];

        Token::at(asset).shield(&mut context, context.this_address(), refund, secret_hash, 0);
    }
}
