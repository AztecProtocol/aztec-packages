use crate::traits::{Deserialize, Empty, Serialize};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct GasFees {
    pub fee_per_da_gas: u128,
    pub fee_per_l2_gas: u128,
}

impl GasFees {
    pub fn new(fee_per_da_gas: u128, fee_per_l2_gas: u128) -> Self {
        Self { fee_per_da_gas, fee_per_l2_gas }
    }

    pub fn is_empty(self) -> bool {
        (self.fee_per_da_gas == 0) & (self.fee_per_l2_gas == 0)
    }
}

impl Empty for GasFees {
    fn empty() -> Self {
        GasFees::new(0, 0)
    }
}

mod test {
    use crate::{
        abis::gas_fees::GasFees,
        constants::GAS_FEES_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let item = GasFees::empty();
        // We use the GAS_FEES_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; GAS_FEES_LENGTH] = item.serialize();
        let deserialized = GasFees::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
