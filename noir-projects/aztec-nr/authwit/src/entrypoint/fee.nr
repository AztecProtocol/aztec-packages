use crate::entrypoint::function_call::FunctionCall;
use dep::aztec::{
    prelude::PrivateContext,
    protocol_types::{
        constants::GENERATOR_INDEX__FEE_PAYLOAD,
        hash::poseidon2_hash_with_separator,
        traits::{Hash, Serialize},
    },
};

global FEE_PAYLOAD_SIZE_IN_BYTES: u32 = 228;
global MAX_FEE_FUNCTION_CALLS: u32 = 2;

// docs:start:fee-payload-struct
pub struct FeePayload {
    function_calls: [FunctionCall; MAX_FEE_FUNCTION_CALLS],
    nonce: Field,
    is_fee_payer: bool,
}
// docs:end:fee-payload-struct

impl Hash for FeePayload {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__FEE_PAYLOAD)
    }
}

impl FeePayload {
    fn to_be_bytes(self) -> [u8; FEE_PAYLOAD_SIZE_IN_BYTES] {
        let mut bytes: [u8; FEE_PAYLOAD_SIZE_IN_BYTES] = [0; FEE_PAYLOAD_SIZE_IN_BYTES];
        let mut offset = 0;

        for i in 0..MAX_FEE_FUNCTION_CALLS {
            let call_bytes = self.function_calls[i].to_be_bytes();
            for j in 0..call_bytes.len() {
                bytes[offset + j] = call_bytes[j];
            }
            offset += call_bytes.len();
        }

        let nonce_bytes = self.nonce.to_bytes();
        for i in 0..nonce_bytes.len() {
            bytes[offset + i] = nonce_bytes[i];
        }
        offset += nonce_bytes.len();

        bytes[offset] = if self.is_fee_payer { 1 } else { 0 };

        bytes
    }

    fn execute_calls(self, context: &mut PrivateContext) {
        for call in self.function_calls {
            if call.target_address != 0 {
                if call.is_public {
                    context.call_public_function_with_args_hash(
                        call.target_address,
                        call.function_selector,
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
        if self.is_fee_payer {
            // Custom logic to set fee payer
            // context.set_as_fee_payer();
        }
    }
}
