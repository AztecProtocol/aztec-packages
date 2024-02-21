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
}
