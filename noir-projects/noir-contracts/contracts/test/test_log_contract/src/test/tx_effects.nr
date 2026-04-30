use crate::TestLog;
use aztec::protocol::{address::AztecAddress, hash::compute_siloed_private_log_first_field};
use aztec::test::helpers::{test_environment::TestEnvironment, txe_oracles};

global RAW_TAG: Field = 42;
global PAYLOAD: Field = 1234;

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address = env.deploy("TestLog").without_initializer();
    (env, contract_address, sender)
}

#[test]
unconstrained fn get_last_tx_effects_returns_emitted_private_log() {
    let (env, contract_address, sender) = setup();
    let test_log = TestLog::at(contract_address);

    env.call_private(sender, test_log.emit_raw_private_log(RAW_TAG, PAYLOAD));

    let (_, _, _, private_logs) = txe_oracles::get_last_tx_effects();

    assert_eq(private_logs.len(), 1);

    let log = private_logs.get(0);
    // The log carries the kernel-siloed tag (first field) followed by the emitted payload.
    assert_eq(log.len(), 2);

    let expected_siloed_tag = compute_siloed_private_log_first_field(contract_address, RAW_TAG);
    assert_eq(log.get(0), expected_siloed_tag);
    assert_eq(log.get(1), PAYLOAD);
}
