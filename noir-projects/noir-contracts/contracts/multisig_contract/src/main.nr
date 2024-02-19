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
        note::{note_header::NoteHeader, utils as note_utils}, oracle::get_public_key::get_public_key,
        state_vars::singleton::Singleton
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
        // Load public key from storage
        let storage = Storage::init(Context::private(context));
        let state = storage.state.get_note(/*broadcast=*/ true);

        let owners_from_pxe: [Field; MAX_MULTISIG_OWNERS] = pop_capsule();
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

                let result = context.call_private_function(
                    AztecAddress::from_field(owner),
                    is_valid_selector,
                    [message_field]
                )[0];

                assert(result == IS_VALID_SELECTOR, "Invalid auth");
            }
        }
        assert(auths_collected >= state.threshold, "Not enough auths");

        context.push_new_nullifier(message_field, /*nullified_commitment=*/ 0);

        true
    }
}
global PLO: Field = 53438638232309528389504892708671455233;
global PHI: Field = 64323764613183177041862057485226039389;

global TWO_POW_128: Field = 0x100000000000000000000000000000000;

unconstrained fn decompose_unsafe(x: Field) -> (Field, Field) {
    let x_bytes = x.to_le_bytes(32);

    let mut low: Field = 0;
    let mut high: Field = 0;

    let mut offset = 1;
    for i in 0..16 {
        low += (x_bytes[i] as Field) * offset;
        high += (x_bytes[i + 16] as Field) * offset;
        offset *= 256;
    }

    (low, high)
}

/// Decompose a single field into two 16 byte fields.
// pub fn decompose(x: Field) -> (Field, Field) {
//     // Take hints of the decomposition
//     let (xlo, xhi) = decompose_unsafe(x);
//     let borrow = lt_unsafe(PLO, xlo, 16);

//     // Range check the limbs
//     xlo.assert_max_bit_size(128);
//     xhi.assert_max_bit_size(128);

//     // Check that the decomposition is correct
//     assert_eq(x, xlo + TWO_POW_128 * xhi);

//     // Check that (xlo < plo && xhi <= phi) || (xlo >= plo && xhi < phi)
//     let rlo = PLO - xlo + (borrow as Field) * TWO_POW_128;
//     let rhi = PHI - xhi - (borrow as Field);

//     rlo.assert_max_bit_size(128);
//     rhi.assert_max_bit_size(128);

//     (xlo, xhi)
// }
fn field_to_grumpkin_private_key(val: Field) -> GrumpkinPrivateKey {
    let bytes = val.to_be_bytes(32);
    let mut v = 1;
    let mut high = 0;
    let mut low = 0;

    for i in 0..16 {
        high = high + (bytes[15 - i] as Field) * v;
        low = low + (bytes[16 + 15 - i] as Field) * v;
        v = v * 256;
    }

    GrumpkinPrivateKey { high, low }
}

