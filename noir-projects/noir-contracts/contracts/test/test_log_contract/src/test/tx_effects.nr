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
unconstrained fn no_private_logs_when_none_emitted() {
    let (env, contract_address, sender) = setup();
    let test_log = TestLog::at(contract_address);

    env.call_public(sender, test_log.emit_unencrypted_events([1, 2, 3, 4]));

    let private_logs = txe_oracles::get_last_tx_effects().private_logs;

    assert_eq(private_logs.len(), 0);
}

#[test]
unconstrained fn private_log() {
    let (env, contract_address, sender) = setup();
    let test_log = TestLog::at(contract_address);

    env.call_private(sender, test_log.emit_raw_private_log(RAW_TAG, PAYLOAD));

    let private_logs = txe_oracles::get_last_tx_effects().private_logs;

    assert_eq(private_logs.len(), 1);

    let log = private_logs.get(0);
    // The log carries the kernel-siloed tag (first field) followed by the emitted payload.
    assert_eq(log.len(), 2);

    let expected_siloed_tag = compute_siloed_private_log_first_field(contract_address, RAW_TAG);
    assert_eq(log.get(0), expected_siloed_tag);
    assert_eq(log.get(1), PAYLOAD);
}

/// Exercises the nested `BoundedVec<BoundedVec<T>` serialization in `aztec_txe_getLastTxEffects`.
#[test]
unconstrained fn multiple_private_logs_with_varying_lengths() {
    let (env, contract_address, sender) = setup();
    let test_log = TestLog::at(contract_address);

    let tag1: Field = 1;
    let payload1: Field = 100;
    let tag2: Field = 2;
    let payload2: [Field; 3] = [200, 201, 202];
    let tag3: Field = 3;
    let payload3: [Field; 5] = [300, 301, 302, 303, 304];

    env.call_private(
        sender,
        test_log.emit_three_raw_private_logs_diff_lengths(tag1, payload1, tag2, payload2, tag3, payload3),
    );

    let private_logs = txe_oracles::get_last_tx_effects().private_logs;

    assert_eq(private_logs.len(), 3);

    let log1 = private_logs.get(0);
    assert_eq(log1.len(), 2); // 1 tag + 1 payload field
    assert_eq(log1.get(0), compute_siloed_private_log_first_field(contract_address, tag1));
    assert_eq(log1.get(1), payload1);

    let log2 = private_logs.get(1);
    assert_eq(log2.len(), 4); // 1 tag + 3 payload fields
    assert_eq(log2.get(0), compute_siloed_private_log_first_field(contract_address, tag2));
    assert_eq(log2.get(1), payload2[0]);
    assert_eq(log2.get(2), payload2[1]);
    assert_eq(log2.get(3), payload2[2]);

    let log3 = private_logs.get(2);
    assert_eq(log3.len(), 6); // 1 tag + 5 payload fields
    assert_eq(log3.get(0), compute_siloed_private_log_first_field(contract_address, tag3));
    assert_eq(log3.get(1), payload3[0]);
    assert_eq(log3.get(2), payload3[1]);
    assert_eq(log3.get(3), payload3[2]);
    assert_eq(log3.get(4), payload3[3]);
    assert_eq(log3.get(5), payload3[4]);
}
