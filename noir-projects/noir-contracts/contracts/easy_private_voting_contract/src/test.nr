use crate::EasyPrivateVoting;
use dep::aztec::test::helpers::utils;

#[test]
unconstrained fn votes() {
  let (
    env,
    (account_1)
  ) = utils::setup(false, false);
    let initializer_call_interface = EasyPrivateVoting::interface().constructor(
        account_1,
    );
    let easy_private_voting_contract = env.deploy("./@easy_private_voting_contract", "EasyPrivateVoting").with_public_initializer(initializer_call_interface);
    let easy_private_voting_contract_address = easy_private_voting_contract.to_address();
    env.advance_block_by(1);

    // We cast our vote for candidate 1
    env.call_private_void(EasyPrivateVoting::at(easy_private_voting_contract_address).cast_vote(1));

    let votes = env.call_unconstrained(easy_private_voting_contract_address, || { EasyPrivateVoting::get_vote(1) });
    assert_eq(votes, 1);

    // We try voting again, but our TX is invalid due to trying to emit duplicate nullifiers
    env.assert_private_call_fails(EasyPrivateVoting::at(easy_private_voting_contract_address).cast_vote(1));
}
