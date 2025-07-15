mod util;
mod auth_oracle;

use dep::aztec::macros::aztec;

#[aztec]
pub contract SchnorrSingleKeyAccount {
    use dep::aztec::{
        authwit::{account::AccountActions, entrypoint::{app::AppPayload, fee::FeePayload}},
        context::PrivateContext,
        oracle::notes::set_sender_for_tags,
    };

    use crate::{auth_oracle::get_auth_witness, util::recover_address};

    use dep::aztec::macros::functions::{private, view};

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
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Safety: The witness is only used as a "magical value" that makes the signature verification
        // in `recover_address` and the address check below pass. Hence it's safe.
        let witness = unsafe { get_auth_witness(outer_hash) };
        recover_address(outer_hash, witness).eq(context.this_address())
    }
}
