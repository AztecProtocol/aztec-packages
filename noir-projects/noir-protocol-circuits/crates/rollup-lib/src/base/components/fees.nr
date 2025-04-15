use dep::types::{
    address::AztecAddress, constants::FEE_JUICE_ADDRESS, data::hash::compute_public_data_tree_index,
    storage::map::derive_storage_slot_in_map,
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
