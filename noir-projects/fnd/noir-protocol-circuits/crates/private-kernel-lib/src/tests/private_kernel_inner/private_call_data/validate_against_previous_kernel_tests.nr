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

// A nested private call must see the same `tx_request_salt` that the Init circuit bound to the transaction request.
// A malicious prover that picks a different app-visible salt for the nested call must be rejected.
#[test(should_fail_with = "mismatch tx_request_salt")]
fn mismatch_tx_request_salt() {
    let mut builder = TestBuilder::new();

    builder.private_call.tx_request_salt += 1;

    builder.execute_and_fail();
}
