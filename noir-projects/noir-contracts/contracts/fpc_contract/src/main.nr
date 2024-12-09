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
    fn constructor(asset: AztecAddress, admin: AztecAddress) {
        let settings = Settings { asset, admin };
        storage.settings.initialize(settings);
    }

    /// Pays for the tx fee with msg_sender's private balance.
    ///
    /// ## Overview
    /// Uses partial notes to implement a refund flow which works as follows:
    /// 1. `setup_refund` function subtracts the funded `max_amount` from user's balance, prepares partial notes for
    /// the FPC admin (to obtain the payment for the fee) and for the msg_sender (for refund note) and sets a public
    /// teardown function (in which the partial notes will be finalized),
    /// 2. then user's private and public functions get executed,
    /// 3. at this point we now the gas/"fee juice" `max_amount` consumed so the public teardown function is executed,
    /// which finalizes the partial notes.
    ///
    /// ***Note:***
    /// This flow allows us to pay for the tx with msg_sender's private balance and hence msg_sender's identity is not
    /// revealed. We do, however, reveal the `max_amount`.
    #[private]
    fn fee_entrypoint_private(max_amount: Field, nonce: Field) {
        // TODO(PR #8022): Once PublicImmutable performs only 1 merkle proof here, we'll save ~4k gates
        let settings = storage.settings.read();

        Token::at(settings.asset).setup_refund(settings.admin, context.msg_sender(), max_amount, nonce).call(
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
