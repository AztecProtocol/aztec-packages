use crate::{abis::gas_settings::GasSettings, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

// docs:start:tx-context
#[derive(Eq, Deserialize, Serialize)]
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

mod test {
    use crate::{
        abis::{gas_settings::GasSettings, tx_context::TxContext},
        constants::TX_CONTEXT_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let item = TxContext::empty();
        // We use the TX_CONTEXT_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; TX_CONTEXT_LENGTH] = item.serialize();
        let deserialized = TxContext::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
