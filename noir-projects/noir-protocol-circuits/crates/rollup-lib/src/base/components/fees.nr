use dep::types::{
    abis::gas_fees::GasFees, address::AztecAddress, constants::FEE_JUICE_ADDRESS,
    data::hash::compute_public_data_tree_index, storage::map::derive_storage_slot_in_map,
};

pub(crate) fn compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer: AztecAddress) -> Field {
    let balances_slot_in_fee_juice_contract = 1;
    let fee_payer_balance_slot_in_fee_juice_contract =
        derive_storage_slot_in_map(balances_slot_in_fee_juice_contract, fee_payer);
    compute_public_data_tree_index(
        FEE_JUICE_ADDRESS,
        fee_payer_balance_slot_in_fee_juice_contract,
    )
}

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
