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

    /// Initializes the contract with the accepted asset and the fee recipient (address that receives accepted ).
    #[public]
    #[initializer]
    fn constructor(accepted_asset: AztecAddress, fee_recipient: AztecAddress) {
        let config = Config { accepted_asset, fee_recipient };
        storage.config.initialize(config);
    }

    /// Pays for the tx fee with msg_sender's private balance of accepted asset (AA). The maximum fee a user is willing
    /// to pay is defined by `max_fee` and is denominated in AA.
    ///
    /// ## Overview
    /// Uses partial notes to implement a refund flow which works as follows:
    /// 1. `setup_refund` function subtracts the `max_fee` from user's balance of AA, prepares partial notes
    /// for the `fee_recipient` (to obtain the payment in AA for the fee) and for the msg_sender (for refund note of
    /// the AA) and sets a public teardown function (in which the partial notes will be finalized),
    /// 2. then the private and public functions of a tx get executed,
    /// 3. at this point we know the tx fee so we can compute in the teardown function how much of AA the user needs
    /// to pay to the `fee_recipient` and how much of it will be refunded back. Note that this is computed based on
    /// an exchange rate between AA and fee juice.
    /// 4. the protocol deducts the actual fee denominated in fee juice from the FPC's balance.
    ///
    /// With this scheme a user has privately paid for the tx fee with an arbitrary AA (e.g. could be a stablecoin).
    ///
    /// ***Note:***
    /// This flow allows us to pay for the tx with msg_sender's private balance of AA and hence msg_sender's identity
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

    /// Pays for the tx fee with msg_sender's public balance of accepted asset (AA). The maximum fee a user is willing
    /// to pay is defined by `max_fee` and is denominated in AA.
    ///
    /// ## Overview
    /// The refund flow works as follows:
    /// 1. We pull the `max_fee` from the user's balance of the AA to this contract (requires setting an authwit),
    /// 2. then the private and public functions of a tx get executed,
    /// 3. at this point we know the tx fee so we can compute how much of AA the user needs to pay to
    /// the `fee_recipient` and how much of it will be refunded back. Note that this is computed based on an exchange
    /// rate between AA and fee juice.
    /// 4. the protocol deducts the actual fee denominated in fee juice from the FPC's balance.
    ///
    /// ***Note:***
    /// AA funds sent by the users to this contract stay in this contract and are not transferred
    /// to the `fee_recipient`. In the private flow we needed a separate `fee_recipient` as this contract does not
    /// have keys associated with it. In production we would want to have a method allowing for pulling of these funds
    /// from this contract.
    #[private]
    fn fee_entrypoint_public(max_fee: Field, nonce: Field) {
        // TODO(PR #8022): Once PublicImmutable performs only 1 merkle proof here, we'll save ~4k gates
        let config = storage.config.read();

        // We pull the max fee from the user's balance of the accepted asset to this contract.
        // docs:start:public_call
        Token::at(config.accepted_asset)
            .transfer_in_public(context.msg_sender(), context.this_address(), max_fee, nonce)
            .enqueue(&mut context);
        // docs:end:public_call

        context.set_as_fee_payer();
        // TODO(#6277) for improving interface:
        // FPC::at(context.this_address()).pay_refund(...).set_public_teardown_function(&mut context);
        context.set_public_teardown_function(
            context.this_address(),
            comptime { FunctionSelector::from_signature("pay_refund((Field),Field,(Field))") },
            [context.msg_sender().to_field(), max_fee, config.accepted_asset.to_field()],
        );
    }

    /// Pays the refund to the `refund_recipient`. The refund is the difference between the `max_fee` and
    /// the actual fee. `accepted_asset` is the asset in which the refund is paid. It's passed as an argument
    /// to avoid the need for another read from public storage.
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
