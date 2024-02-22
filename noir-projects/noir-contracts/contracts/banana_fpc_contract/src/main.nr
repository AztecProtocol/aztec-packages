mod interfaces;

contract BananaFPC {
    use dep::aztec::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress};
    use dep::aztec::{
        hash::{compute_secret_hash},
        state_vars::{public_state::PublicState, stable_public_state::StablePublicState, map::Map}
    };

    use dep::aztec::oracle::debug_log::debug_log;

    use dep::safe_math::SafeU120;

    use crate::interfaces::Token;

    struct Storage {
        bananas: StablePublicState<AztecAddress>,
        fee_asset: StablePublicState<AztecAddress>,
    }

    #[aztec(private)]
    fn constructor(bananas: AztecAddress, fee_asset: AztecAddress) {
        let selector = FunctionSelector::from_signature("_initialize((Field),(Field))");
        context.call_public_function(
            context.this_address(),
            selector,
            [bananas.to_field(), fee_asset.to_field()]
        );
    }

    #[aztec(public)]
    internal fn _initialize(bananas: AztecAddress, fee_asset: AztecAddress) {
        storage.bananas.initialize(bananas);
        storage.fee_asset.initialize(fee_asset);
    }

    #[aztec(private)]
    fn pay_with_bananas(amount: Field, nonce: Field) {
        let _res = Token::at(storage.bananas.read_private()).unshield(
            &mut context,
            context.msg_sender(),
            context.this_address(),
            amount,
            nonce
        );

        let _void = context.call_public_function(
            storage.fee_asset.read_private(),
            FunctionSelector::from_signature("pay_fee(Field)"),
            [amount.to_field()]
        );
    }

    #[aztec(private)]
    fn fee_entrypoint_private(amount: Field, asset: AztecAddress, nonce: Field) {
        assert(asset == storage.bananas.read_private());

        let _res = Token::at(asset).unshield(
            &mut context,
            context.msg_sender(),
            context.this_address(),
            amount,
            nonce
        );

        let _void = context.call_public_function(
            storage.fee_asset.read_private(),
            FunctionSelector::from_signature("pay_fee(Field)"),
            [amount.to_field()]
        );
    }

    #[aztec(private)]
    fn fee_entrypoint_public(amount: Field, asset: AztecAddress, nonce: Field) {
        let _void = context.call_private_function(
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
    internal fn prepare_fee(from: AztecAddress, amount: Field, asset: AztecAddress, nonce: Field) {
        let _res = Token::at(asset).transfer_public(context, from, context.this_address(), amount, nonce);
    }

    #[aztec(public)]
    internal fn pay_fee(from: AztecAddress, amount: Field, asset: AztecAddress) {
        let _void = context.call_public_function(
            storage.fee_asset.read_private(),
            FunctionSelector::from_signature("pay_fee(Field)"),
            [amount.to_field()]
        );
        // TODO handle refunds
    }
}
