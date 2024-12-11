mod config;

use dep::aztec::macros::aztec;

#[aztec]
contract FPC {
    use crate::config::Config;
    use dep::aztec::{
        macros::{functions::{initializer, internal, private, public}, storage::storage},
        protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress},
        state_vars::PublicImmutable,
    };
    use dep::token::Token;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(accepted_asset: AztecAddress, fee_recipient: AztecAddress) {
        let config = Config { accepted_asset, fee_recipient };
        storage.config.initialize(config);
    }

    /// Pays for the tx fee with msg_sender's private balance of accepted token (AT). The maximum fee a user is willing
    /// to pay is defined by `max_fee` and is denominated in AT.
    ///
    /// ## Overview
    /// Uses partial notes to implement a refund flow which works as follows:
    /// 1. `setup_refund` function subtracts the `max_fee` from user's balance of AT, prepares partial notes
    /// for the `fee_recipient` (to obtain the payment in AT for the fee) and for the msg_sender (for refund note of
    /// the AT) and sets a public teardown function (in which the partial notes will be finalized),
    /// 2. then the private and public functions of a tx get executed,
    /// 3. at this point we know the tx fee so we can compute in the teardown function how much of AT the user needs
    /// to pay to the FPC `fee_recipient` and how much of it will be refunded back. Note that this is computed based on
    /// an exchange rate between the accepted asset and the fee token (called fee juice in some places),
    /// 4. the protocol deducts the actual fee denominated in fee juice from the FPC's balance.
    ///
    /// With this scheme a user has privately paid for the tx fee with an arbitrary AT (e.g. could be a stablecoin).
    ///
    /// ***Note:***
    /// This flow allows us to pay for the tx with msg_sender's private balance of AT and hence msg_sender's identity
    /// is not revealed. We do, however, reveal the `max_fee`.
    #[private]
    fn fee_entrypoint_private(max_fee: Field, nonce: Field) {
        // TODO(PR #8022): Once PublicImmutable performs only 1 merkle proof here, we'll save ~4k gates
        let config = storage.config.read();

        Token::at(config.accepted_asset)
            .setup_refund(config.fee_recipient, context.msg_sender(), max_fee, nonce)
            .call(&mut context);
        context.set_as_fee_payer();
    }

    #[private]
    fn fee_entrypoint_public(max_fee: Field, nonce: Field) {
        // TODO(PR #8022): Once PublicImmutable performs only 1 merkle proof here, we'll save ~4k gates
        let config = storage.config.read();

        // We pull the max fee from the user's balance of the accepted asset to this contract. We cannot enqueue a call
        // to the token directly as we need msg_sender to be revealed.
        // TODO(benesjan): is this ^ true?
        FPC::at(context.this_address())
            .pull_max_fee(
                context.msg_sender(),
                // We pass the following value as arg to avoid the need to read the config again in public.
                config.accepted_asset,
                max_fee,
                nonce,
            )
            .enqueue(&mut context);
        context.set_as_fee_payer();
        // TODO(#6277) for improving interface:
        // FPC::at(context.this_address()).pay_refund(...).set_public_teardown_function(&mut context);
        context.set_public_teardown_function(
            context.this_address(),
            comptime { FunctionSelector::from_signature("pay_refund((Field),Field,(Field))") },
            [context.msg_sender().to_field(), max_fee, config.accepted_asset.to_field()],
        );
    }

    #[public]
    #[internal]
    fn pull_max_fee(
        from: AztecAddress,
        accepted_asset: AztecAddress,
        max_fee: Field,
        nonce: Field,
    ) {
        // docs:start:public_call
        Token::at(accepted_asset)
            .transfer_in_public(from, context.this_address(), max_fee, nonce)
            .call(&mut context);
        // docs:end:public_call
    }

    #[public]
    #[internal]
    fn pay_refund(refund_recipient: AztecAddress, max_fee: Field, accepted_asset: AztecAddress) {
        let actual_fee = context.transaction_fee();
        assert(!max_fee.lt(actual_fee), "Max fee paid to the paymaster does not cover actual fee");
        let refund = max_fee - actual_fee;

        Token::at(accepted_asset)
            .transfer_in_public(context.this_address(), refund_recipient, refund, 0)
            .call(&mut context);
    }
}
