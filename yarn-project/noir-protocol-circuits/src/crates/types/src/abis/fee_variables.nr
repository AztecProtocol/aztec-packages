use crate::traits::Empty;
use crate::address::AztecAddress;
use crate::abis::function_selector::FunctionSelector;
use crate::hash::pedersen_hash;
use crate::constants::GENERATOR_INDEX__FEE_VARIABLES;
use crate::traits::Hash;
use dep::std::cmp::Eq;

struct FeeVariables {
    fee_asset_address: AztecAddress,
    fee_preparation_address : AztecAddress,
    fee_preparation_selector : FunctionSelector,
    fee_distribution_address : AztecAddress,
    fee_distribution_selector : FunctionSelector,
    fee_limit: Field,
}

impl FeeVariables {
    fn serialize(self) -> [Field; 6] {
        [
            self.fee_asset_address.to_field(),
            self.fee_preparation_address.to_field(),
            self.fee_preparation_selector.to_field(),
            self.fee_distribution_address.to_field(),
            self.fee_distribution_selector.to_field(),
            self.fee_limit
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
            fee_asset_address: AztecAddress::empty(),
            fee_preparation_address : AztecAddress::empty(),
            fee_preparation_selector : FunctionSelector::zero(),
            fee_distribution_address : AztecAddress::empty(),
            fee_distribution_selector : FunctionSelector::zero(),
            fee_limit: 0,
        }
    }
}

impl Eq for FeeVariables {
    fn eq(self, other: FeeVariables) -> bool {
        self.fee_asset_address.eq(other.fee_asset_address) &
        self.fee_preparation_address.eq(other.fee_preparation_address) &
        self.fee_preparation_selector.eq(other.fee_preparation_selector) &
        self.fee_distribution_address.eq(other.fee_distribution_address) &
        self.fee_distribution_selector.eq(other.fee_distribution_selector) &
        self.fee_limit.eq(other.fee_limit)
    }
}
