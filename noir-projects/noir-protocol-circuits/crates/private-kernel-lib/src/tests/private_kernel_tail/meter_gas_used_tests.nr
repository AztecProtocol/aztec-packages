use super::TestBuilder;
use dep::types::{
    abis::gas::Gas,
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, DA_BYTES_PER_FIELD, DA_GAS_PER_BYTE,
        L2_GAS_PER_CONTRACT_CLASS_LOG, L2_GAS_PER_L2_TO_L1_MSG, L2_GAS_PER_NOTE_HASH,
        L2_GAS_PER_NULLIFIER, L2_GAS_PER_PRIVATE_LOG, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS,
    },
};

/// A minimum (private) tx initialized in the TestBuilder contains a protocol nullifier, which must exist in every tx.
fn get_minimum_private_tx_gas_used() -> Gas {
    let nullifier_gas_used =
        Gas { da_gas: DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE, l2_gas: L2_GAS_PER_NULLIFIER };
    Gas::tx_overhead() + nullifier_gas_used
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

    let da_gas = 3 * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = 3 * L2_GAS_PER_NOTE_HASH;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_private_tx_gas_used();

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test]
fn with_nullifiers() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(5);

    let da_gas = 5 * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = 5 * L2_GAS_PER_NULLIFIER;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_private_tx_gas_used();

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test]
fn with_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(3);

    let da_gas = 3 * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
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
        * DA_BYTES_PER_FIELD
        * DA_GAS_PER_BYTE;
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
        * DA_BYTES_PER_FIELD
        * DA_GAS_PER_BYTE;
    let l2_gas = 1 * L2_GAS_PER_CONTRACT_CLASS_LOG;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_private_tx_gas_used();

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}

#[test]
fn full_side_effects() {
    let mut builder = TestBuilder::new();

    // Fill the tx with side effects and compute the expected gas used.
    let mut expected_gas_used = Gas::tx_overhead();
    // Note hashes.
    builder.previous_kernel.append_siloed_note_hashes(MAX_NOTE_HASHES_PER_TX);
    expected_gas_used += Gas {
        da_gas: MAX_NOTE_HASHES_PER_TX * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE,
        l2_gas: MAX_NOTE_HASHES_PER_TX * L2_GAS_PER_NOTE_HASH,
    };
    // Nullifiers.
    builder.previous_kernel.append_siloed_nullifiers(MAX_NULLIFIERS_PER_TX - 1); // -1 for the pre-added protocol nullifier.
    expected_gas_used += Gas {
        da_gas: MAX_NULLIFIERS_PER_TX * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE,
        l2_gas: MAX_NULLIFIERS_PER_TX * L2_GAS_PER_NULLIFIER,
    };
    // L2 to L1 messages.
    builder.previous_kernel.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX);
    expected_gas_used += Gas {
        da_gas: MAX_L2_TO_L1_MSGS_PER_TX * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE,
        l2_gas: MAX_L2_TO_L1_MSGS_PER_TX * L2_GAS_PER_L2_TO_L1_MSG,
    };
    // Private logs.
    builder.previous_kernel.append_siloed_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(
        MAX_PRIVATE_LOGS_PER_TX,
    );
    expected_gas_used += Gas {
        da_gas: (PRIVATE_LOG_SIZE_IN_FIELDS + 1) // +1 for the length field.
            * MAX_PRIVATE_LOGS_PER_TX
            * DA_BYTES_PER_FIELD
            * DA_GAS_PER_BYTE,
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
            * DA_BYTES_PER_FIELD
            * DA_GAS_PER_BYTE,
        l2_gas: MAX_CONTRACT_CLASS_LOGS_PER_TX * L2_GAS_PER_CONTRACT_CLASS_LOG,
    };

    let data = builder.execute();
    assert_eq(data.gas_used, expected_gas_used);
}
