use crate::abis::function_selector::FunctionSelector;
use crate::constants::DOM_SEP__FUNCTION_LEAF;
use crate::hash::poseidon2_hash_with_separator;
use crate::traits::{Hash, ToField};

pub struct ContractClassFunctionLeafPreimage {
    pub selector: FunctionSelector,
    pub vk_hash: Field,
}

impl Hash for ContractClassFunctionLeafPreimage {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(
            [self.selector.to_field(), self.vk_hash],
            DOM_SEP__FUNCTION_LEAF,
        )
    }
}
