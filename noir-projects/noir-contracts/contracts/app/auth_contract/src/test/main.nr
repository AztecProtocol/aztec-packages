use crate::{Auth, test::utils};

use aztec::{
    prelude::AztecAddress,
    protocol_types::traits::FromField,
    test::txe_constants::{AZTEC_SLOT_DURATION, GENESIS_TIMESTAMP},
};

// TODO (#8588): These were ported over directly from e2e tests. Refactor these in the correct TXe style.
#[test]
unconstrained fn main() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, auth_contract_address, admin, to_authorize, other) = utils::setup();

    let authorized_is_unset_initially = || {
        env.impersonate(admin);
        let authorized = Auth::at(auth_contract_address).get_authorized().view(&mut env.public());
        assert_eq(authorized, AztecAddress::from_field(0));
    };
    authorized_is_unset_initially();

    let non_admin_cannot_set_unauthorized = || {
        env.impersonate(other);
        env.assert_public_call_fails(Auth::at(auth_contract_address).set_authorized(to_authorize));
    };
    non_admin_cannot_set_unauthorized();

    let expected_timestamp_of_first_change = GENESIS_TIMESTAMP + Auth::CHANGE_AUTHORIZED_DELAY;

    let admin_sets_authorized = || {
        env.impersonate(admin);
        Auth::at(auth_contract_address).set_authorized(to_authorize).call(&mut env.public());
        env.advance_block_by(1);

        let scheduled_authorized =
            Auth::at(auth_contract_address).get_scheduled_authorized().view(&mut env.public());
        assert_eq(scheduled_authorized, to_authorize);
        let timestamp_of_change = Auth::at(auth_contract_address)
            .get_scheduled_authorized_timestamp()
            .view(&mut env.public());
        assert_eq(timestamp_of_change, expected_timestamp_of_first_change);
    };
    admin_sets_authorized();

    let authorized_is_not_yet_effective = || {
        env.impersonate(to_authorize);
        let authorized = Auth::at(auth_contract_address).get_authorized().view(&mut env.public());
        assert_eq(authorized, AztecAddress::zero());

        env.assert_private_call_fails(Auth::at(auth_contract_address).do_private_authorized_thing());
    };
    authorized_is_not_yet_effective();

    let authorized_becomes_effective_after_delay = || {
        env.impersonate(to_authorize);

        // We advance time to timestamp of change. At that point we should get the `post` value.
        env.advance_timestamp_to(expected_timestamp_of_first_change);
        env.advance_block_by(1);
        let authorized = Auth::at(auth_contract_address).get_authorized().view(&mut env.public());
        assert_eq(authorized, to_authorize);

        let authorized_in_private: AztecAddress =
            Auth::at(auth_contract_address).get_authorized_in_private().view(&mut env.private());
        assert_eq(authorized_in_private, AztecAddress::zero());

        // (Note that in the following comment we assume that each slot has a block and that delay is set to
        // the duration of 5 slots (currently 180 seconds).)
        // We need to always advance the block one more time to get the current value in private, compared to the value
        // in public.
        // To see why let's see this diagram.
        // When we schedule a change in public, lets say we are at block 2 (building a tx to be included in block 2),
        // which means the latest committed block is block 1.
        // Thus, the value change will be set to timestamp of block 7 (2 + 5).
        // If we now advance our env by 5 blocks, we will be at block 7 (building a tx to be included in block 7),
        // which means the latest committed block is block 6.
        // Reading the value in public will work, because the timestamp of the current block will be used (timestamp of
        // block 7), and the timestamp of the current block is the timestamp of change; but if we try to create a
        // historical proof, we do not have access to block 7 yet, and have to build the proof off of block 6, but at
        // this time, the value change will not have taken place yet, therefore we need to be at block 8 (building a
        // tx to be included in block 8), for the historical proof to work, as at that time the value will be changed
        // in the historical block we have access to.
        // Note: We do not see this behavior in the e2e tests because setting the value implicitly advances the block number by 1.
        //                              1     2     3     4     5     6     7     8     9
        //                              |     |     |     |     |     |     |     |     |
        //                                 ^
        //                    value change scheduled here
        //                                                                ^
        //                                   get_authorized() (public) called here with block_number = 7
        //                                                                      ^
        //                                        get_authorized() (private) called here with block_number = 8
        // Note: Currently TXE does not progress time when a block is advanced so we mimic "the real block progression"
        // by advancing the timestamp of the env manually by the duration of 1 slot.
        env.advance_timestamp_by(AZTEC_SLOT_DURATION);
        let authorized_in_private_again =
            Auth::at(auth_contract_address).get_authorized_in_private().view(&mut env.private());
        assert_eq(authorized_in_private_again, to_authorize);

        Auth::at(auth_contract_address).do_private_authorized_thing().call(&mut env.private());
    };
    authorized_becomes_effective_after_delay();

    let expected_timestamp_of_second_change =
        expected_timestamp_of_first_change + AZTEC_SLOT_DURATION + Auth::CHANGE_AUTHORIZED_DELAY;

    let authorize_other = || {
        env.impersonate(admin);
        Auth::at(auth_contract_address).set_authorized(other).call(&mut env.public());
        env.advance_block_by(1);

        let scheduled_authorized =
            Auth::at(auth_contract_address).get_scheduled_authorized().view(&mut env.public());
        assert_eq(scheduled_authorized, other);
        let timestamp_of_change = Auth::at(auth_contract_address)
            .get_scheduled_authorized_timestamp()
            .view(&mut env.public());
        assert_eq(timestamp_of_change, expected_timestamp_of_second_change);

        // We have not yet crossed the timestamp of change, so the authorized address is still set to `to_authorize`
        // and not to `other`.
        let authorized: AztecAddress =
            Auth::at(auth_contract_address).get_authorized().view(&mut env.public());
        assert_eq(authorized, to_authorize);

        env.impersonate(to_authorize);
        Auth::at(auth_contract_address).do_private_authorized_thing().call(&mut env.private());

        env.impersonate(other);
        env.assert_private_call_fails(Auth::at(auth_contract_address).do_private_authorized_thing());
    };
    authorize_other();

    let authorized_becomes_effective_after_delay_again = || {
        env.impersonate(to_authorize);

        // We advance the block to the timestamp of the second change.
        env.advance_timestamp_to(expected_timestamp_of_second_change);
        let authorized = Auth::at(auth_contract_address).get_authorized().view(&mut env.public());
        assert_eq(authorized, other);

        let authorized_in_private =
            Auth::at(auth_contract_address).get_authorized_in_private().view(&mut env.private());
        assert_eq(authorized_in_private, to_authorize);

        env.advance_timestamp_by(AZTEC_SLOT_DURATION);
        let authorized_in_private_again =
            Auth::at(auth_contract_address).get_authorized_in_private().view(&mut env.private());
        assert_eq(authorized_in_private_again, other);

        env.assert_private_call_fails(Auth::at(auth_contract_address).do_private_authorized_thing());

        env.impersonate(other);
        Auth::at(auth_contract_address).do_private_authorized_thing().call(&mut env.private());
    };
    authorized_becomes_effective_after_delay_again();
}
