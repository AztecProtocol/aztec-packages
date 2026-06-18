use crate::{authwit::entrypoint::FunctionCall, context::PrivateContext};
use crate::protocol::{
    constants::DOM_SEP__SIGNATURE_PAYLOAD,
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Hash, Serialize},
};
use std::meta::derive;

global ACCOUNT_MAX_CALLS: u32 = 5;

// @dev: If you change the following struct you have to update:
// - default_entrypoint.ts
// - account_entrypoint.ts (specifically `getEntrypointAbi()`)
// - default_multi_call_entrypoint.ts (specifically `getEntrypointAbi()`)
#[derive(Deserialize, Serialize)]
pub struct AppPayload {
    function_calls: [FunctionCall; ACCOUNT_MAX_CALLS],
    // A per-transaction nonce. The account entrypoint always emits a nullifier derived from it, which provides replay
    // protection and lets a transaction be cancelled by reusing the same nonce.
    pub tx_nonce: Field,
}

impl Hash for AppPayload {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), DOM_SEP__SIGNATURE_PAYLOAD)
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
                        call.hide_msg_sender,
                    );
                } else {
                    assert(
                        !call.hide_msg_sender,
                        "Incompatible flag. `hide_msg_sender = true` is only available for public calls.",
                    );
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
