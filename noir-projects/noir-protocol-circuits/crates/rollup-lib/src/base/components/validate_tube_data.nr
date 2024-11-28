use dep::types::abis::gas_fees::GasFees;

pub fn validate_max_fees_per_gas(max_fees_per_gas: GasFees, gas_fees: GasFees) {
    assert(
        !gas_fees.fee_per_da_gas.lt(max_fees_per_gas.fee_per_da_gas),
        "fee_per_da_gas in settings must not be less than the global value",
    );
    assert(
        !gas_fees.fee_per_l2_gas.lt(max_fees_per_gas.fee_per_l2_gas),
        "fee_per_l2_gas in settings must not be less than the global value",
    );
}
