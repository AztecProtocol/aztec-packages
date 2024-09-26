use crate::DocsExample;
use crate::types::leader::Leader;
use dep::aztec::test::helpers::utils;

#[test]
unconstrained fn shared_immutable() {
    let (env, (account_1)) = utils::setup(false, false);
    // The docs_example_contract has the functions we need to test note retrieval.
    let docs_example_contract = env.deploy("./@docs_example_contract", "DocsExample").without_initializer();
    let docs_example_contract_address = docs_example_contract.to_address();
    env.advance_block_by(1);

    // Private read of uninitialized SharedImmutable
    let leader = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_shared_immutable()});
    env.call_private_void(DocsExample::at(docs_example_contract_address).match_shared_immutable(leader.account, leader.points));

    // Initialize and read SharedImmutable
    let leader_points = 69;
    env.call_public(DocsExample::at(docs_example_contract_address).initialize_shared_immutable(leader_points));
    env.advance_block_by(1);
    let mut leader_after_init = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_shared_immutable()});

    assert_eq(leader_after_init, Leader {
      account: account_1,
      points: leader_points
    });

    // Private read of SharedImmutable
    // Reads the value using an unconstrained function checking the return values with:
    // 1. A constrained private function that reads it directly
    // 2. A constrained private function that calls another private function that reads.
    //    The indirect, adds 1 to the point to ensure that we are returning the correct value.
    let leader_constrained_private = env.call_private(DocsExample::at(docs_example_contract_address).get_shared_immutable_constrained_private());
    let leader_constrained_indirect_private = env.call_private(DocsExample::at(docs_example_contract_address).get_shared_immutable_constrained_private_indirect());
    leader_after_init = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_shared_immutable()});

    assert_eq(leader_constrained_private, leader_after_init);
    assert_eq(leader_constrained_indirect_private, Leader {
      account: leader_after_init.account,
      points: leader_after_init.points + 1,
    });

    env.call_private_void(DocsExample::at(docs_example_contract_address).match_shared_immutable(leader_after_init.account, leader_after_init.points));

    // Public read of SharedImmutable
    // Reads the value using an unconstrained function checking the return values with:
    // 1. A constrained public function that reads it directly
    // 2. A constrained public function that calls another public function that reads.
    //    The indirect, adds 1 to the point to ensure that we are returning the correct value.
    let leader_constrained_public = env.call_public(DocsExample::at(docs_example_contract_address).get_shared_immutable_constrained_public());
    let leader_constrained_indirect_public = env.call_public(DocsExample::at(docs_example_contract_address).get_shared_immutable_constrained_public_indirect());
    leader_after_init = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_shared_immutable()});

    assert_eq(leader_constrained_public, leader_after_init);
    assert_eq(leader_constrained_indirect_public, Leader {
      account: leader_after_init.account,
      points: leader_after_init.points + 1,
    });

    env.call_private_void(DocsExample::at(docs_example_contract_address).match_shared_immutable(leader_after_init.account, leader_after_init.points));

    // Public multiread of SharedImmutable
    // Reads the value using an unconstrained function checking the return values with:
    // 1. A constrained public function that reads 5 times directly (going beyond the previous 4 Field return value)
    let leader_constrained_public_multiple = env.call_public(DocsExample::at(docs_example_contract_address).get_shared_immutable_constrained_public_multiple());
    leader_after_init = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_shared_immutable()});

    assert_eq([leader_after_init, leader_after_init, leader_after_init, leader_after_init, leader_after_init], leader_constrained_public_multiple);

    // Initializing PublicImmutable the second time should fail
    env.assert_public_call_fails(DocsExample::at(docs_example_contract_address).initialize_shared_immutable(leader_points));
}

#[test]
unconstrained fn public_immutable() {
    let (env, (account_1)) = utils::setup(false, false);
    // The docs_example_contract has the functions we need to test note retrieval.
    let docs_example_contract = env.deploy("./@docs_example_contract", "DocsExample").without_initializer();
    let docs_example_contract_address = docs_example_contract.to_address();
    env.advance_block_by(1);

    // Initialize and read public immutable
    let num_points = 1;
    env.call_public(DocsExample::at(docs_example_contract_address).initialize_public_immutable(num_points));
    let leader = env.call_unconstrained(docs_example_contract_address, || { DocsExample::get_public_immutable() });

    assert_eq(leader, Leader {
      account: account_1,
      points: num_points,
    });

    // Initializing PublicImmutable the second time should fail
    env.assert_public_call_fails(DocsExample::at(docs_example_contract_address).initialize_public_immutable(num_points));
}

