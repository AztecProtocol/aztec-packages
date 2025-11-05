use super::TestBuilder;

#[test(should_fail_with = "Wrong leaf slot for fee payer balance")]
unconstrained fn hint_to_incorrect_public_data_leaf() {
    let mut builder = TestBuilder::new();

    // Point to another public data preimage.
    builder.fee_payer_preimage_index += 1;
    builder.build_hints_for_fee_payer_balance();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Not enough balance for fee payer to pay for transaction")]
unconstrained fn insufficient_balance_to_pay_fee() {
    let mut builder = TestBuilder::new();

    let tx_fee = builder.get_transaction_fee();

    // Set the fee payer's balance to be less than the transaction fee.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].value = tx_fee - 1;
    builder.build_public_data_tree(0);

    builder.execute_and_fail();
}

#[test]
unconstrained fn balance_equal_transaction_fee() {
    let mut builder = TestBuilder::new();

    let tx_fee = builder.get_transaction_fee();

    // Set the fee payer's balance to be equal to the transaction fee.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].value = tx_fee;
    builder.build_public_data_tree(0);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.accumulated_fees, tx_fee);
}

#[test(should_fail_with = "Membership check failed: public data leaf preimage does not exist in tree")]
unconstrained fn incorrect_fee_payer_balance_leaf_preimage() {
    let mut builder = TestBuilder::new();

    // Tweak the value of the preimage without updating it to the tree.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].value += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: public data leaf preimage does not exist in tree")]
unconstrained fn incorrect_fee_payer_pre_existing_leaf_index() {
    let mut builder = TestBuilder::new();

    // Tweak the value of the leaf index.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].slot += 1;

    builder.execute_and_fail();
}
