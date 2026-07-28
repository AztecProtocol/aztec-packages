use crate::{abis::{gas::Gas, gas_fees::GasFees}, traits::{Deserialize, Empty, Serialize}};

#[derive(Deserialize, Eq, Serialize)]
pub struct GasSettings {
    pub gas_limits: Gas,
    pub teardown_gas_limits: Gas,
    pub max_fees_per_gas: GasFees,
    pub max_priority_fees_per_gas: GasFees,
}

impl GasSettings {
    pub fn new(
        gas_limits: Gas,
        teardown_gas_limits: Gas,
        max_fees_per_gas: GasFees,
        max_priority_fees_per_gas: GasFees,
    ) -> Self {
        Self { gas_limits, teardown_gas_limits, max_fees_per_gas, max_priority_fees_per_gas }
    }
}

impl Empty for GasSettings {
    fn empty() -> Self {
        GasSettings::new(
            Gas::empty(),
            Gas::empty(),
            GasFees::empty(),
            GasFees::empty(),
        )
    }
}

mod test {
    use crate::{
        abis::gas_settings::GasSettings,
        constants::GAS_SETTINGS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let item = GasSettings::empty();
        // We use the GAS_SETTINGS_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; GAS_SETTINGS_LENGTH] = item.serialize();
        let deserialized = GasSettings::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
