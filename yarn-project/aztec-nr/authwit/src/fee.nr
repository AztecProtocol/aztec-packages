use dep::aztec::abi;
use dep::aztec::types::vec::BoundedVec;
use dep::aztec::context::PrivateContext;
use dep::aztec::protocol_types::{
  address::AztecAddress,
  constants::GENERATOR_INDEX__FEE_VARIABLES,
  hash::pedersen_hash,
};

use crate::function_call::{FunctionCall, FUNCTION_CALL_SIZE, FUNCTION_CALL_SIZE_IN_BYTES};

global FEE_PAYLOAD_MAX_CALLS: Field = 1;

// FUNCTION_CALL_SIZE * FEE_PAYLOAD_MAX_CALLS + 1
global FEE_PAYLOAD_SIZE: Field = 5;
// FUNCTION_CALL_SIZE_IN_BYTES * FEE_PAYLOAD_MAX_CALLS + 32
global FEE_PAYLOAD_SIZE_IN_BYTES: Field = 129;

// Note: If you change the following struct you have to update default_entrypoint.ts
// docs:start:entrypoint-struct
struct FeePayload {
  function_calls: [FunctionCall; FEE_PAYLOAD_MAX_CALLS],
  nonce: Field,
}
// docs:end:entrypoint-struct

impl FeePayload {
  fn hash(self) -> Field {
    pedersen_hash(
      self.serialize(),
      GENERATOR_INDEX__FEE_VARIABLES
    )
  }

  // Serializes the entrypoint struct
  fn serialize(self) -> [Field; FEE_PAYLOAD_SIZE] {
    let mut fields: BoundedVec<Field, FEE_PAYLOAD_SIZE> = BoundedVec::new(0);
    for call in self.function_calls {
      fields.push_array(call.serialize());
    }
    fields.push(self.nonce);
    fields.storage
  }

  // Serializes the payload as an array of bytes. Useful for hashing with sha256.
  fn to_be_bytes(self) -> [u8; FEE_PAYLOAD_SIZE_IN_BYTES] {
    let mut bytes: [u8; FEE_PAYLOAD_SIZE_IN_BYTES] = [0; FEE_PAYLOAD_SIZE_IN_BYTES];

    for i in 0..FEE_PAYLOAD_MAX_CALLS {
      let item_bytes = self.function_calls[i].to_be_bytes();
      for j in 0..FUNCTION_CALL_SIZE_IN_BYTES {
        bytes[i * FUNCTION_CALL_SIZE_IN_BYTES + j] = item_bytes[j];
      }
    }

    let nonce_bytes = self.nonce.to_be_bytes(32);
    let nonce_offset = FUNCTION_CALL_SIZE_IN_BYTES * FEE_PAYLOAD_MAX_CALLS;
    for j in 0..32 {
      bytes[nonce_offset + j] = nonce_bytes[j];
    }

    bytes
  }

  // Executes all private and public calls
  fn execute_calls(self, context: &mut PrivateContext) {
    for call in self.function_calls {
      if !call.target_address.is_zero() {
        if call.is_public {
          context.call_public_function_with_packed_args(
            call.target_address, call.function_selector, call.args_hash
          );
        } else {
          let _result = context.call_private_function_with_packed_args(
            call.target_address, call.function_selector, call.args_hash
          );
        }
      }
    }
  }
}

