use crate::tests::tail_validators::TestBuilder;
use types::{
    abis::gas::Gas,
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, DA_GAS_PER_FIELD, L2_GAS_PER_CONTRACT_CLASS_LOG,
        L2_GAS_PER_L2_TO_L1_MSG, L2_GAS_PER_NOTE_HASH, L2_GAS_PER_NULLIFIER, L2_GAS_PER_PRIVATE_LOG,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS,
        PUBLIC_DATA_WRITE_LENGTH,
    },
};

/// DA cost of the public data write that the private tx base rollup always performs to update the
/// fee payer's balance.
fn get_fee_payer_public_data_write_gas_used() -> Gas {
    Gas { da_gas: PUBLIC_DATA_WRITE_LENGTH * DA_GAS_PER_FIELD, l2_gas: 0 }
}

/// A minimum (private) tx initialized in the TestBuilder contains a protocol nullifier, which must
/// exist in every tx. Every private-only tx also pays for the fee payer's balance public data
/// write performed in the private tx base rollup.
fn get_minimum_private_tx_gas_used() -> Gas {
    let nullifier_gas_used = Gas { da_gas: DA_GAS_PER_FIELD, l2_gas: L2_GAS_PER_NULLIFIER };
    Gas::private_tx_overhead() + nullifier_gas_used + get_fee_payer_public_data_write_gas_used()
}

#[test]
fn minimum_private_tx() {
    let builder = TestBuilder::new();
    let data = builder.execute();
    assert_eq(data.gas_used, get_minimum_private_tx_gas_used());
}

#[test]
fn with_note_hashes() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(3);

    let da_gas = 3 * DA_GAS_PER_FIELD;
    let l2_gas = 3 * L2_GAS_PER_NOTE_HASH;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_private_tx_gas_used();

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test]
fn with_nullifiers() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(5);

    let da_gas = 5 * DA_GAS_PER_FIELD;
    let l2_gas = 5 * L2_GAS_PER_NULLIFIER;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_private_tx_gas_used();

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test]
fn with_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(3);

    let da_gas = 3 * DA_GAS_PER_FIELD;
    let l2_gas = 3 * L2_GAS_PER_L2_TO_L1_MSG;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_private_tx_gas_used();

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test]
fn with_private_logs() {
    let mut builder = TestBuilder::new();

    // Private logs.
    builder.previous_kernel.append_siloed_private_logs_with_lengths([2, 5, 1, 7]);

    let da_gas = (2 + 5 + 1 + 7 + 4) // +4 for the length field of each private log.
        * DA_GAS_PER_FIELD;
    let l2_gas = 4 * L2_GAS_PER_PRIVATE_LOG;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_private_tx_gas_used();

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test]
fn with_contract_class_logs() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_contract_class_logs_with_lengths([11]);

    let da_gas = (11 + 1) // +1 for the contract address.
        * DA_GAS_PER_FIELD;
    let l2_gas = L2_GAS_PER_CONTRACT_CLASS_LOG;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_private_tx_gas_used();

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test]
fn full_side_effects() {
    let mut builder = TestBuilder::new();

    // Fill the tx with side effects and compute the expected gas used.
    let mut expected_gas_used = Gas::private_tx_overhead();
    // The fee payer balance public data write performed in the private tx base rollup.
    expected_gas_used += get_fee_payer_public_data_write_gas_used();
    // Note hashes.
    builder.previous_kernel.append_siloed_note_hashes(MAX_NOTE_HASHES_PER_TX);
    expected_gas_used += Gas {
        da_gas: MAX_NOTE_HASHES_PER_TX * DA_GAS_PER_FIELD,
        l2_gas: MAX_NOTE_HASHES_PER_TX * L2_GAS_PER_NOTE_HASH,
    };
    // Nullifiers.
    builder.previous_kernel.append_siloed_nullifiers(MAX_NULLIFIERS_PER_TX - 1); // -1 for the pre-added protocol nullifier.
    expected_gas_used += Gas {
        da_gas: MAX_NULLIFIERS_PER_TX * DA_GAS_PER_FIELD,
        l2_gas: MAX_NULLIFIERS_PER_TX * L2_GAS_PER_NULLIFIER,
    };
    // L2 to L1 messages.
    builder.previous_kernel.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX);
    expected_gas_used += Gas {
        da_gas: MAX_L2_TO_L1_MSGS_PER_TX * DA_GAS_PER_FIELD,
        l2_gas: MAX_L2_TO_L1_MSGS_PER_TX * L2_GAS_PER_L2_TO_L1_MSG,
    };
    // Private logs.
    builder.previous_kernel.append_siloed_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(
        MAX_PRIVATE_LOGS_PER_TX,
    );
    expected_gas_used += Gas {
        da_gas: (PRIVATE_LOG_SIZE_IN_FIELDS + 1) // +1 for the length field.
            * MAX_PRIVATE_LOGS_PER_TX
            * DA_GAS_PER_FIELD,
        l2_gas: MAX_PRIVATE_LOGS_PER_TX * L2_GAS_PER_PRIVATE_LOG,
    };
    // Contract class logs.
    builder
        .previous_kernel
        .append_contract_class_logs_with_length::<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>(
            MAX_CONTRACT_CLASS_LOGS_PER_TX,
        );
    expected_gas_used += Gas {
        da_gas: (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1) // +1 for the contract address.
            * MAX_CONTRACT_CLASS_LOGS_PER_TX
            * DA_GAS_PER_FIELD,
        l2_gas: MAX_CONTRACT_CLASS_LOGS_PER_TX * L2_GAS_PER_CONTRACT_CLASS_LOG,
    };

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test(should_fail_with = "incorrect metered gas used")]
fn wrong_da_gas() {
    let builder = TestBuilder::new();
    let mut output = builder.export_output();

    // Tweak the da gas in the output to be a wrong value.
    output.gas_used.da_gas += 1;

    builder.validate_with_output(output);
}

#[test(should_fail_with = "incorrect metered gas used")]
fn wrong_l2_gas() {
    let builder = TestBuilder::new();
    let mut output = builder.export_output();

    // Tweak the l2 gas in the output to be a wrong value.
    output.gas_used.l2_gas += 1;

    builder.validate_with_output(output);
}

#[test(should_fail_with = "The gas used exceeds the gas limits")]
fn gas_used_exceeds_da_limit() {
    let mut builder = TestBuilder::new();
    let mut output = builder.export_output();

    let gas_used = output.gas_used.da_gas;
    // Tweak the da gas limit to be less than the gas used.
    output.constants.tx_context.gas_settings.gas_limits.da_gas = gas_used - 1;
    // Constants must match.
    builder.previous_kernel.tx_context.gas_settings.gas_limits.da_gas = gas_used - 1;

    builder.validate_with_output(output);
}

#[test(should_fail_with = "The gas used exceeds the gas limits")]
fn gas_used_exceeds_l2_limit() {
    let mut builder = TestBuilder::new();
    let mut output = builder.export_output();

    let gas_used = output.gas_used.l2_gas;
    // Tweak the l2 gas limit to be less than the gas used.
    output.constants.tx_context.gas_settings.gas_limits.l2_gas = gas_used - 1;
    // Constants must match.
    builder.previous_kernel.tx_context.gas_settings.gas_limits.l2_gas = gas_used - 1;

    builder.validate_with_output(output);
}
