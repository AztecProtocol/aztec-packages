use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    traits::{Deserialize, Serialize},
};
use std::meta::derive;

// @dev: If you change the following struct you have to update:
// - account_entrypoint.ts (specifically `getEntrypointAbi()`)
// - default_multi_call_entrypoint.ts (specifically `getEntrypointAbi()`)
// - function_call.ts
// - encoding.ts
#[derive(Deserialize, Serialize)]
pub struct FunctionCall {
    // args_hash is calldata_hash if is_public is true
    pub args_hash: Field,
    pub function_selector: FunctionSelector,
    pub target_address: AztecAddress,
    pub is_public: bool,
    // This option is only available for public calls. Must be `false` if `is_public = false`. Private calls, by
    // definition, hide msg_sender from the world.
    pub hide_msg_sender: bool,
    pub is_static: bool,
}
