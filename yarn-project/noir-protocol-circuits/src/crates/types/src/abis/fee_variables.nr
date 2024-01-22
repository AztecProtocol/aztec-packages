use crate::traits::Empty;
use crate::address::AztecAddress;
use crate::abis::function_selector::FunctionSelector;

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
