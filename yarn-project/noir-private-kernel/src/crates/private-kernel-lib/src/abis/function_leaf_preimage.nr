use crate::abis::function_selector::FunctionSelector;
use dep::aztec::constants_gen;

struct FunctionLeafPreimage {
    selector : FunctionSelector,
    is_internal : bool,
    is_private : bool,
    vk_hash : Field,
    acir_hash : Field
}

impl FunctionLeafPreimage {
    fn hash(self) -> Field {
        let _hash_index = constants_gen::GENERATOR_INDEX__FUNCTION_LEAF;
        0
    }
}
