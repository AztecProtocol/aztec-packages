use crate::context::PrivateContext;

use crate::protocol::{constants::DOM_SEP__TX_NULLIFIER, hash::poseidon2_hash_with_separator, traits::Hash};

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

    /// Verifies that the `app_hash` is authorized and executes the `app_payload`.
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
    /// Always emits `app_payload.tx_nonce` as a nullifier. This is the account's replay protection: re-proving the
    /// same payload collides on this nullifier, so the transaction can only be mined once. It also enables
    /// cancellation, since a replacement transaction reusing the same `tx_nonce` (e.g. with a higher priority fee)
    /// collides with the original. `tx_nonce` is part of the signed `AppPayload`, while gas is not, so cancellation
    /// does not require a new signature.
    ///
    /// The init kernel separately injects the protocol nullifier `P = H(tx_request)`, which also prevents replay but
    /// covers the gas settings, so `P` changes when fees change. `H(tx_nonce)` is therefore the only replay-protection
    /// nullifier that survives a fee bump (and hence the only one usable for cancellation), which is why the
    /// entrypoint always emits it.
    ///
    pub fn entrypoint(self, app_payload: AppPayload, fee_payment_method: u8) {
        let valid_fn = self.is_valid_impl;

        let message_hash = compute_authwit_message_hash(
            self.context.this_address(),
            self.context.chain_id(),
            self.context.version(),
            app_payload.hash(),
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

        let tx_nullifier = poseidon2_hash_with_separator([app_payload.tx_nonce], DOM_SEP__TX_NULLIFIER);
        self.context.push_nullifier_unsafe(tx_nullifier);
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
