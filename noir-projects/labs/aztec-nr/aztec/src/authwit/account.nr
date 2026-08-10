use crate::context::PrivateContext;

use crate::protocol::{hash::poseidon2_hash_with_separator, traits::Hash};

use crate::authwit::auth::{compute_authwit_message_hash, IS_VALID_SELECTOR};
use crate::authwit::entrypoint::app::AppPayload;

/// Domain separator for transaction nullifiers
///
/// Used to produce cancellable (replaceable) transactions.
pub(crate) global DOM_SEP__TX_NULLIFIER: u32 = 1025801951;

/// Domain separator for the account entrypoint payload authorization message.
///
/// Binds the fee-payment selector and cancellation flag alongside the app payload so that the account authorizes
/// them together.
pub(crate) global DOM_SEP__ENTRYPOINT_PAYLOAD: u32 = 3045079954;

/// Computes the inner hash the account authorizes when invoked through its entrypoint.
///
/// Binds the app payload together with the fee-payment selector and cancellation flag. Both drive fee-payer and
/// cancellation side effects, so authorizing the app payload alone would let a party holding the witness switch the
/// fee-payment mode or cancellation flag while keeping the account's approval valid. The gas settings are not yet
/// bound: doing so requires the self-paid-deploy flow to build this witness with the settings resolved during send
/// preparation.
fn compute_entrypoint_payload_hash(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) -> Field {
    poseidon2_hash_with_separator(
        [app_payload.hash(), fee_payment_method as Field, cancellable as Field],
        DOM_SEP__ENTRYPOINT_PAYLOAD,
    )
}

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
//
//
// https://github.com/AztecProtocol/aztec-packages/blob/next/yarn-project/entrypoints/src/account_entrypoint.ts
pub struct AccountFeePaymentMethodOptionsEnum {
    pub EXTERNAL: u8,
    pub PREEXISTING_FEE_JUICE: u8,
    pub FEE_JUICE_WITH_CLAIM: u8,
}

pub global AccountFeePaymentMethodOptions: AccountFeePaymentMethodOptionsEnum =
    AccountFeePaymentMethodOptionsEnum { EXTERNAL: 0, PREEXISTING_FEE_JUICE: 1, FEE_JUICE_WITH_CLAIM: 2 };

/// An implementation of the Account Action struct for the private context.
///
/// Implements logic to verify authorization and execute payloads.
impl AccountActions<&mut PrivateContext> {

    /// Verifies that the entrypoint payload is authorized and executes the `app_payload`.
    ///
    /// The authorized message binds the app payload together with `fee_payment_method` and `cancellable`, so the
    /// account's approval covers the fee-payer and cancellation side effects rather than the call list alone.
    ///
    /// @param app_payload The payload that contains the calls to be executed in the app phase.
    ///
    /// @param fee_payment_method The mechanism via which the account contract will pay for the transaction:
    /// - EXTERNAL (0): Signals that some other contract is in charge of paying the fee, nothing needs to be done.
    /// - PREEXISTING_FEE_JUICE (1): Makes the account contract publicly pay for the transaction with its own FeeJuice
    /// balance, which it must already have prior to this transaction. The contract will set itself as the fee payer
    /// and end the setup phase.
    /// - FEE_JUICE_WITH_CLAIM (2): Makes the account contract publicly pay for the transaction with its own FeeJuice
    /// balance which is being claimed in the same transaction. The contract will set itself as the fee payer but not
    /// end setup phase - this is done by the FeeJuice contract after enqueuing a public call, which unlike most public
    /// calls is whitelisted to be executable during setup.
    ///
    /// @param cancellable Controls whether to emit app_payload.tx_nonce as a nullifier, allowing a subsequent
    /// transaction to be sent with a higher priority fee. This can be used to cancel the first transaction sent,
    /// assuming it hasn't been mined yet.
    ///
    pub fn entrypoint(self, app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
        let valid_fn = self.is_valid_impl;

        let inner_hash = compute_entrypoint_payload_hash(app_payload, fee_payment_method, cancellable);
        let message_hash = compute_authwit_message_hash(
            self.context.this_address(),
            self.context.chain_id(),
            self.context.version(),
            inner_hash,
        );
        assert(valid_fn(self.context, message_hash));

        if fee_payment_method == AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE {
            self.context.set_as_fee_payer();
            self.context.end_setup();
        }
        if fee_payment_method == AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM {
            self.context.set_as_fee_payer();
        }
        app_payload.execute_calls(self.context);

        if cancellable {
            let tx_nullifier = poseidon2_hash_with_separator([app_payload.tx_nonce], DOM_SEP__TX_NULLIFIER);
            self.context.push_nullifier_unsafe(tx_nullifier);
        }
    }

    /// Verifies that the `msg_sender` is authorized to consume `inner_hash` by the account.
    ///
    /// Computes the `message_hash` using the `msg_sender`, `chain_id`, `version` and `inner_hash`. Then executes the
    /// `is_valid_impl` function to verify that the message is authorized.
    ///
    /// Will revert if the message is not authorized.
    ///
    /// @param inner_hash The hash of the message that the `msg_sender` is trying to consume.
    pub fn verify_private_authwit(self, inner_hash: Field) -> Field {
        // The `inner_hash` is "siloed" with the `msg_sender` to ensure that only it can consume the message. This
        // ensures that contracts cannot consume messages that are not intended for them.
        let message_hash = compute_authwit_message_hash(
            self.context.maybe_msg_sender().unwrap(),
            self.context.chain_id(),
            self.context.version(),
            inner_hash,
        );
        let valid_fn = self.is_valid_impl;
        assert(valid_fn(self.context, message_hash), "Message not authorized by account");
        IS_VALID_SELECTOR
    }
}
