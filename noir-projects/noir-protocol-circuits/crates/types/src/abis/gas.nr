use crate::{
    abis::{gas_fees::GasFees, log_hash::ScopedLogHash, private_log::PrivateLog},
    constants::{FIXED_DA_GAS, FIXED_L2_GAS, GAS_LENGTH},
    traits::{Deserialize, Empty, Serialize},
    utils::arrays::padded_array_length,
};
use std::ops::{Add, Sub};

pub struct Gas {
    pub da_gas: u32,
    pub l2_gas: u32,
}

impl Gas {
    pub fn new(da_gas: u32, l2_gas: u32) -> Self {
        Self { da_gas, l2_gas }
    }

    pub fn tx_overhead() -> Self {
        Self { da_gas: FIXED_DA_GAS, l2_gas: FIXED_L2_GAS }
    }

    pub fn compute_fee(self, fees: GasFees) -> Field {
        (self.da_gas as Field) * fees.fee_per_da_gas + (self.l2_gas as Field) * fees.fee_per_l2_gas
    }

    pub fn is_empty(self) -> bool {
        (self.da_gas == 0) & (self.l2_gas == 0)
    }

    pub fn within(self, limits: Gas) -> bool {
        (self.da_gas <= limits.da_gas) & (self.l2_gas <= limits.l2_gas)
    }
}

impl Add for Gas {
    fn add(self, other: Gas) -> Self {
        Gas::new(self.da_gas + other.da_gas, self.l2_gas + other.l2_gas)
    }
}

impl Sub for Gas {
    fn sub(self, other: Gas) -> Self {
        Gas::new(self.da_gas - other.da_gas, self.l2_gas - other.l2_gas)
    }
}

impl Serialize<GAS_LENGTH> for Gas {
    fn serialize(self) -> [Field; GAS_LENGTH] {
        [self.da_gas as Field, self.l2_gas as Field]
    }
}

impl Deserialize<GAS_LENGTH> for Gas {
    fn deserialize(serialized: [Field; GAS_LENGTH]) -> Gas {
        Gas::new(serialized[0] as u32, serialized[1] as u32)
    }
}

impl Eq for Gas {
    fn eq(self, other: Gas) -> bool {
        (self.da_gas == other.da_gas) & (self.l2_gas == other.l2_gas)
    }
}

impl Empty for Gas {
    fn empty() -> Self {
        Gas::new(0, 0)
    }
}

/// Gas measuring for logs
// These exist to count the number of fields which will be broadcast per log.
// Note: public logs are not measured in the kernels, so do not exist here.
fn emitted_private_log_length(log: PrivateLog) -> u32 {
    let length = padded_array_length(log.fields);
    // plus one for prefix
    if length == 0 {
        0
    } else {
        length + 1
    }
}

fn emitted_contract_class_log_length(log: ScopedLogHash) -> u32 {
    // plus one for prefix, one for address
    if log.log_hash.length == 0 {
        0
    } else {
        log.log_hash.length + 2
    }
}

pub fn get_emitted_private_logs_len<let N: u32>(logs: [PrivateLog; N]) -> u32 {
    logs.map(|l| emitted_private_log_length(l)).fold(0, |acc, len| acc + len)
}

pub fn get_emitted_contract_class_logs_len<let N: u32>(logs: [ScopedLogHash; N]) -> u32 {
    logs.map(|l| emitted_contract_class_log_length(l)).fold(0, |acc, len| acc + len)
}

#[test]
fn serialization_of_empty() {
    let item = Gas::empty();
    let serialized = item.serialize();
    let deserialized = Gas::deserialize(serialized);
    assert(item.eq(deserialized));
}
