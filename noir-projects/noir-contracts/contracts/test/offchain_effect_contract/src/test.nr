use crate::OffchainEffect;

use aztec::{
    messages::{encoding::MESSAGE_CIPHERTEXT_LEN, offchain_messages::deliver_offchain_message},
    protocol::address::AztecAddress,
    test::helpers::test_environment::{PrivateContextOptions, TestEnvironment},
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
    env.call_private(caller, OffchainEffect::at(contract_address).call_deliver_offchain_message(ciphertext, caller));
    let baseline = env.offchain_messages();
    assert(baseline.len() == 1);
    assert(baseline.get(0).tx_hash.is_some());

    env.view_private(caller, OffchainEffect::at(contract_address).view_deliver_offchain_message(ciphertext, caller));
    let view_messages = env.offchain_messages();
    assert(view_messages.len() == 1);

    // This is the key assertion of this test: we want to make sure that TXE properly resets old state when a static
    // view is run after a regular private call. Note `tx_hash` was *some value* before the static call, and now is
    // none.
    assert(view_messages.get(0).tx_hash.is_none());
}

/// TXE regression test: when a private context is entered with a user-supplied `anchor_block_number`,
/// offchain messages emitted during that context must carry the timestamp of the *anchor* block,
/// not the latest block.
#[test]
unconstrained fn private_context_offchain_message_uses_anchor_block_timestamp() {
    let (env, _, caller) = setup();

    env.mine_block();
    let anchor_block_number = env.last_block_number();
    let anchor_timestamp = env.last_block_timestamp();

    env.advance_next_block_timestamp_by(1000);
    env.mine_block();
    let latest_timestamp = env.last_block_timestamp();
    assert(latest_timestamp != anchor_timestamp);

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(anchor_block_number), |_context| {
        deliver_offchain_message(dummy_ciphertext(), caller)
    });

    let messages = env.offchain_messages();
    assert(messages.len() == 1);
    assert(messages.get(0).anchor_block_timestamp == anchor_timestamp);
    assert(messages.get(0).anchor_block_timestamp != latest_timestamp);
}
