mod config;

use dep::aztec::macros::aztec;

/// Fee Payment Contract (FPC) allows users to pay for the transaction fee with an arbitrary asset. Supports private
/// and public fee payment flows.
///
/// ***Note:***
/// Accepted asset funds sent by the users to this contract stay in this contract and later on can
/// be pulled by the admin using the `pull_funds` function.
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
    /// 1. This `setup_refund` function:
    ///     - Calls the AA token contract, which:
    ///         - subtracts the `max_fee` from the user's balance;
    ///         - prepares a partial note for the user (which will be used to later refund the user any unspent fee);
    ///         - sets a public teardown function (within the same AA token contract), where at the end of the tx 
    ///            a fee (denominated in AA) will be transferred to the FPC in public, and a partial note will be finalized 
    ///            with the refund amount (also denominated in AA).
    ///     - Sets itself as the `fee_payer` of the tx; meaning this contract will be responsible for ultimately 
    ///        transferring the `tx_fee` -- denominated in fee juice -- to the protocol, during the later "teardown" 
    ///        phase of this tx.
    ///
    /// Execution Phase:
    /// 2. Then the private and public functions of the tx get executed.
    ///
    /// Teardown Phase:
    /// 3. By this point, the protocol has computed the `tx_fee` (denominated in "fee juice"). So now we can 
    /// execute the "teardown function" which was lined-up during the earlier "setup phase". 
    /// Within the teardown function, we:
    ///     - compute how much of the `max_fee` (denominated in AA) the user needs to pay to the FPC, 
    ///       and how much of it will be refunded back to the user. Since the protocol-calculated `tx_fee` is
    ///       denominated in fee juice, and not in this FPC's AA, an equivalent value of AA is computed based 
    ///       on an exchange rate between AA and fee juice.
    ///     - finalize the refund note with a value of `max_fee - tx_fee` for the user;
    ///     - send the tx fee to the FPC in public.
    ///
    /// Protocol-enshrined fee-payment phase:
    /// 4. The protocol deducts the protocol-calculated `tx_fee` (denominated in fee juice) from the `fee_payer`'s
    /// balance (which in this case is this FPC's balance), which is a special storage slot in a protocol-controlled 
    /// "fee juice" contract.
    ///
    /// With this scheme a user has privately paid for the tx fee with an arbitrary AA (e.g. could be a stablecoin),
    /// by paying this FPC. This FPC has in turn paid the protocol-mandated `tx_fee` (denominated in fee
    /// juice).
    ///
    /// ***Note:***
    /// This flow allows us to pay for the tx with msg_sender's private balance of AA and hence msg_sender's identity
    /// is not revealed. We do, however, reveal:
    /// - the `max_fee`;
    /// - which FPC has been used to make the payment;
    /// - the asset which was used to make the payment.
    #[private]
    fn fee_entrypoint_private(max_fee: Field, nonce: Field) {
        // TODO(PR #8022): Once PublicImmutable performs only 1 merkle proof here, we'll save ~4k gates
        let config = storage.config.read();

        Token::at(config.accepted_asset).setup_refund(context.msg_sender(), max_fee, nonce).call(
            &mut context,
        );
        context.set_as_fee_payer();
    }

    /// Pays for the tx fee with msg_sender's public balance of accepted asset (AA). The maximum fee a user is willing
    /// to pay is defined by `max_fee` and is denominated in AA.
    ///
    /// ## Overview
    /// The refund flow works as follows:
    /// 1. We pull the `max_fee` from the user's balance of the AA to this contract (requires setting an authwit),
    /// 2. then the private and public functions of a tx get executed,
    /// 3. at this point we know the tx fee so we can compute how much of AA the user needs to pay to FPC and how much
    /// of it will be refunded back. Note that this is computed based on an exchange rate between AA and fee juice.
    /// 4. the protocol deducts the actual fee denominated in fee juice from the FPC's balance.
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

    /// Pulls all the accepted asset funds from this contract to the `to` address. Only the admin can call
    /// this function.
    #[public]
    fn pull_funds(to: AztecAddress) {
        // TODO(PR #8022): Once PublicImmutable performs only 1 merkle proof here, we'll save ~4k gates
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
