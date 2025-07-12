mod public_key_note;

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
        macros::{functions::{private, view}, storage::storage},
        oracle::notes::set_sender_for_tags,
        state_vars::PrivateImmutable,
    };

    use crate::public_key_note::PublicKeyNote;

    #[storage]
    struct Storage<Context> {
        signing_public_key: PrivateImmutable<PublicKeyNote, Context>,
    }

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[private]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        // Safety: The sender for tags is only used to compute unconstrained shared secrets for emitting logs.
        // Since this value is only used for unconstrained tagging and not for any constrained logic,
        // it is safe to set from a constrained context.
        unsafe { set_sender_for_tags(context.this_address()) };

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
}
