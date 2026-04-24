// Account contract that uses Schnorr signatures for authentication using a hardcoded public key.
use aztec::macros::aztec;

#[aztec]
pub contract SchnorrHardcodedAccount {
    use aztec::{
        authwit::{account::AccountActions, entrypoint::app::AppPayload},
        context::PrivateContext,
        macros::functions::{allow_phase_change, external, view},
        oracle::{auth_witness::get_auth_witness_as_bytes, notes::set_sender_for_tags},
    };
    use std::embedded_curve_ops::EmbeddedCurvePoint;

    global signing_public_key: EmbeddedCurvePoint = EmbeddedCurvePoint {
        x: 0x16b93f4afae55cab8507baeb8e7ab4de80f5ab1e9e1f5149bf8cd0d375451d90,
        y: 0x208d44b36eb6e73b254921134d002da1a90b41131024e3b1d721259182106205,
    };

    // @dev: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts (specifically `getEntrypointAbi()`)
    #[external("private")]
    #[allow_phase_change]
    fn entrypoint(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
        // Safety: The sender for tags is only used to compute unconstrained shared secrets for emitting logs.
        // Since this value is only used for unconstrained tagging and not for any constrained logic,
        // it is safe to set from a constrained context.
        unsafe { set_sender_for_tags(self.address) };

        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payment_method, cancellable);
    }

    #[external("private")]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(_context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Safety: The witness is only used as a "magical value" that makes the signature verification below pass.
        // Hence it's safe.
        let signature: [u8; 64] = unsafe { get_auth_witness_as_bytes(outer_hash) };

        // Verify signature using hardcoded public key
        schnorr::verify_signature(
            signing_public_key,
            signature,
            outer_hash.to_be_bytes::<32>(),
        )
    }
}
