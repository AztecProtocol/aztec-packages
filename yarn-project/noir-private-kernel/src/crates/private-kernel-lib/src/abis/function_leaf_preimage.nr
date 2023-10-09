use crate::abis::function_selector::FunctionSelector;
use crate::constants;

struct FunctionLeafPreimage {
    selector : FunctionSelector,
    is_internal : bool,
    is_private : bool,
    vk_hash : Field,
    acir_hash : Field
}

impl FunctionLeafPreimage {
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::FUNCTION_LEAF;
        0
    }
}