use dep::protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    traits::{Serialize, ToField},
};
use std::meta::derive;

// 3 * 32 + 3
global FUNCTION_CALL_SIZE_IN_BYTES: u32 = 99;

// @dev: If you change the following struct you have to update:
// - account_entrypoint.ts (specifically `getEntrypointAbi()`)
// - default_multi_call_entrypoint.ts (specifically `getEntrypointAbi()`)
// - function_call.ts
// - encoding.ts
#[derive(Serialize)]
pub struct FunctionCall {
    pub args_hash: Field, /* args_hash is calldata_hash if is_public is true */
    pub function_selector: FunctionSelector,
    pub target_address: AztecAddress,
    pub is_public: bool,
    pub hide_msg_sender: bool, /* This option is only available for public calls. Must be `false` if `is_public = false`. Private calls, by definition, hide msg_sender from the world. */
    pub is_static: bool,
}

impl FunctionCall {
    pub fn to_be_bytes(self) -> [u8; FUNCTION_CALL_SIZE_IN_BYTES] {
        let mut bytes: [u8; FUNCTION_CALL_SIZE_IN_BYTES] = [0; FUNCTION_CALL_SIZE_IN_BYTES];
        let args_hash_bytes: [u8; 32] = self.args_hash.to_be_bytes();
        for i in 0..32 {
            bytes[i] = args_hash_bytes[i];
        }
        let function_selector_bytes: [u8; 32] = self.function_selector.to_field().to_be_bytes();
        for i in 0..32 {
            bytes[i + 32] = function_selector_bytes[i];
        }
        let target_address_bytes: [u8; 32] = self.target_address.to_field().to_be_bytes();
        for i in 0..32 {
            bytes[i + 64] = target_address_bytes[i];
        }
        bytes[96] = self.is_public as u8;
        bytes[97] = self.hide_msg_sender as u8;
        bytes[98] = self.is_static as u8;
        bytes
    }
}
