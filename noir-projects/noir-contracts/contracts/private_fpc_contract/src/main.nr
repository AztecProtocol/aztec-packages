contract PrivateFPC {
    use dep::aztec::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress, traits::is_empty};
    use dep::aztec::state_vars::SharedImmutable;
    use dep::private_token::PrivateToken;
    use dep::aztec::context::gas::GasOpts;

    #[aztec(storage)]
    struct Storage {
        other_asset: SharedImmutable<AztecAddress>,
    }

    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor(other_asset: AztecAddress) {
        storage.other_asset.initialize(other_asset);
    }

    #[aztec(private)]
    fn fund_transaction_privately(amount: Field, asset: AztecAddress, nonce: Field) {
        assert(asset == storage.other_asset.read_private());
        PrivateToken::at(asset).setup_refund(context.this_address(), context.msg_sender(), amount, nonce).call(&mut context);
        context.set_as_fee_payer();
    }
}
