use types::{
    abis::{gas::Gas, gas_settings::GasSettings},
    constants::MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
};

pub fn clamp_gas_settings_for_avm(
    gas_settings: GasSettings,
    gas_used_by_private: Gas,
) -> GasSettings {
    let gas_limits = clamp_gas_limits_for_avm(gas_settings.gas_limits, gas_used_by_private);
    let teardown_gas_limits =
        clamp_gas_limits_for_avm(gas_settings.teardown_gas_limits, Gas::new(0, 0));
    GasSettings {
        gas_limits,
        teardown_gas_limits,
        max_fees_per_gas: gas_settings.max_fees_per_gas,
        max_priority_fees_per_gas: gas_settings.max_priority_fees_per_gas,
    }
}

fn clamp_gas_limits_for_avm(gas_limits: Gas, gas_used_by_private: Gas) -> Gas {
    Gas {
        da_gas: gas_limits.da_gas,
        l2_gas: std::cmp::min(
            gas_limits.l2_gas,
            gas_used_by_private.l2_gas + MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
        ),
    }
}
