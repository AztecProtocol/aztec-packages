// docs:start:all
mod config;
mod utils;

use dep::aztec::macros::aztec;

/// Tutorial Fee Payment Contract (FPC)
///
/// This contract allows users to pay transaction fees with an arbitrary token (not Fee Juice).
/// The FPC accepts the user's token and uses its own Fee Juice balance to pay the actual fee.
/// After the transaction, any unused fee is refunded to the user in their original token.
///
/// Key concepts demonstrated:
/// - Private fee payment flow with partial notes for refunds
/// - Public fee payment flow
/// - Transaction phases (setup, execution, teardown)
/// - Fee payer registration and setup phase management
#[aztec]
pub contract TutorialFPC {
    use crate::{config::Config, utils::safe_cast_to_u128};
    use dep::uint_note::PartialUintNote;
    use aztec::{
        macros::{functions::{external, initializer, nophasecheck, only_self}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::PublicImmutable,
    };
    use token::Token;

    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
    }
    // docs:end:storage

    // docs:start:constructor
    /// Initializes the FPC with an accepted asset and admin address.
    #[external("public")]
    #[initializer]
    fn constructor(accepted_asset: AztecAddress, admin: AztecAddress) {
        let config = Config { accepted_asset, admin };
        self.storage.config.initialize(config);
    }
    // docs:end:constructor

    // docs:start:fee_entrypoint_private
    /// Pays for the tx fee with msg_sender's private balance of accepted asset (AA).
    /// The maximum fee a user is willing to pay is defined by `max_fee` and is denominated in AA.
    ///
    /// ## Overview
    /// Uses partial notes to implement a refund flow:
    ///
    /// Setup Phase:
    /// 1. Transfer `max_fee` of AA from user's private balance to this contract's public balance
    /// 2. Prepare a partial note for the user (for refunding unspent fee later)
    /// 3. Set a public teardown function to finalize the refund
    /// 4. Set this contract as the fee payer
    /// 5. End setup phase
    ///
    /// Execution Phase:
    /// The private and public functions of the tx get executed.
    ///
    /// Teardown Phase:
    /// Compute refund amount and finalize the partial note for the user.
    #[external("private")]
    #[nophasecheck]
    fn fee_entrypoint_private(max_fee: u128, authwit_nonce: Field) {
        let accepted_asset = self.storage.config.read().accepted_asset;

        let user = self.msg_sender();
        let token = Token::at(accepted_asset);

        // Pull the max fee from the user's balance of the accepted asset to the public balance of this contract.
        self.call(token.transfer_to_public(user, self.address, max_fee, authwit_nonce));

        // Prepare a partial note for the refund for the user.
        let partial_note = self.call(token.prepare_private_balance_increase(user));

        // Set a public teardown function in which the refund will be paid back to the user by finalizing the partial note.
        self.set_as_teardown(TutorialFPC::at(self.address)._complete_refund(
            accepted_asset,
            partial_note,
            max_fee,
        ));

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase, from now on all side effects are revertible
        self.context.end_setup();
    }
    // docs:end:fee_entrypoint_private

    // docs:start:complete_refund
    /// Executed as a public teardown function and is responsible for completing the refund
    /// in the private fee payment flow.
    #[external("public")]
    #[only_self]
    fn _complete_refund(
        accepted_asset: AztecAddress,
        partial_note: PartialUintNote,
        max_fee: u128,
    ) {
        let tx_fee = safe_cast_to_u128(self.context.transaction_fee());

        // Check that user funded the fee payer contract with at least the transaction fee.
        assert(max_fee >= tx_fee, "max fee not enough to cover tx fee");

        // Compute the refund amount as the difference between funded amount and the tx fee.
        let refund_amount = max_fee - tx_fee;

        Token::at(accepted_asset).finalize_transfer_to_private(refund_amount, partial_note).call(
            self.context,
        );
    }
    // docs:end:complete_refund

    // docs:start:fee_entrypoint_public
    /// Pays for the tx fee with msg_sender's public balance of accepted asset (AA).
    /// The maximum fee a user is willing to pay is defined by `max_fee` and is denominated in AA.
    #[external("private")]
    #[nophasecheck]
    fn fee_entrypoint_public(max_fee: u128, authwit_nonce: Field) {
        let config = self.storage.config.read();

        // We pull the max fee from the user's balance of the accepted asset to this contract.
        self.enqueue(Token::at(config.accepted_asset).transfer_in_public(
            self.msg_sender(),
            self.address,
            max_fee,
            authwit_nonce,
        ));

        self.set_as_teardown(TutorialFPC::at(self.address)._pay_refund(
            self.msg_sender(),
            max_fee,
            config.accepted_asset,
        ));

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase, from now on all side effects are revertible
        self.context.end_setup();
    }
    // docs:end:fee_entrypoint_public

    // docs:start:pay_refund
    /// Pays the refund to the `refund_recipient` as part of the public fee payment flow.
    /// The refund is the difference between the `max_fee` and the actual fee.
    #[external("public")]
    #[only_self]
    fn _pay_refund(refund_recipient: AztecAddress, max_fee: u128, accepted_asset: AztecAddress) {
        let actual_fee = safe_cast_to_u128(self.context.transaction_fee());

        assert(actual_fee <= max_fee, "Max fee paid to the paymaster does not cover actual fee");

        let refund = max_fee - actual_fee;

        self.call(Token::at(accepted_asset).transfer_in_public(
            self.address,
            refund_recipient,
            refund,
            0,
        ));
    }
    // docs:end:pay_refund

    // docs:start:pull_funds
    /// Pulls all the accepted asset funds from this contract to the `to` address.
    /// Only the admin can call this function.
    #[external("public")]
    fn pull_funds(to: AztecAddress) {
        let config = self.storage.config.read();

        assert(self.msg_sender() == config.admin, "Only admin can pull funds");

        let token = Token::at(config.accepted_asset);

        // We send the full balance to `to`.
        let balance = self.view(token.balance_of_public(self.address));
        self.call(token.transfer_in_public(self.address, to, balance, 0));
    }
    // docs:end:pull_funds

    // docs:start:get_accepted_asset
    /// Returns the address of the token this FPC accepts for fee payment.
    /// Note: Not marked as view as we need it to be callable as an entrypoint since in some places
    /// we need to obtain this value before we have access to an account contract.
    #[external("private")]
    fn get_accepted_asset() -> AztecAddress {
        self.storage.config.read().accepted_asset
    }
    // docs:end:get_accepted_asset
}
// docs:end:all
