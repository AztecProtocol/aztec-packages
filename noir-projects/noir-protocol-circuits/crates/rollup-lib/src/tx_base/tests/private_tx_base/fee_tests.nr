use super::TestBuilder;
use types::{
    abis::gas_fees::GasFees, data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    traits::Empty,
};

#[test(should_fail_with = "Wrong leaf slot for fee payer balance")]
fn hint_to_incorrect_public_data_leaf() {
    let mut builder = TestBuilder::new();

    // Point to another public data preimage.
    builder.fee_payer_preimage_index += 1;
    builder.build_hints_for_fee_payer_balance();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Not enough balance for fee payer to pay for transaction")]
fn insufficient_balance_to_pay_fee() {
    let mut builder = TestBuilder::new();

    let tx_fee = builder.get_transaction_fee();

    // Set the fee payer's balance to be less than the transaction fee.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].value = tx_fee - 1;
    builder.build_public_data_tree(0);

    builder.execute_and_fail();
}

#[test]
fn balance_equal_transaction_fee() {
    let mut builder = TestBuilder::new();

    let tx_fee = builder.get_transaction_fee();

    // Set the fee payer's balance to be equal to the transaction fee.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].value = tx_fee;
    builder.build_public_data_tree(0);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.accumulated_fees, tx_fee);
}

#[test]
fn zero_fee_absent_fee_payer_balance_leaf_succeeds() {
    let mut builder = TestBuilder::new();

    builder.constants.global_variables.gas_fees = GasFees::empty();
    builder.private_tail.constants.tx_context.gas_settings.max_fees_per_gas = GasFees::empty();
    builder.private_tail.constants.tx_context.gas_settings.max_priority_fees_per_gas =
        GasFees::empty();

    let fee_leaf_slot =
        builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].slot;

    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].slot =
        fee_leaf_slot + 30;
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].value = 7777;
    builder.build_public_data_tree(0);
    builder.build_hints_for_fee_payer_balance();

    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index] =
        PublicDataTreeLeafPreimage { slot: fee_leaf_slot, value: 0, next_slot: 0, next_index: 0 };

    assert_eq(builder.get_transaction_fee(), 0);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.accumulated_fees, 0);
    assert_eq(pi.end_tree_snapshots.public_data_tree, pi.start_tree_snapshots.public_data_tree);
}

#[test(should_fail_with = "Membership check failed: public data leaf preimage does not exist in tree")]
fn incorrect_fee_payer_balance_leaf_preimage() {
    let mut builder = TestBuilder::new();

    // Tweak the value of the preimage without updating it to the tree.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].value += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: public data leaf preimage does not exist in tree")]
fn incorrect_fee_payer_pre_existing_leaf_index() {
    let mut builder = TestBuilder::new();

    // Tweak the value of the leaf index.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].slot += 1;

    builder.execute_and_fail();
}
