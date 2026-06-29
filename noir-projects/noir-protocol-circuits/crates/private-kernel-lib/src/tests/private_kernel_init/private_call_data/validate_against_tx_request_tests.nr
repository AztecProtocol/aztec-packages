use crate::tests::private_kernel_init::TestBuilder;

#[test(should_fail_with = "contract address does not match origin")]
fn mismatch_contract_address() {
    let mut builder = TestBuilder::new();

    builder.tx_request.origin.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "function_selector in call_context does not match the value in tx_request")]
fn mismatch_function_data() {
    let mut builder = TestBuilder::new();

    // Tweak the function selector to be a different value.
    builder.tx_request.function_data.selector.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "tx_request does not indicate the first function is private")]
fn first_call_is_public() {
    let mut builder = TestBuilder::new();

    // Tweak the function to be public.
    builder.tx_request.function_data.is_private = false;

    builder.execute_and_fail();
}

#[test(should_fail_with = "args_hash in private call does not match the value in tx_request")]
fn mismatch_args_hash() {
    let mut builder = TestBuilder::new();

    // Tweak the args hash to be a different value.
    builder.tx_request.args_hash += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "tx_context in private call does not match the value in tx_request")]
fn mismatch_chain_id() {
    let mut builder = TestBuilder::new();

    // Tweak the chain id to be a different value.
    builder.tx_request.tx_context.chain_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "tx_context in private call does not match the value in tx_request")]
fn mismatch_version() {
    let mut builder = TestBuilder::new();

    // Tweak the version to be a different value.
    builder.tx_request.tx_context.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "tx_context in private call does not match the value in tx_request")]
fn mismatch_l2_gas_limit() {
    let mut builder = TestBuilder::new();

    // Tweak the l2 gas limit to be a different value.
    builder.tx_request.tx_context.gas_settings.gas_limits.l2_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "tx_request_salt in private call does not match the salt in tx_request")]
fn mismatch_salt() {
    let mut builder = TestBuilder::new();

    // Tweak the salt to be a different value.
    builder.tx_request.salt += 1;

    builder.execute_and_fail();
}
