mod config;
mod utils;

use dep::aztec::macros::aztec;

/// Fee Payment Contract (FPC) allows users to pay for the transaction fee with an arbitrary asset. Supports private
/// and public fee payment flows.
///
/// ***Note:***
/// Accepted asset funds sent by the users to this contract stay in this contract and later on can
/// be pulled by the admin using the `pull_funds` function.
#[aztec]
pub contract FPC {
    use crate::{config::Config, utils::safe_cast_to_u128};
    use dep::uint_note::uint_note::PartialUintNote;
    use aztec::{
        macros::{functions::{initializer, internal, private, public}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::PublicImmutable,
    };
    use token::Token;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
    }

    /// Initializes the contract with an accepted asset (AA) and an admin (address that can pull accumulated AA funds
    /// from this contract).
    #[public]
    #[initializer]
    fn constructor(accepted_asset: AztecAddress, admin: AztecAddress) {
        let config = Config { accepted_asset, admin };
        storage.config.initialize(config);
    }

    /// Pays for the tx fee with msg_sender's private balance of accepted asset (AA). The maximum fee a user is willing
    /// to pay is defined by `max_fee` and is denominated in AA.
    ///
    /// ## Overview
    /// Uses partial notes to implement a refund flow which works as follows:
    /// Setup Phase:
    /// 1. This `fee_entrypoint_private` function:
    ///     - Transfers `max_fee` of AA from private balance of the user to the public balance of this contract,
    ///     - prepares a partial note for the user (which will later on be used to refund the user any unspent fee),
    ///     - sets a public teardown function, where at the end of the tx a partial note will be finalized
    ///       with the refund amount (also denominated in AA),
    ///     - sets itself as the `fee_payer` of the tx; meaning this contract will be responsible for ultimately
    ///       transferring the `tx_fee` -- denominated in fee juice -- to the protocol, during the later "teardown"
    ///       phase of this tx.
    ///
    /// Execution Phase:
    /// 2. Then the private and public functions of the tx get executed.
    ///
    /// Teardown Phase:
    /// 3. By this point, the protocol has computed the `tx_fee` (denominated in "fee juice"). So now we can
    /// execute the "teardown function" which was lined-up during the earlier "setup phase".
    /// Within the teardown function, we:
    ///     - Compute how much of the `max_fee` (denominated in AA) will be refunded back to the user. Since
    ///       the protocol-calculated `tx_fee` is denominated in fee juice, and not in this FPC's AA, an equivalent
    ///       value of AA is computed based on the exchange rate between AA and fee juice,
    ///     - finalize the refund note with a value of `max_fee - tx_fee` for the user.
    ///
    /// Protocol-enshrined fee-payment phase:
    /// 4. The protocol deducts the protocol-calculated `tx_fee` (denominated in fee juice) from the `fee_payer`'s
    /// balance (which in this case is this FPC's balance), which is a special storage slot in a protocol-controlled
    /// "fee juice" contract.
    ///
    /// With this scheme a user has privately paid for the tx fee with an arbitrary AA (e.g. could be a stablecoin),
    /// by paying this FPC. This FPC has in turn paid the protocol-mandated `tx_fee` (denominated in fee juice).
    ///
    /// ***Note:***
    /// This flow allows us to pay for the tx with msg_sender's private balance of AA and hence msg_sender's identity
    /// is not revealed. We do, however, reveal:
    /// - the `max_fee`,
    /// - which FPC has been used to make the payment,
    /// - the asset which was used to make the payment.
    // docs:start:fee_entrypoint_private
    #[private]
    fn fee_entrypoint_private(max_fee: u128, authwit_nonce: Field) {
        let accepted_asset = storage.config.read().accepted_asset;

        let user = context.msg_sender();
        let token = Token::at(accepted_asset);

        // TODO(#10805): Here we should check that `max_fee` converted to fee juice is enough to cover the tx
        // fee juice/mana/gas limit. Currently the fee juice/AA exchange rate is fixed 1:1.

        // Pull the max fee from the user's balance of the accepted asset to the public balance of this contract.
        token.transfer_to_public(user, context.this_address(), max_fee, authwit_nonce).call(
            &mut context,
        );

        // Prepare a partial note for the refund for the user.
        let partial_note = token.prepare_private_balance_increase(user, user).call(&mut context);

        // Set a public teardown function in which the refund will be paid back to the user by finalizing the partial note.
        FPC::at(context.this_address())
            ._complete_refund(accepted_asset, partial_note, max_fee)
            .set_as_teardown(&mut context);

        // Set the FPC as the fee payer of the tx.
        context.set_as_fee_payer();
    }
    // docs:end:fee_entrypoint_private

    /// Executed as a public teardown function and is responsible for completing the refund in the private fee payment
    /// flow.
    // docs:start:complete_refund
    #[public]
    #[internal]
    fn _complete_refund(
        accepted_asset: AztecAddress,
        partial_note: PartialUintNote,
        max_fee: u128,
    ) {
        let tx_fee = safe_cast_to_u128(context.transaction_fee());

        // 1. Check that user funded the fee payer contract with at least the transaction fee.
        // TODO(#10805): Nuke this check once we have a proper max_fee check in the fee_entrypoint_private.
        assert(max_fee >= tx_fee, "max fee not enough to cover tx fee");

        // 2. Compute the refund amount as the difference between funded amount and the tx fee.
        // TODO(#10805): Introduce a real exchange rate
        let refund_amount = max_fee - tx_fee;

        Token::at(accepted_asset).finalize_transfer_to_private(refund_amount, partial_note).call(
            &mut context,
        );
    }
    // docs:end:complete_refund

    /// Pays for the tx fee with msg_sender's public balance of accepted asset (AA). The maximum fee a user is willing
    /// to pay is defined by `max_fee` and is denominated in AA.
    ///
    /// ## Overview
    /// The refund flow works as follows:
    /// Setup phase:
    /// 1. This `fee_entrypoint_public` function:
    ///     - Transfers the `max_fee` from the user's balance of the accepted asset to this contract.
    ///     - Sets itself as the `fee_payer` of the tx.
    ///     - Sets a public teardown function in which the refund will be paid back to the user in public.
    ///
    /// Execution phase:
    /// 2. Then the private and public functions of the tx get executed.
    ///
    /// Teardown phase:
    /// 3. At this point we know the tx fee so we can compute how much of AA the user needs to pay to FPC and how much
    /// of it will be refunded back. We send the refund back to the user in public.
    ///
    /// Protocol-enshrined fee-payment phase:
    /// 4. The protocol deducts the actual fee denominated in fee juice from the FPC's balance.
    #[private]
    fn fee_entrypoint_public(max_fee: u128, authwit_nonce: Field) {
        let config = storage.config.read();

        // We pull the max fee from the user's balance of the accepted asset to this contract.
        // docs:start:public_call
        Token::at(config.accepted_asset)
            .transfer_in_public(context.msg_sender(), context.this_address(), max_fee, authwit_nonce
                )
            .enqueue(&mut context);
        // docs:end:public_call

        context.set_as_fee_payer();
        FPC::at(context.this_address())
            ._pay_refund(context.msg_sender(), max_fee, config.accepted_asset)
            .set_as_teardown(&mut context);
    }

    /// Pays the refund to the `refund_recipient` as part of the public fee payment flow. The refund is the difference
    /// between the `max_fee` and the actual fee. `accepted_asset` is the asset in which the refund is paid.
    /// It's passed as an argument to avoid the need for another read from public storage.
    #[public]
    #[internal]
    fn _pay_refund(refund_recipient: AztecAddress, max_fee: u128, accepted_asset: AztecAddress) {
        let actual_fee = safe_cast_to_u128(context.transaction_fee());

        assert(actual_fee <= max_fee, "Max fee paid to the paymaster does not cover actual fee");
        // TODO(#10805): Introduce a real exchange rate
        let refund = max_fee - actual_fee;

        Token::at(accepted_asset)
            .transfer_in_public(context.this_address(), refund_recipient, refund, 0)
            .call(&mut context);
    }

    /// Pulls all the accepted asset funds from this contract to the `to` address. Only the admin can call
    /// this function.
    #[public]
    fn pull_funds(to: AztecAddress) {
        let config = storage.config.read();

        assert(context.msg_sender() == config.admin, "Only admin can pull funds");

        let token = Token::at(config.accepted_asset);

        // We send the full balance to `to`.
        let balance = token.balance_of_public(context.this_address()).view(&mut context);
        token.transfer_in_public(context.this_address(), to, balance, 0).call(&mut context);
    }

    /// Note: Not marked as view as we need it to be callable as an entrypoint since in some places we need to obtain
    /// this value before we have access to an account contract (kernels do not allow for static entrypoints).
    #[private]
    fn get_accepted_asset() -> AztecAddress {
        storage.config.read().accepted_asset
    }
}
