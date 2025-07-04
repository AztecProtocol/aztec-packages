use crate::{
    abis::gas_settings::GasSettings,
    constants::TX_CONTEXT_LENGTH,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

// docs:start:tx-context
#[derive(Deserialize, Eq, Serialize)]
pub struct TxContext {
    pub chain_id: Field,
    pub version: Field,
    pub gas_settings: GasSettings,
}
// docs:end:tx-context

impl TxContext {
    pub fn new(chain_id: Field, version: Field, gas_settings: GasSettings) -> Self {
        TxContext { chain_id, version, gas_settings }
    }
}

impl Empty for TxContext {
    fn empty() -> Self {
        TxContext { chain_id: 0, version: 0, gas_settings: GasSettings::empty() }
    }
}

#[test]
fn serialization_of_empty() {
    let context = TxContext::empty();
    let serialized = context.serialize();
    let deserialized = TxContext::deserialize(serialized);
    assert(context.eq(deserialized));
}
