mod multisig_note;
mod capsule;

use dep::protocol_circuits::{grumpkin_point::GrumpkinPoint};
use dep::protocol_circuits::grumpkin_private_key::GrumpkinPrivateKey;
use dep::std::{cmp::Eq, grumpkin_scalar::GrumpkinScalar, grumpkin_scalar_mul::grumpkin_fixed_base};

fn compute_public_key(private_key: Field) -> GrumpkinPoint {
    let (low, high) = dep::std::field::bn254::decompose(private_key);
    let public_key = grumpkin_fixed_base(GrumpkinScalar { high, low });
    GrumpkinPoint { x: public_key[0], y: public_key[1] }
}

contract MultiSigAccount {
    use dep::aztec::protocol_types::{abis::call_context::CallContext, address::AztecAddress, abis::function_selector::FunctionSelector};
    use crate::compute_public_key;

    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        note::{note_header::NoteHeader, utils as note_utils}, 
        oracle::get_public_key::get_public_key,
        state_vars::singleton::Singleton,
        oracle::debug_log::{debug_log_format, debug_log_array_with_prefix}
    };
    use dep::authwit::{
        auth::IS_VALID_SELECTOR, entrypoint::{app::AppPayload, fee::FeePayload},
        account::AccountActions, auth_witness::get_auth_witness
    };

    use crate::multisig_note::{MultiSigNote, MAX_MULTISIG_OWNERS};
    use crate::capsule::pop_capsule;
    use dep::std::{cmp::Eq, grumpkin_scalar::GrumpkinScalar, grumpkin_scalar_mul::grumpkin_fixed_base};

    struct Storage {
        // Warning: this will be nullified on every read.
        // There are alternatives: ImmutableSingleton, Slow update trees.
        state: Singleton<MultiSigNote>,
    }

    global ACCOUNT_ACTIONS_STORAGE_SLOT = 2;

    #[aztec(private)]
    fn constructor(owners: [AztecAddress; MAX_MULTISIG_OWNERS], private_key: Field, threshold: u8) {
        let contract_address = context.this_address();
        assert(
            compute_public_key(private_key).eq(get_public_key(contract_address)), "Mismatching private key"
        );
        let mut note = MultiSigNote::new(owners, private_key, threshold, contract_address);
        storage.state.initialize(&mut note, /*broadcast=*/ true);
    }

    // Note: If you globally change the entrypoint signature don't forget to update default_entrypoint.ts
    #[aztec(private)]
    fn entrypoint(app_payload: pub AppPayload, fee_payload: pub FeePayload) {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload);
    }

    // add owners

    // remove owners

    // rotate private key

    // change threshold

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

    #[aztec(public)]
    internal fn set_is_valid_storage(message_hash: Field, value: bool) {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.internal_set_is_valid_storage(message_hash, value)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, message_field: Field) -> bool {
        debug_log_format("MultisigAccount.is_valid_impl message_field={0}", [message_field]);

        let storage = Storage::init(Context::private(context));
        let state = storage.state.get_note(/*broadcast=*/ true);

        let owners_from_pxe: [Field; MAX_MULTISIG_OWNERS] = pop_capsule();
        debug_log_array_with_prefix("MultisigAccount.is_valid_impl owners_from_pxe=", owners_from_pxe);
        let mut auths_collected : u8 = 0;
        let owners = state.owners;
        let is_valid_selector = FunctionSelector::from_field(IS_VALID_SELECTOR);
        for owner in owners_from_pxe {
            let mut is_in_state = false;
            if owner != 0 {
                for state_owner in owners {
                    if (state_owner.eq(AztecAddress::from_field(owner))) {
                        is_in_state = true;
                    }
                    auths_collected += is_in_state as u8;
                }

                let message_field_for_owner = dep::aztec::protocol_types::hash::pedersen_hash([message_field, owner.to_field()], 0);
                debug_log_format("MultisigAccount.is_valid_impl owner={0} is_in_state={1} message_field_for_owner={2}", [owner, is_in_state as Field, message_field_for_owner]);
                let result = context.call_private_function(
                    AztecAddress::from_field(owner),
                    is_valid_selector,
                    [message_field_for_owner]
                )[0];

                assert(result == IS_VALID_SELECTOR, "Invalid auth");
            }
        }

        debug_log_format("MultisigAccount.is_valid_impl auths_collected={0}", [auths_collected as Field]);
        assert(auths_collected >= state.threshold, "Not enough auths");

        context.push_new_nullifier(message_field, /*nullified_commitment=*/ 0);

        true
    }
}