#[test]
unconstrained fn private_mutable() {
    let (env, (account_1)) = utils::setup(false, false);
    // The docs_example_contract has the functions we need to test note retrieval.
    let docs_example_contract = env.deploy("./@docs_example_contract", "DocsExample").without_initializer();
    let docs_example_contract_address = docs_example_contract.to_address();
    env.advance_block_by(1);

    let POINTS = 1;
    let RANDOMNESS = 2;

    // Fail to read uninitialized PrivateMutable
    assert(!env.call_unconstrained(docs_example_contract_address, || {DocsExample::is_legendary_initialized()}));
    // Should add assert_unconstrained_fails
    // env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_legendary_card()});

    // Initialize PrivateMutable (TODO: for parity with e2e, we probably want to check what nullifiers / note hashes / side effects are available from the TXE)
    env.call_private_void(DocsExample::at(docs_example_contract_address).initialize_private(RANDOMNESS, POINTS));
    env.advance_block_by(1);
    assert(env.call_unconstrained(docs_example_contract_address, || {DocsExample::is_legendary_initialized()}));

    // Fail to reinitialize
    env.assert_private_call_fails(DocsExample::at(docs_example_contract_address).initialize_private(RANDOMNESS, POINTS));
    assert(env.call_unconstrained(docs_example_contract_address, || {DocsExample::is_legendary_initialized()}));

    // Read initialized PrivateMutable
    let card_note_before_update = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_legendary_card()});
    assert((card_note_before_update.points == POINTS) & (card_note_before_update.randomness == RANDOMNESS));

    // Replace with same value
    // This cannot be tested here as nonces are not unique
    // env.call_private_void(DocsExample::at(docs_example_contract_address).update_legendary_card(RANDOMNESS, POINTS));
    // env.advance_block_by(1);
    // let card_note_after_update = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_legendary_card()});

    // assert(
    //   (card_note_after_update.npk_m_hash == card_note_before_update.npk_m_hash) &
    //   (card_note_after_update.points == card_note_before_update.points) &
    //   (card_note_after_update.randomness == card_note_before_update.randomness) &
    //   (card_note_after_update.header.contract_address == card_note_before_update.header.contract_address) &
    //   (card_note_after_update.header.storage_slot == card_note_before_update.header.storage_slot) &
    //   (card_note_after_update.header.note_hash_counter == card_note_before_update.header.note_hash_counter) &
    //   // This is not true in e2e tests, as note nonce cannot be known in private
    //   (card_note_after_update.header.nonce != card_note_before_update.header.nonce)
    // );

    // Replace PrivateMutable with other values
    let NEW_POINTS = 69;
    let NEW_RANDOMNESS = 42;
    env.call_private_void(DocsExample::at(docs_example_contract_address).update_legendary_card(NEW_RANDOMNESS, NEW_POINTS));
    env.advance_block_by(1);

    let card_note_after_update = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_legendary_card()});
    assert(
      (card_note_after_update.npk_m_hash == card_note_before_update.npk_m_hash) &
      (card_note_after_update.points == NEW_POINTS) &
      (card_note_after_update.randomness == NEW_RANDOMNESS) &
      (card_note_after_update.header.contract_address == card_note_before_update.header.contract_address) &
      (card_note_after_update.header.storage_slot == card_note_before_update.header.storage_slot) &
      (card_note_after_update.header.note_hash_counter == card_note_before_update.header.note_hash_counter) &
      // This is not equal in e2e tests, as note nonce cannot be known in private
      (card_note_after_update.header.nonce == card_note_before_update.header.nonce)
    );

    // Replace PrivateMutable dependent on prior value
    // This function also does not work due to not being able to set a note nonce.
    // The note is fetched, with the original note is initially nullified and replaced.
    // The note is then replaced, with the replacement being nullified. The issue is that because note nonces are set at 0, this second nullification
    // produces a duplicate nullifier. Not sure if there is a way around it. Maybe if we can tell if a note was only replaced with the same "values", we could ignore this first nullifier ?
    // env.call_private_void(DocsExample::at(docs_example_contract_address).increase_legendary_points());
    // env.advance_block_by(1);

    // let card_note_after_increase = env.call_unconstrained(docs_example_contract_address, || {DocsExample::get_legendary_card()});
    // assert(
    //   (card_note_after_increase.npk_m_hash == card_note_before_update.npk_m_hash) &
    //   (card_note_after_increase.points == card_note_after_update.points + 1) &
    //   (card_note_after_increase.randomness == card_note_after_update.randomness)
    // );
}

#[test]
unconstrained fn private_immutable() {
    let (env, (account_1)) = utils::setup(false, false);
    // The docs_example_contract has the functions we need to test note retrieval.
    let docs_example_contract = env.deploy("./@docs_example_contract", "DocsExample").without_initializer();
    let docs_example_contract_address = docs_example_contract.to_address();
    env.advance_block_by(1);

    let POINTS = 1;
    let RANDOMNESS = 2;

    // Fail to read uninitialized PrivateImmutable
    assert(!env.call_unconstrained(docs_example_contract_address, || { DocsExample::is_priv_imm_initialized() }));
    // Cannot yet assert unconstrained call fails
    // let imm_card = env.call_unconstrained(docs_example_contract_address, || { DocsExample::view_imm_card() });

    // Initialize PrivateImmutable
    env.call_private_void(DocsExample::at(docs_example_contract_address).initialize_private_immutable(RANDOMNESS, POINTS));
    env.advance_block_by(1);

    assert(env.call_unconstrained(docs_example_contract_address, || { DocsExample::is_priv_imm_initialized() }));

    // Fails to reinitialize
    env.assert_private_call_fails(DocsExample::at(docs_example_contract_address).initialize_private_immutable(RANDOMNESS, POINTS));
    assert(env.call_unconstrained(docs_example_contract_address, || { DocsExample::is_priv_imm_initialized() }));

    // Read initialized PrivateImmutable
    let imm_card = env.call_unconstrained(docs_example_contract_address, || { DocsExample::view_imm_card() });
    assert((imm_card.points == POINTS) & (imm_card.randomness == RANDOMNESS));
}
