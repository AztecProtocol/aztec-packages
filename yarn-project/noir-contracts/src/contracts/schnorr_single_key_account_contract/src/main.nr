mod util;
mod auth_oracle;

use dep::aztec::context::PrivateContext;
use crate::{ util::recover_address, auth_oracle::get_auth_witness };

// Declared outside the contract to work around Noir error
// "entered unreachable code: ICE: Params to the program should only contains numbers and arrays"
fn is_valid_impl(context: &mut PrivateContext, message_hash: Field) -> bool {
    let witness = get_auth_witness(message_hash);
    assert(recover_address(message_hash, witness) == context.this_address());
    true
}

contract SchnorrSingleKeyAccount {
    use dep::std::{
        hash::pedersen_with_separator,
        option::Option,
    };

    use dep::aztec::{
        entrypoint::EntrypointPayload,
        account::AccountActions,
        context::{ PrivateContext, PublicContext, Context },
    };

    use crate::is_valid_impl;

    global ACCOUNT_ACTIONS_STORAGE_SLOT = 1;

    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn entrypoint(payload: pub EntrypointPayload) {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.entrypoint(payload);
    }

    #[aztec(private)]
    fn is_valid(message_hash: Field) -> Field {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.is_valid(message_hash)
    }

    #[aztec(public)]
    fn is_valid_public(message_hash: Field) -> Field {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.is_valid_public(message_hash)
    }

    #[aztec(private)]
    fn set_is_valid_storage(message_hash: Field, value: Field) {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.set_is_valid_storage(message_hash, value)
    }

    #[aztec(public)]
    internal fn internal_set_is_valid_storage(message_hash: Field, value: Field) {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.internal_set_is_valid_storage(message_hash, value)
    }
}