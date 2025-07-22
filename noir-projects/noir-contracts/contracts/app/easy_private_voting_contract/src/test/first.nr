use crate::test::utils;
use dep::aztec::protocol_types::storage::map::derive_storage_slot_in_map;

use crate::EasyPrivateVoting;

#[test]
unconstrained fn test_initializer() {
    let (env, voting_contract_address, admin) = utils::setup();

    env.public_context_at(voting_contract_address, |context| {
        let current_admin = context.storage_read(EasyPrivateVoting::storage_layout().admin.slot);
        assert_eq(current_admin, admin);
    });
}

#[test]
unconstrained fn test_check_vote_status() {
    let (env, voting_contract_address, _) = utils::setup();

    env.public_context_at(voting_contract_address, |context| {
        let vote_ended = context.storage_read(EasyPrivateVoting::storage_layout().vote_ended.slot);
        assert_eq(vote_ended, false);
    });
}

#[test]
unconstrained fn test_end_vote() {
    let (env, voting_contract_address, admin) = utils::setup();

    let _ = env.call_public_void(admin, EasyPrivateVoting::at(voting_contract_address).end_vote());

    env.public_context_at(voting_contract_address, |context| {
        let vote_ended = context.storage_read(EasyPrivateVoting::storage_layout().vote_ended.slot);
        assert_eq(vote_ended, true);
    });
}

#[test(should_fail)]
unconstrained fn test_fail_end_vote_by_non_admin() {
    let (env, voting_contract_address, _) = utils::setup();
    let alice = env.create_account(2);

    let _ = env.call_public_void(alice, EasyPrivateVoting::at(voting_contract_address).end_vote());
}

#[test]
unconstrained fn test_cast_vote() {
    let (env, voting_contract_address, _) = utils::setup();
    let alice = env.create_account(2);

    let candidate = 1;
    let _ = env.call_private_void(
        alice,
        EasyPrivateVoting::at(voting_contract_address).cast_vote(candidate),
    );

    env.public_context_at(voting_contract_address, |context| {
        let vote_count = context.storage_read(derive_storage_slot_in_map(
            EasyPrivateVoting::storage_layout().tally.slot,
            candidate,
        ));
        assert_eq(vote_count, 1);
    });
}

#[test]
unconstrained fn test_cast_vote_with_separate_accounts() {
    let (env, voting_contract_address, _) = utils::setup();
    let alice = env.create_account(2);
    let bob = env.create_account(3);

    let candidate = 101;

    let _ = env.call_private_void(
        alice,
        EasyPrivateVoting::at(voting_contract_address).cast_vote(candidate),
    );

    let _ = env.call_private_void(
        bob,
        EasyPrivateVoting::at(voting_contract_address).cast_vote(candidate),
    );

    env.public_context_at(voting_contract_address, |context| {
        let vote_count = context.storage_read(derive_storage_slot_in_map(
            EasyPrivateVoting::storage_layout().tally.slot,
            candidate,
        ));
        assert_eq(vote_count, 2);
    });
}

#[test(should_fail)]
unconstrained fn test_fail_vote_twice() {
    let (env, voting_contract_address, _) = utils::setup();
    let alice = env.create_account(2);

    let candidate = 101;

    let _ = env.call_private_void(
        alice,
        EasyPrivateVoting::at(voting_contract_address).cast_vote(candidate),
    );

    let _ = env.call_private_void(
        alice,
        EasyPrivateVoting::at(voting_contract_address).cast_vote(candidate),
    );
}
