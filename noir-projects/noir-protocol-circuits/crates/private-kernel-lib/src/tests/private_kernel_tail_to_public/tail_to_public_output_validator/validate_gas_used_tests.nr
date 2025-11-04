use crate::tests::private_kernel_tail_to_public::TestBuilder;

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
