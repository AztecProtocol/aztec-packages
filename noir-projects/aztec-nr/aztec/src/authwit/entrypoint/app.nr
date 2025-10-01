use crate::{authwit::entrypoint::function_call::FunctionCall, context::PrivateContext};
use dep::protocol_types::{
    constants::GENERATOR_INDEX__SIGNATURE_PAYLOAD,
    hash::poseidon2_hash_with_separator,
    traits::{Hash, Serialize},
};
use std::meta::derive;

global ACCOUNT_MAX_CALLS: u32 = 5;

// Note: If you change the following struct you have to update default_entrypoint.ts
#[derive(Serialize)]
pub struct AppPayload {
    function_calls: [FunctionCall; ACCOUNT_MAX_CALLS],
    // A nonce that enables transaction cancellation. When the cancellable flag is enabled, this nonce is used to
    // compute a nullifier that is then emitted. This guarantees that we can cancel the transaction by using the same
    // nonce.
    pub tx_nonce: Field,
}

impl Hash for AppPayload {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__SIGNATURE_PAYLOAD)
    }
}

impl AppPayload {
    // Executes all private and public calls
    pub fn execute_calls(self, context: &mut PrivateContext) {
        for call in self.function_calls {
            if !call.target_address.is_zero() {
                if call.is_public {
                    context.call_public_function_with_calldata_hash(
                        call.target_address,
                        call.args_hash,
                        call.is_static,
                    );
                } else {
                    let _result = context.call_private_function_with_args_hash(
                        call.target_address,
                        call.function_selector,
                        call.args_hash,
                        call.is_static,
                    );
                }
            }
        }
    }
}
