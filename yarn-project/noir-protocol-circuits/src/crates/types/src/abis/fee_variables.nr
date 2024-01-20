use crate::traits::Empty;
use crate::address::AztecAddress;

struct FeeVariables {
    fee_preparation_address : AztecAddress,
    fee_distribution_address : AztecAddress,
}

impl Empty for FeeVariables {
    fn empty() -> Self {
        FeeVariables {
            fee_preparation_address : AztecAddress::empty(),
            fee_distribution_address : AztecAddress::empty(),
        }
    }
}
