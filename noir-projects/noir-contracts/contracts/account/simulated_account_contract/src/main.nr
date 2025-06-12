mod public_key_note;

use dep::aztec::macros::aztec;

#[aztec]
pub contract SimulatedAccount {
    use dep::authwit::{
        account::AccountActions,
        auth::IS_VALID_SELECTOR,
        entrypoint::{app::AppPayload, fee::FeePayload},
    };
    use dep::aztec::{
        macros::{functions::{private, view}, storage::storage},
        oracle::offchain_message::emit_offchain_message,
        prelude::{PrivateContext, PrivateImmutable},
    };

    use crate::public_key_note::PublicKeyNote;

    #[storage]
    struct Storage<Context> {
        signing_public_key: PrivateImmutable<PublicKeyNote, Context>,
    }

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[private]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload, cancellable);
    }

    #[private]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        emit_offchain_message(inner_hash, context.msg_sender());
        IS_VALID_SELECTOR
    }

    #[contract_library_method]
    fn is_valid_impl(_context: &mut PrivateContext, _outer_hash: Field) -> bool {
        true
    }
}
