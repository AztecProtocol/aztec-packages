use crate::OffchainEffect;

use aztec::{
    messages::encoding::MESSAGE_CIPHERTEXT_LEN, protocol::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let caller = env.create_light_account();
    let contract_address = env.deploy("OffchainEffect").without_initializer();
    (env, contract_address, caller)
}

unconstrained fn dummy_ciphertext() -> [Field; MESSAGE_CIPHERTEXT_LEN] {
    let mut c = [0; MESSAGE_CIPHERTEXT_LEN];
    c[0] = 42;
    c
}

/// This test might feel a bit ad-hoc. It really aims at verifying that TXE correctly simulates the call context of
/// offchain effects when they are emitted by static calls.
#[test]
unconstrained fn static_call_offchain_message_has_no_tx_hash() {
    let (env, contract_address, caller) = setup();
    let ciphertext = dummy_ciphertext();

    // Baseline: a non-static call that mines a block. This ensures TXE world state captures a real tx hash.
    env.call_private(
        caller,
        OffchainEffect::at(contract_address).call_deliver_offchain_message(ciphertext, caller),
    );
    let baseline = env.offchain_messages();
    assert(baseline.len() == 1);
    assert(baseline.get(0).tx_hash.is_some());

    env.view_private(
        caller,
        OffchainEffect::at(contract_address).view_deliver_offchain_message(ciphertext, caller),
    );
    let view_messages = env.offchain_messages();
    assert(view_messages.len() == 1);

    // This is the key assertion of this test: we want to make sure that TXE properly resets old state when a static
    // view is run after a regular private call. Note `tx_hash` was *some value* before the static call, and now is
    // none.
    assert(view_messages.get(0).tx_hash.is_none());
}
