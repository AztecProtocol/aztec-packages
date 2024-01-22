use crate::traits::Empty;
use crate::address::AztecAddress;
use crate::abis::function_selector::FunctionSelector;
use crate::hash::pedersen_hash;
use crate::constants::GENERATOR_INDEX__FEE_VARIABLES;
use crate::traits::Hash;

struct FeeVariables {
    fee_preparation_address : AztecAddress,
    fee_preparation_selector : FunctionSelector,
    fee_distribution_address : AztecAddress,
    fee_distribution_selector : FunctionSelector,
}

impl FeeVariables {
    fn serialize(self) -> [Field; 4] {
        [
            self.fee_preparation_address.to_field(),
            self.fee_preparation_selector.to_field(),
            self.fee_distribution_address.to_field(),
            self.fee_distribution_selector.to_field()
        ]
    }
}

impl Hash for FeeVariables {
    fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__FEE_VARIABLES)
    }
}

impl Empty for FeeVariables {
    fn empty() -> Self {
        FeeVariables {
            fee_preparation_address : AztecAddress::empty(),
            fee_preparation_selector : FunctionSelector::zero(),
            fee_distribution_address : AztecAddress::empty(),
            fee_distribution_selector : FunctionSelector::zero(),
        }
    }
}
