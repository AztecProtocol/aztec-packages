use crate::{authwit::entrypoint::function_call::FunctionCall, context::PrivateContext};
use dep::protocol_types::{
    constants::GENERATOR_INDEX__FEE_PAYLOAD,
    hash::poseidon2_hash_with_separator,
    traits::{Hash, Serialize},
};
use std::meta::derive;

// 2 * 98 (FUNCTION_CALL_SIZE_IN_BYTES) + 32
global FEE_PAYLOAD_SIZE_IN_BYTES: u32 = 228;

global MAX_FEE_FUNCTION_CALLS: u32 = 2;

// docs:start:fee-payload-struct
#[derive(Serialize)]
pub struct FeePayload {
    function_calls: [FunctionCall; MAX_FEE_FUNCTION_CALLS],
    tx_nonce: Field,
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
        let mut bytes: BoundedVec<u8, FEE_PAYLOAD_SIZE_IN_BYTES> = BoundedVec::new();

        for i in 0..MAX_FEE_FUNCTION_CALLS {
            bytes.extend_from_array(self.function_calls[i].to_be_bytes());
        }
        bytes.extend_from_array(self.tx_nonce.to_be_bytes::<32>());
        bytes.push(self.is_fee_payer as u8);

        bytes.storage()
    }

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
        if self.is_fee_payer {
            context.set_as_fee_payer();
        }
    }
}
