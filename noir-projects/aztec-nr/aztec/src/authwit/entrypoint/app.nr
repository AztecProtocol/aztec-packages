use crate::{authwit::entrypoint::function_call::FunctionCall, context::PrivateContext};
use dep::protocol_types::{
    constants::GENERATOR_INDEX__SIGNATURE_PAYLOAD,
    hash::poseidon2_hash_with_separator,
    traits::{Hash, Serialize},
};
use std::meta::derive;

// FUNCTION_CALL_SIZE_IN_BYTES * ACCOUNT_MAX_CALLS + 32
global APP_PAYLOAD_SIZE_IN_BYTES: u32 = 424;

global ACCOUNT_MAX_CALLS: u32 = 4;

// Note: If you change the following struct you have to update default_entrypoint.ts
// docs:start:app-payload-struct
#[derive(Serialize)]
pub struct AppPayload {
    function_calls: [FunctionCall; ACCOUNT_MAX_CALLS],
    // A nonce that enables transaction cancellation. When the cancellable flag is enabled, this nonce is used to
    // compute a nullifier that is then emitted. This guarantees that we can cancel the transaction by using the same
    // nonce.
    pub tx_nonce: Field,
}
// docs:end:app-payload-struct

impl Hash for AppPayload {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__SIGNATURE_PAYLOAD)
    }
}

impl AppPayload {
    // Serializes the payload as an array of bytes. Useful for hashing with sha256.
    fn to_be_bytes(self) -> [u8; APP_PAYLOAD_SIZE_IN_BYTES] {
        let mut bytes: BoundedVec<u8, APP_PAYLOAD_SIZE_IN_BYTES> = BoundedVec::new();

        for i in 0..ACCOUNT_MAX_CALLS {
            bytes.extend_from_array(self.function_calls[i].to_be_bytes());
        }
        bytes.extend_from_array(self.tx_nonce.to_be_bytes::<32>());

        bytes.storage()
    }

    // Executes all private and public calls
    // docs:start:entrypoint-execute-calls
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
    // docs:end:entrypoint-execute-calls
}
