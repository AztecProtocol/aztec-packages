use crate::context::PrivateContext;

use dep::protocol_types::{
    constants::GENERATOR_INDEX__TX_NULLIFIER, hash::poseidon2_hash_with_separator, traits::Hash,
};

use crate::authwit::auth::{compute_authwit_message_hash, IS_VALID_SELECTOR};
use crate::authwit::entrypoint::app::AppPayload;

pub struct AccountActions<Context> {
    context: Context,
    is_valid_impl: fn(&mut PrivateContext, Field) -> bool,
}

impl<Context> AccountActions<Context> {
    pub fn init(context: Context, is_valid_impl: fn(&mut PrivateContext, Field) -> bool) -> Self {
        AccountActions { context, is_valid_impl }
    }
}

// See AccountFeePaymentMethodOptions enum in Aztec.js for docs:
// https://github.com/AztecProtocol/aztec-packages/blob/next/yarn-project/entrypoints/src/account_entrypoint.ts
pub struct AccountFeePaymentMethodOptionsEnum {
    pub EXTERNAL: u8,
    pub PREEXISTING_FEE_JUICE: u8,
    pub FEE_JUICE_WITH_CLAIM: u8,
}

pub global AccountFeePaymentMethodOptions: AccountFeePaymentMethodOptionsEnum = AccountFeePaymentMethodOptionsEnum {
    EXTERNAL: 0,
    PREEXISTING_FEE_JUICE: 1,
    FEE_JUICE_WITH_CLAIM: 2,
};

/**
 * An implementation of the Account Action struct for the private context.
 *
 * Implements logic to verify authorization and execute payloads.
 */
impl AccountActions<&mut PrivateContext> {

    /// Verifies that the `app_hash` is authorized and executes the `app_payload`.
    ///
    /// @param app_payload The payload that contains the calls to be executed in the app phase.
    ///
    /// @param is_fee_payer Allows the account contract to set itself as fee payer, using its FeeJuice balance to pay
    /// the transaction fee
    ///
    /// @param end_setup If paying transactions with fee juice, the account contract itself usually has to signal the end of the setup phase since
    /// no other contract will do it. This is configurable independe    sntly of the previous flag because in the case of using
    /// FeeJuiceWithClaim the account contract is the fee payer, but the end of the setup is handled by the FeeJuice contract.
    ///
    /// @param cancellable Controls whether to emit app_payload.tx_nonce as a nullifier, allowing a subsequent transaction to be
    /// sent with a higher priority fee. This can be used to cancel the first transaction sent, assuming it hasn't been mined yet.
    ///
    // docs:start:entrypoint
    pub fn entrypoint(self, app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
        let valid_fn = self.is_valid_impl;

        assert(valid_fn(self.context, app_payload.hash()));

        if fee_payment_method == AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE {
            self.context.set_as_fee_payer();
            self.context.end_setup();
        }
        if fee_payment_method == AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM {
            self.context.set_as_fee_payer();
        }
        app_payload.execute_calls(self.context);

        if cancellable {
            let tx_nullifier = poseidon2_hash_with_separator(
                [app_payload.tx_nonce],
                GENERATOR_INDEX__TX_NULLIFIER,
            );
            self.context.push_nullifier(tx_nullifier);
        }
    }

    /// Verifies that the `msg_sender` is authorized to consume `inner_hash` by the account.
    ///
    /// Computes the `message_hash` using the `msg_sender`, `chain_id`, `version` and `inner_hash`.
    /// Then executes the `is_valid_impl` function to verify that the message is authorized.
    ///
    /// Will revert if the message is not authorized.
    ///
    /// @param inner_hash The hash of the message that the `msg_sender` is trying to consume.
    pub fn verify_private_authwit(self, inner_hash: Field) -> Field {
        // The `inner_hash` is "siloed" with the `msg_sender` to ensure that only it can
        // consume the message.
        // This ensures that contracts cannot consume messages that are not intended for them.
        let message_hash = compute_authwit_message_hash(
            self.context.msg_sender(),
            self.context.chain_id(),
            self.context.version(),
            inner_hash,
        );
        let valid_fn = self.is_valid_impl;
        assert(valid_fn(self.context, message_hash), "Message not authorized by account");
        IS_VALID_SELECTOR
    }
}
