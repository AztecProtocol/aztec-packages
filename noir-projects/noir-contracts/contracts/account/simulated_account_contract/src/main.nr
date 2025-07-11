use dep::aztec::macros::aztec;

// Account contract that does not perform any authentication, typically used to override a *real* account contract
// in a simulation. This avoids the need of generating real signatures during simulation.
// It will also consider all authwits sent to it as valid and emit the hash in an offchain effect
// for later verification. In order to properly mimic our account contract it imports the PublickKeyNote
// struct so the #[aztec] macro can generate a `sync_private_state` implementation that can process the *real*
// public key of the overridden contract
#[aztec]
pub contract SimulatedAccount {
    use dep::aztec::{
        authwit::{
            account::AccountActions,
            auth::IS_VALID_SELECTOR,
            entrypoint::{app::AppPayload, fee::FeePayload},
        },
        context::PrivateContext,
        macros::functions::{private, view},
        messages::discovery::NoteHashAndNullifier,
        protocol_types::address::AztecAddress,
    };

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[private]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload, cancellable);
    }

    #[private]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        IS_VALID_SELECTOR
    }

    #[contract_library_method]
    fn is_valid_impl(_context: &mut PrivateContext, _outer_hash: Field) -> bool {
        true
    }

    #[contract_library_method]
    unconstrained fn _compute_note_hash_and_nullifier(
        _packed_note: BoundedVec<Field, 12>,
        _storage_slot: Field,
        note_type_id: Field,
        _contract_address: AztecAddress,
        _note_nonce: Field,
    ) -> Option<NoteHashAndNullifier> {
        if note_type_id == 0 {
            Option::some(NoteHashAndNullifier { note_hash: 0, inner_nullifier: 0 })
        } else {
            Option::<NoteHashAndNullifier>::none()
        }
    }
}
