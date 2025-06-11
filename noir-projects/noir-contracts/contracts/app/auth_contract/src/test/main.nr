use crate::Auth;
use crate::test::utils;

use dep::aztec::prelude::AztecAddress;
use dep::aztec::protocol_types::traits::FromField;

global CHANGE_AUTHORIZED_DELAY: u32 = 5;

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

    let admin_sets_authorized = || {
        env.impersonate(admin);
        Auth::at(auth_contract_address).set_authorized(to_authorize).call(&mut env.public());
        env.advance_block_by(1);

        let scheduled_authorized =
            Auth::at(auth_contract_address).get_scheduled_authorized().view(&mut env.public());
        assert_eq(scheduled_authorized, to_authorize);
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

        // We advance block by 4, because the delay is 5, and we initially advanced block by one after setting the value. See below comment for explanation.
        env.advance_block_by(CHANGE_AUTHORIZED_DELAY - 1);
        let authorized = Auth::at(auth_contract_address).get_authorized().view(&mut env.public());
        assert_eq(authorized, to_authorize);

        let authorized_in_private: AztecAddress =
            Auth::at(auth_contract_address).get_authorized_in_private().view(&mut env.private());
        assert_eq(authorized_in_private, AztecAddress::zero());

        // We need to always advance the block one more time to get the current value in private, compared to the value in public.
        // To see why let's see this diagram.
        // When we schedule a change in public, lets say we are at block 2 (building a tx to be included in block 2), which means the latest committed block is block 1.
        // Thus, the value change will be set to block 7 (2 + 5).
        // If we now advance our env by 5 blocks, we will be at block 7 (building a tx to be included in block 7), which means the latest committed block is block 6.
        // Reading the value in public will work, because it will use the current block (7), and the current block is the block of change; but
        // if we try to create a historical proof, we do not have access to block 7 yet, and have to build the proof off of block 6, but at this time, the value change will not have
        // taken place yet, therefore we need to be at block 8 (building a tx to be included in block 8), for the historical proof to work, as it will have access to the full block 7
        // where the value change takes effect.
        // Note: We do not see this behavior in the e2e tests because setting the value inplicitly advances the block number by 1.
        //                              1     2     3     4     5     6     7     8     9
        //                              |     |     |     |     |     |     |     |     |
        //                                 ^
        //                    value change scheduled here
        //                                                                ^
        //                                   get_authorized() (public) called here with block_number = 7
        //                                                                      ^
        //                                        get_authorized() (private) called here with block_number = 8
        env.advance_block_by(1);
        let authorized_in_private_again =
            Auth::at(auth_contract_address).get_authorized_in_private().view(&mut env.private());
        assert_eq(authorized_in_private_again, to_authorize);

        Auth::at(auth_contract_address).do_private_authorized_thing().call(&mut env.private());
    };
    authorized_becomes_effective_after_delay();

    let authorize_other = || {
        env.impersonate(admin);
        Auth::at(auth_contract_address).set_authorized(other).call(&mut env.public());
        env.advance_block_by(1);

        let scheduled_authorized =
            Auth::at(auth_contract_address).get_scheduled_authorized().view(&mut env.public());
        assert_eq(scheduled_authorized, other);

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

        // We advance the block by 4 again like above
        env.advance_block_by(CHANGE_AUTHORIZED_DELAY - 1);
        let authorized = Auth::at(auth_contract_address).get_authorized().view(&mut env.public());
        assert_eq(authorized, other);

        let authorized_in_private =
            Auth::at(auth_contract_address).get_authorized_in_private().view(&mut env.private());
        assert_eq(authorized_in_private, to_authorize);

        env.advance_block_by(1);
        let authorized_in_private_again =
            Auth::at(auth_contract_address).get_authorized_in_private().view(&mut env.private());
        assert_eq(authorized_in_private_again, other);

        env.assert_private_call_fails(Auth::at(auth_contract_address).do_private_authorized_thing());

        env.impersonate(other);
        Auth::at(auth_contract_address).do_private_authorized_thing().call(&mut env.private());
    };
    authorized_becomes_effective_after_delay_again();
}
