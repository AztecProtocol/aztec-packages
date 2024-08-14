mod lib;
mod settings;

contract PrivateFPC {
    use dep::aztec::{protocol_types::{address::AztecAddress, hash::poseidon2_hash}, state_vars::SharedImmutable};
    use dep::token_with_refunds::TokenWithRefunds;
    use crate::lib::emit_randomness_as_unencrypted_log;
    use crate::settings::Settings;

    #[aztec(storage)]
    struct Storage {
        settings: SharedImmutable<Settings>,
    }

    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor(other_asset: AztecAddress, admin: AztecAddress) {
        let settings = Settings { other_asset, admin };
        storage.settings.initialize(settings);
    }

    #[aztec(private)]
    fn fund_transaction_privately(amount: Field, asset: AztecAddress, user_randomness: Field) {
        let settings = storage.settings.read_private();

        assert(asset == settings.other_asset);

        // We use different randomness for fee payer to prevent a potential privacy leak (see description
        // of `setup_refund(...)` function in TokenWithRefunds for details.
        let fee_payer_randomness = poseidon2_hash([user_randomness]);
        // We emit fee payer randomness to ensure FPC admin can reconstruct their fee note
        emit_randomness_as_unencrypted_log(&mut context, fee_payer_randomness);

        TokenWithRefunds::at(asset).setup_refund(
            settings.admin,
            context.msg_sender(),
            amount,
            user_randomness,
            fee_payer_randomness
        ).call(&mut context);
        context.set_as_fee_payer();
    }
}
