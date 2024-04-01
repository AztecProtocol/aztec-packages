use crate::abis::function_selector::FunctionSelector;
use crate::traits::Hash;

struct ContractClassFunctionLeafPreimage {
    selector : FunctionSelector,
    vk_hash : Field,
}

impl Hash for ContractClassFunctionLeafPreimage {
    fn hash(self) -> Field {
        crate::hash::poseidon_hash([
            self.selector.to_field(),
            self.vk_hash,
        ])
    }
}
