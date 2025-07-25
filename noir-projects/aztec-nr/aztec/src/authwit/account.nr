use crate::context::PrivateContext;

use dep::protocol_types::{
    constants::{GENERATOR_INDEX__COMBINED_PAYLOAD, GENERATOR_INDEX__TX_NULLIFIER},
    hash::poseidon2_hash_with_separator,
    traits::Hash,
};

use crate::authwit::auth::{compute_authwit_message_hash, IS_VALID_SELECTOR};
use crate::authwit::entrypoint::{app::AppPayload, fee::FeePayload};

pub struct AccountActions<Context> {
    context: Context,
    is_valid_impl: fn(&mut PrivateContext, Field) -> bool,
}

impl<Context> AccountActions<Context> {
    pub fn init(context: Context, is_valid_impl: fn(&mut PrivateContext, Field) -> bool) -> Self {
        AccountActions { context, is_valid_impl }
    }
}

/**
 * An implementation of the Account Action struct for the private context.
 *
 * Implements logic to verify authorization and execute payloads.
 */
impl AccountActions<&mut PrivateContext> {

    /**
     * Verifies that the `app_hash` and `fee_hash` are authorized and then executes them.
     *
     * Executes the `fee_payload` and `app_payload` in sequence.
     * Will execute the `fee_payload` as part of the setup, and then enter the app phase.
     *
     * @param app_payload The payload that contains the calls to be executed in the app phase.
     * @param fee_payload The payload that contains the calls to be executed in the setup phase.
     */
    // docs:start:entrypoint
    pub fn entrypoint(self, app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        let valid_fn = self.is_valid_impl;

        let combined_payload_hash = poseidon2_hash_with_separator(
            [app_payload.hash(), fee_payload.hash()],
            GENERATOR_INDEX__COMBINED_PAYLOAD,
        );
        assert(valid_fn(self.context, combined_payload_hash));

        fee_payload.execute_calls(self.context);
        self.context.end_setup();
        app_payload.execute_calls(self.context);
        if cancellable {
            let tx_nullifier = poseidon2_hash_with_separator(
                [app_payload.tx_nonce],
                GENERATOR_INDEX__TX_NULLIFIER,
            );
            self.context.push_nullifier(tx_nullifier);
        }
    }
    // docs:end:entrypoint

    /**
     * Verifies that the `msg_sender` is authorized to consume `inner_hash` by the account.
     *
     * Computes the `message_hash` using the `msg_sender`, `chain_id`, `version` and `inner_hash`.
     * Then executes the `is_valid_impl` function to verify that the message is authorized.
     *
     * Will revert if the message is not authorized.
     *
     * @param inner_hash The hash of the message that the `msg_sender` is trying to consume.
     */
    // docs:start:verify_private_authwit
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
    // docs:end:verify_private_authwit
}
