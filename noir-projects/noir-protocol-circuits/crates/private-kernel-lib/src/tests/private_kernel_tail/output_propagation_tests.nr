use super::TestBuilder;
use dep::types::{address::AztecAddress, tests::utils::assert_array_eq, traits::FromField};

#[test]
fn correct_private_kernel_tail_output_propagated_values() {
    let mut builder = TestBuilder::new();

    let constants = builder.previous_kernel.to_tx_constant_data();
    builder.previous_kernel.fee_payer = AztecAddress::from_field(90);
    builder.include_by_timestamp_upper_bound = 999;
    builder.previous_kernel.include_by_timestamp = 13;
    builder.previous_kernel.append_siloed_note_hashes(2);
    builder.previous_kernel.append_siloed_nullifiers(2);
    builder.previous_kernel.append_siloed_private_logs(1);

    let public_inputs = builder.execute();

    assert_eq(public_inputs.constants, constants);
    assert_eq(public_inputs.fee_payer, AztecAddress::from_field(90));
    assert_eq(public_inputs.include_by_timestamp, 13);
    // More scenarios for the `include_by_timestamp` value are tested in `validate_propagated_values_tests.nr`.

    // The exact values for the `gas_used` are tested in `meter_gas_used_tests.nr`.

    // Note hashes.
    let note_hashes = builder.previous_kernel.note_hashes.storage().map(|n| n.expose_to_public());
    assert_array_eq(
        public_inputs.end.note_hashes,
        [note_hashes[0], note_hashes[1]],
    );

    // Nullifiers.
    let nullifiers = builder.previous_kernel.nullifiers.storage().map(|n| n.expose_to_public());
    assert_array_eq(
        public_inputs.end.nullifiers,
        [nullifiers[0], nullifiers[1], nullifiers[2]], // The first protocol nullifier is added during the test setup.
    );

    // Private logs.
    let private_logs = builder.previous_kernel.private_logs.storage().map(|l| l.innermost().log);
    assert_array_eq(public_inputs.end.private_logs, [private_logs[0]]);

    // More scenarios for the `end` accumulated data are tested in `validate_propagated_sorted_values_tests.nr`
    // and `validate_propagated_values_tests.nr` in the `tail_output_validator`.
}
