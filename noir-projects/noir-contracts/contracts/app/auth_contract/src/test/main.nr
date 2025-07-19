use crate::{Auth, test::utils};

use aztec::{
    protocol_types::{address::AztecAddress, traits::FromField},
    test::txe_constants::GENESIS_TIMESTAMP,
};

// TODO (#8588): These were ported over directly from e2e tests. Refactor these in the correct TXe style.
#[test]
unconstrained fn main() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, auth_contract_address, admin, to_authorize, other) = utils::setup();

    let authorized_is_unset_initially = || {
        let authorized = env.view_public(Auth::at(auth_contract_address).get_authorized());
        assert_eq(authorized, AztecAddress::from_field(0));
    };
    authorized_is_unset_initially();

    let non_admin_cannot_set_unauthorized = || {
        env.assert_public_call_fails(Auth::at(auth_contract_address).set_authorized(to_authorize));
    };
    non_admin_cannot_set_unauthorized();

    let expected_timestamp_of_first_change = GENESIS_TIMESTAMP + Auth::CHANGE_AUTHORIZED_DELAY;

    let admin_sets_authorized = || {
        let _ = env.call_public_void(
            admin,
            Auth::at(auth_contract_address).set_authorized(to_authorize),
        );

        let (scheduled_authorized, timestamp_of_change) =
            env.view_public(Auth::at(auth_contract_address).get_scheduled_authorized());
        assert_eq(scheduled_authorized, to_authorize);
        assert_eq(timestamp_of_change, expected_timestamp_of_first_change);
    };
    admin_sets_authorized();

    let authorized_is_not_yet_effective = || {
        let authorized = env.view_public(Auth::at(auth_contract_address).get_authorized());
        assert_eq(authorized, AztecAddress::zero());

        env.assert_private_call_fails(Auth::at(auth_contract_address).do_private_authorized_thing());
    };
    authorized_is_not_yet_effective();

    let authorized_becomes_effective_after_delay = || {
        // We advance time to timestamp of change. At that point we should get the `post` value.
        env.mine_block_at(expected_timestamp_of_first_change);

        let authorized = env.view_public(Auth::at(auth_contract_address).get_authorized());
        assert_eq(authorized, to_authorize);

        let authorized_in_private_again = env.view_private(
            to_authorize,
            Auth::at(auth_contract_address).get_authorized_in_private(),
        );
        assert_eq(authorized_in_private_again, to_authorize);

        let _ = env.call_private_void(
            to_authorize,
            Auth::at(auth_contract_address).do_private_authorized_thing(),
        );
    };
    authorized_becomes_effective_after_delay();

    let expected_timestamp_of_second_change =
        expected_timestamp_of_first_change + Auth::CHANGE_AUTHORIZED_DELAY;

    let authorize_other = || {
        let _ = env.call_public_void(admin, Auth::at(auth_contract_address).set_authorized(other));

        let (scheduled_authorized, timestamp_of_change) =
            env.view_public(Auth::at(auth_contract_address).get_scheduled_authorized());
        assert_eq(scheduled_authorized, other);
        assert_eq(timestamp_of_change, expected_timestamp_of_second_change);

        // We have not yet crossed the timestamp of change, so the authorized address is still set to `to_authorize`
        // and not to `other`.
        let authorized: AztecAddress =
            env.view_public(Auth::at(auth_contract_address).get_authorized());
        assert_eq(authorized, to_authorize);

        let _ = env.call_private_void(
            to_authorize,
            Auth::at(auth_contract_address).do_private_authorized_thing(),
        );

        env.assert_private_call_fails(Auth::at(auth_contract_address).do_private_authorized_thing());
    };
    authorize_other();

    let authorized_becomes_effective_after_delay_again = || {
        // We advance the block to the timestamp of the second change.
        env.set_next_block_timestamp(expected_timestamp_of_second_change);
        let authorized = env.view_public(Auth::at(auth_contract_address).get_authorized());
        assert_eq(authorized, other);

        let authorized_in_private = env.view_private(
            to_authorize,
            Auth::at(auth_contract_address).get_authorized_in_private(),
        );
        assert_eq(authorized_in_private, to_authorize);

        env.mine_block();
        let authorized_in_private_again =
            env.view_private(other, Auth::at(auth_contract_address).get_authorized_in_private());
        assert_eq(authorized_in_private_again, other);

        env.assert_private_call_fails(Auth::at(auth_contract_address).do_private_authorized_thing());

        let _ = env.call_private_void(
            other,
            Auth::at(auth_contract_address).do_private_authorized_thing(),
        );
    };
    authorized_becomes_effective_after_delay_again();
}
