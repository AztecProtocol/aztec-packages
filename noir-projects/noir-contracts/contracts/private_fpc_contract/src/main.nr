mod settings;

use dep::aztec::macros::aztec;

#[aztec]
contract PrivateFPC {
    use dep::aztec::{
        protocol_types::{address::AztecAddress, hash::compute_siloed_nullifier},
        state_vars::SharedImmutable,
        macros::{storage::storage, functions::{private, initializer, public}},
    };
    use token::Token;
    use crate::settings::Settings;

    #[storage]
    struct Storage<Context> {
        settings: SharedImmutable<Settings, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(other_asset: AztecAddress, admin: AztecAddress) {
        let settings = Settings { other_asset, admin };
        storage.settings.initialize(settings);
    }

    #[private]
    fn fund_transaction_privately(amount: Field, asset: AztecAddress) {
        // TODO: Once SharedImmutable performs only 1 merkle proof here, we'll save ~4k gates
        let settings = storage.settings.read_private();

        assert(asset == settings.other_asset);

        Token::at(asset).setup_refund(settings.admin, context.msg_sender(), amount).call(
            &mut context,
        );
        context.set_as_fee_payer();
    }
}
