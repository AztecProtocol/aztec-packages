use crate::traits::Empty;
use crate::address::AztecAddress;
use crate::abis::function_selector::FunctionSelector;
use crate::hash::pedersen_hash;
use crate::constants::GENERATOR_INDEX__FEE_LIMITS;
use crate::traits::Hash;
use dep::std::cmp::Eq;

struct FeeLimits {
    fee_per_da_gas: Field,
    da_tx_gas_limit: Field,
}

impl FeeLimits {
    fn serialize(self) -> [Field; 2] {
        [
            self.fee_per_da_gas,
            self.da_tx_gas_limit,
        ]
    }
}

impl Hash for FeeLimits {
    fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__FEE_LIMITS)
    }
}

impl Empty for FeeLimits {
    fn empty() -> Self {
        FeeLimits {
            fee_per_da_gas: 0,
            da_tx_gas_limit: 0
        }
    }
}

impl Eq for FeeLimits {
    fn eq(self, other: FeeLimits) -> bool {
        self.fee_per_da_gas.eq(other.fee_per_da_gas) &
        self.da_tx_gas_limit.eq(other.da_tx_gas_limit)
    }
}
