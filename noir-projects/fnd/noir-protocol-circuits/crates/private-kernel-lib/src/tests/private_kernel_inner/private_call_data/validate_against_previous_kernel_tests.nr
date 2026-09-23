use crate::tests::private_kernel_inner::TestBuilder;

#[test(should_fail_with = "anchor block header mismatch")]
fn mismatch_header_version() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.anchor_block_header.global_variables.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "mismatch tx context")]
fn mismatch_chain_id() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.tx_context.chain_id += 1;

    builder.execute_and_fail();
}

// A nested private call must see the same `protocol_nullifier` that the Init circuit bound to the transaction
// request. A malicious prover that picks a different app-visible value for the nested call must be rejected.
#[test(should_fail_with = "mismatch protocol_nullifier")]
fn mismatch_protocol_nullifier() {
    let mut builder = TestBuilder::new();

    builder.private_call.protocol_nullifier += 1;

    builder.execute_and_fail();
}
