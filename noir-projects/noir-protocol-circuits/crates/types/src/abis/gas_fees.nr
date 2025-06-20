use crate::{constants::GAS_FEES_LENGTH, traits::{Deserialize, Empty, Serialize}};

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

impl Serialize<GAS_FEES_LENGTH> for GasFees {
    fn serialize(self) -> [Field; GAS_FEES_LENGTH] {
        [self.fee_per_da_gas as Field, self.fee_per_l2_gas as Field]
    }
}

impl Deserialize<GAS_FEES_LENGTH> for GasFees {
    fn deserialize(serialized: [Field; GAS_FEES_LENGTH]) -> GasFees {
        GasFees::new(serialized[0] as u128, serialized[1] as u128)
    }
}

impl Eq for GasFees {
    fn eq(self, other: GasFees) -> bool {
        (self.fee_per_da_gas == other.fee_per_da_gas)
            & (self.fee_per_l2_gas == other.fee_per_l2_gas)
    }
}

impl Empty for GasFees {
    fn empty() -> Self {
        GasFees::new(0, 0)
    }
}

#[test]
fn serialization_of_empty() {
    let item = GasFees::empty();
    let serialized = item.serialize();
    let deserialized = GasFees::deserialize(serialized);
    assert(item.eq(deserialized));
}
