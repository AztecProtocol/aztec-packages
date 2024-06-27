contract PrivateFPC {
    use dep::aztec::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress, traits::is_empty};
    use dep::aztec::state_vars::SharedImmutable;
    use dep::private_token::PrivateToken;
    use dep::aztec::context::gas::GasOpts;

    #[aztec(storage)]
    struct Storage {
        other_asset: SharedImmutable<AztecAddress>,
        admin_npk_m_hash: SharedImmutable<Field>
    }

    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor(other_asset: AztecAddress, admin_npk_m_hash: Field) {
        storage.other_asset.initialize(other_asset);
        storage.admin_npk_m_hash.initialize(admin_npk_m_hash);
    }

    #[aztec(private)]
    fn fund_transaction_privately(amount: Field, asset: AztecAddress, nonce: Field) {
        assert(asset == storage.other_asset.read_private());
        // convince the FPC we are not cheating
        context.push_new_nullifier(nonce, 0);
        // allow the FPC to reconstruct their fee note
        context.emit_unencrypted_log(nonce);
        PrivateToken::at(asset).setup_refund(
            storage.admin_npk_m_hash.read_private(),
            context.msg_sender(),
            amount,
            nonce
        ).call(&mut context);
        context.set_as_fee_payer();
    }
}
