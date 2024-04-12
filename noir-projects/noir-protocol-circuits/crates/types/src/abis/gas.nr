use crate::{
    abis::function_selector::FunctionSelector, address::{EthAddress, AztecAddress},
    constants::GAS_LENGTH, hash::pedersen_hash, traits::{Deserialize, Hash, Serialize, Empty},
    abis::side_effect::Ordered, utils::reader::Reader
};

struct Gas {
    da_gas: Field,
    l1_gas: Field,
    l2_gas: Field,
}

impl Gas {
    fn new(da_gas: Field, l1_gas: Field, l2_gas: Field) -> Self {
        Self { da_gas, l1_gas, l2_gas }
    }

    fn add(self, other: Gas) -> Self {
        Gas::new(
            self.da_gas + other.da_gas,
            self.l1_gas + other.l1_gas,
            self.l2_gas + other.l2_gas
        )
    }

    fn sub(self, other: Gas) -> Self {
        Gas::new(
            self.da_gas - other.da_gas,
            self.l1_gas - other.l1_gas,
            self.l2_gas - other.l2_gas
        )
    }
}

impl Serialize<GAS_LENGTH> for Gas {
    fn serialize(self) -> [Field; GAS_LENGTH] {
        [self.da_gas, self.l1_gas, self.l2_gas]
    }
}

impl Deserialize<GAS_LENGTH> for Gas {
    fn deserialize(serialized: [Field; GAS_LENGTH]) -> Gas {
        Gas::new(serialized[0], serialized[1], serialized[2])
    }
}

impl Eq for Gas {
    fn eq(self, other : Gas) -> bool {
        (self.da_gas == other.da_gas) & (self.l1_gas == other.l1_gas) & (self.l2_gas == other.l2_gas)
    }
}

impl Empty for Gas {
    fn empty() -> Self {
        Gas::new(0, 0, 0)
    }
}

