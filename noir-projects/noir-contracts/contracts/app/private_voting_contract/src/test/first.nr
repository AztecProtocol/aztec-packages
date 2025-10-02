use crate::test::utils;
use dep::aztec::protocol_types::storage::map::derive_storage_slot_in_map;

use crate::PrivateVoting;

#[test]
unconstrained fn test_initializer() {
    let (mut env, voting_contract_address, admin) = utils::setup();

    env.public_context_at(voting_contract_address, |context| {
        let current_admin = context.storage_read(PrivateVoting::storage_layout().admin.slot);
        assert_eq(current_admin, admin);
    });
}

#[test]
unconstrained fn test_check_vote_status() {
    let (mut env, voting_contract_address, _) = utils::setup();

    env.public_context_at(voting_contract_address, |context| {
        let vote_ended = context.storage_read(PrivateVoting::storage_layout().vote_ended.slot);
        assert_eq(vote_ended, false);
    });
}

#[test]
unconstrained fn test_end_vote() {
    let (env, voting_contract_address, admin) = utils::setup();

    env.call_public(admin, PrivateVoting::at(voting_contract_address).end_vote());

    env.public_context_at(voting_contract_address, |context| {
        let vote_ended = context.storage_read(PrivateVoting::storage_layout().vote_ended.slot);
        assert_eq(vote_ended, true);
    });
}

#[test(should_fail_with = "Only admin can end votes")]
unconstrained fn test_fail_end_vote_by_non_admin() {
    let (mut env, voting_contract_address, _) = utils::setup();
    let alice = env.create_light_account();

    env.call_public(alice, PrivateVoting::at(voting_contract_address).end_vote());
}

#[test]
unconstrained fn test_cast_vote() {
    let (mut env, voting_contract_address, _) = utils::setup();
    let alice = env.create_light_account();

    let candidate = 1;
    env.call_private(alice, PrivateVoting::at(voting_contract_address).cast_vote(candidate));

    env.public_context_at(voting_contract_address, |context| {
        let vote_count = context.storage_read(derive_storage_slot_in_map(
            PrivateVoting::storage_layout().tally.slot,
            candidate,
        ));
        assert_eq(vote_count, 1);
    });
}

#[test]
unconstrained fn test_cast_vote_with_separate_accounts() {
    let (mut env, voting_contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();

    let candidate = 101;

    env.call_private(alice, PrivateVoting::at(voting_contract_address).cast_vote(candidate));

    let _ = env.call_private(bob, PrivateVoting::at(voting_contract_address).cast_vote(candidate));

    env.public_context_at(voting_contract_address, |context| {
        let vote_count = context.storage_read(derive_storage_slot_in_map(
            PrivateVoting::storage_layout().tally.slot,
            candidate,
        ));
        assert_eq(vote_count, 2);
    });
}

#[test(should_fail_with = "already exists")]
unconstrained fn test_fail_vote_twice() {
    let (mut env, voting_contract_address, _) = utils::setup();
    let alice = env.create_light_account();

    let candidate = 101;

    env.call_private(alice, PrivateVoting::at(voting_contract_address).cast_vote(candidate));

    env.call_private(alice, PrivateVoting::at(voting_contract_address).cast_vote(candidate));
}
