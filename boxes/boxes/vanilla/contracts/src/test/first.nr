use crate::test::utils;
use aztec::protocol::storage::map::derive_storage_slot_in_map;

use crate::PrivateVoting;
use crate::PrivateVoting::ElectionId;

#[test]
unconstrained fn test_initializer() {
    let (env, voting_contract_address, admin) = utils::setup();

    env.public_context_at(voting_contract_address, |context| {
        let current_admin = context.storage_read(PrivateVoting::storage_layout().admin.slot);
        assert_eq(current_admin, admin);
    });
}

#[test]
unconstrained fn test_check_vote_status() {
    let (env, voting_contract_address, _) = utils::setup();

    env.public_context_at(voting_contract_address, |context| {
        let vote_ended = context.storage_read(PrivateVoting::storage_layout().vote_ended.slot);
        assert_eq(vote_ended, false);
    });
}

#[test]
unconstrained fn test_end_vote() {
    let (env, voting_contract_address, admin) = utils::setup();

    let election_id = ElectionId::new(Field::from(42));
    env.call_public(admin, PrivateVoting::at(voting_contract_address).end_vote(election_id));

    env.public_context_at(voting_contract_address, |context| {
        let vote_ended = context.storage_read(derive_storage_slot_in_map(
            PrivateVoting::storage_layout().vote_ended.slot,
            election_id,
        ));
        assert_eq(vote_ended, true);
    });
}

#[test(should_fail_with = "Only admin can end votes")]
unconstrained fn test_fail_end_vote_by_non_admin() {
    let (mut env, voting_contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let election_id = ElectionId::new(Field::from(42));

    env.call_public(alice, PrivateVoting::at(voting_contract_address).end_vote(election_id));
}

#[test]
unconstrained fn test_cast_vote() {
    let (mut env, voting_contract_address, admin) = utils::setup();
    let alice = env.create_light_account();

    let election_id = ElectionId::new(Field::from(42));
    env.call_public(admin, PrivateVoting::at(voting_contract_address).start_vote(election_id));

    let candidate = 1;
    env.call_private(
        alice,
        PrivateVoting::at(voting_contract_address).cast_vote(election_id, candidate),
    );

    let tally = env.view_public(PrivateVoting::at(voting_contract_address).get_tally(
        election_id,
        candidate,
    ));
    assert_eq(tally, 1);
}

#[test]
unconstrained fn test_cast_vote_with_separate_accounts() {
    let (mut env, voting_contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();

    let election_id = ElectionId::new(Field::from(42));
    env.call_public(admin, PrivateVoting::at(voting_contract_address).start_vote(election_id));

    let candidate = 101;
    env.call_private(
        alice,
        PrivateVoting::at(voting_contract_address).cast_vote(election_id, candidate),
    );

    let _ = env.call_private(
        bob,
        PrivateVoting::at(voting_contract_address).cast_vote(election_id, candidate),
    );

    let tally = env.view_public(PrivateVoting::at(voting_contract_address).get_tally(
        election_id,
        candidate,
    ));
    assert_eq(tally, 2);
}

#[test(should_fail_with = "duplicate siloed nullifier")]
unconstrained fn test_fail_vote_twice() {
    let (mut env, voting_contract_address, admin) = utils::setup();
    let alice = env.create_light_account();

    let election_id = ElectionId::new(Field::from(42));
    env.call_public(admin, PrivateVoting::at(voting_contract_address).start_vote(election_id));

    let candidate = 101;

    env.call_private(
        alice,
        PrivateVoting::at(voting_contract_address).cast_vote(election_id, candidate),
    );
    env.call_private(
        alice,
        PrivateVoting::at(voting_contract_address).cast_vote(election_id, candidate),
    );
}

#[test]
unconstrained fn test_vote_in_two_different_elections() {
    let (mut env, voting_contract_address, admin) = utils::setup();
    let alice = env.create_light_account();

    let election_id_42 = ElectionId::new(Field::from(42));
    let election_id_54 = ElectionId::new(Field::from(54));

    env.call_public(admin, PrivateVoting::at(voting_contract_address).start_vote(election_id_42));
    env.call_public(admin, PrivateVoting::at(voting_contract_address).start_vote(election_id_54));

    let candidate = 101;

    env.call_private(
        alice,
        PrivateVoting::at(voting_contract_address).cast_vote(election_id_42, candidate),
    );
    env.call_private(
        alice,
        PrivateVoting::at(voting_contract_address).cast_vote(election_id_54, candidate),
    );

    let vote_count_42 = env.view_public(PrivateVoting::at(voting_contract_address).get_tally(
        election_id_42,
        candidate,
    ));
    let vote_count_54 = env.view_public(PrivateVoting::at(voting_contract_address).get_tally(
        election_id_54,
        candidate,
    ));

    assert_eq(vote_count_42, 1);
    assert_eq(vote_count_54, 1);
}
