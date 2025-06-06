use dep::types::abis::gas_fees::GasFees;

pub fn validate_max_fees_per_gas(max_fees_per_gas: GasFees, gas_fees: GasFees) {
    assert(
        !max_fees_per_gas.fee_per_da_gas.lt(gas_fees.fee_per_da_gas),
        "da gas is higher than the maximum specified by the tx",
    );
    assert(
        !max_fees_per_gas.fee_per_l2_gas.lt(gas_fees.fee_per_l2_gas),
        "l2 gas is higher than the maximum specified by the tx",
    );
}
