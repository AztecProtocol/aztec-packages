mod lib;
mod settings;

use dep::aztec::macros::aztec;

#[aztec]
contract FPC {
    use crate::lib::compute_rebate;
    use crate::settings::Settings;
    use dep::aztec::{
        macros::{functions::{initializer, internal, private, public}, storage::storage},
        protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress},
        state_vars::PublicImmutable,
    };
    use dep::token::Token;

    #[storage]
    struct Storage<Context> {
        settings: PublicImmutable<Settings, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(other_asset: AztecAddress, admin: AztecAddress) {
        let settings = Settings { other_asset, admin };
        storage.settings.initialize(settings);
    }

    #[private]
    fn fee_entrypoint_private(amount: Field, asset: AztecAddress, nonce: Field) {
        // TODO(PR #8022): Once PublicImmutable performs only 1 merkle proof here, we'll save ~4k gates
        let settings = storage.settings.read();

        assert(asset == settings.other_asset);

        Token::at(asset).setup_refund(settings.admin, context.msg_sender(), amount, nonce).call(
            &mut context,
        );
        context.set_as_fee_payer();
    }

    #[private]
    fn fee_entrypoint_public(amount: Field, asset: AztecAddress, nonce: Field) {
        FPC::at(context.this_address())
            .prepare_fee(context.msg_sender(), amount, asset, nonce)
            .enqueue(&mut context);
        context.set_as_fee_payer();
        // TODO(#6277) for improving interface:
        // FPC::at(context.this_address()).pay_refund(context.msg_sender(), amount, asset).set_public_teardown_function(&mut context);
        context.set_public_teardown_function(
            context.this_address(),
            comptime { FunctionSelector::from_signature("pay_refund((Field),Field,(Field))") },
            [context.msg_sender().to_field(), amount, asset.to_field()],
        );
    }

    #[public]
    #[internal]
    fn prepare_fee(from: AztecAddress, amount: Field, asset: AztecAddress, nonce: Field) {
        // docs:start:public_call
        Token::at(asset).transfer_in_public(from, context.this_address(), amount, nonce).call(
            &mut context,
        );
        // docs:end:public_call
    }

    #[public]
    #[internal]
    fn pay_refund(refund_address: AztecAddress, amount: Field, asset: AztecAddress) {
        // Just do public refunds for the present
        let refund = compute_rebate(context, amount);
        Token::at(asset).transfer_in_public(context.this_address(), refund_address, refund, 0).call(
            &mut context,
        );
    }
}
