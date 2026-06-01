mod public_key_note;

// Account contract that uses Schnorr signatures for authentication.
// The signing key is stored in an immutable private note and should be different from the encryption/nullifying key.
use aztec::macros::aztec;

#[aztec]
pub contract SchnorrAccount {
    use aztec::{
        authwit::{
            account::AccountActions,
            auth::{compute_authwit_message_hash, compute_authwit_nullifier},
            entrypoint::app::AppPayload,
        },
        context::PrivateContext,
        hash::compute_siloed_nullifier,
        macros::{functions::{allow_phase_change, external, initializer, noinitcheck, view}, storage::storage},
        messages::message_delivery::MessageDelivery,
        oracle::{
            auth_witness::get_auth_witness, get_nullifier_membership_witness::get_low_nullifier_membership_witness,
            notes::set_sender_for_tags,
        },
        protocol::address::AztecAddress,
        state_vars::SinglePrivateImmutable,
    };

    use crate::public_key_note::PublicKeyNote;

    #[storage]
    struct Storage<Context> {
        signing_public_key: SinglePrivateImmutable<PublicKeyNote, Context>,
    }

    // Constructs the contract
    #[external("private")]
    #[initializer]
    fn constructor(signing_pub_key_x: Field, signing_pub_key_y: Field) {
        let pub_key_note = PublicKeyNote { x: signing_pub_key_x, y: signing_pub_key_y };

        // We set the sender for tags to this contract so the user can find the deployment note without having to
        // register the account deployer as a sender in their PXE. The override is scoped to this constructor call
        // and does not leak back into the deployer or sideways into sibling calls.
        // Safety: The sender for tags is only used to compute unconstrained shared secrets for emitting logs, so it
        // is safe to set from a constrained context.
        unsafe { set_sender_for_tags(self.address) };
        // The note message gets delivered to the note owner which is set by the SinglePrivateImmutable to be this
        // contract.
        self.storage.signing_public_key.initialize(pub_key_note).deliver(MessageDelivery::onchain_constrained());
    }

    // @dev: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts file
    // (specifically `getEntrypointAbi()`).
    // using noinitcheck is an optimization, it reduces gates by omitting a check that the contract has been initialized
    #[external("private")]
    #[noinitcheck]
    #[allow_phase_change]
    fn entrypoint(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payment_method, cancellable);
    }

    #[external("private")]
    #[noinitcheck]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // docs:start:is_valid_impl
        // Load public key from storage
        let storage = Storage::init(context);
        let public_key = storage.signing_public_key.get_note();

        // Safety: The witness is only used as a "magical value" that makes the signature verification below pass.
        // Hence it's safe.
        let limbs: [Field; 4] = unsafe { get_auth_witness(outer_hash) };
        let signature = (
            std::embedded_curve_ops::EmbeddedCurveScalar::new(limbs[0], limbs[1]),
            std::embedded_curve_ops::EmbeddedCurveScalar::new(limbs[2], limbs[3]),
        );

        let pub_key = std::embedded_curve_ops::EmbeddedCurvePoint { x: public_key.x, y: public_key.y };
        // Verify signature of the payload bytes
        schnorr::verify_signature(pub_key, signature, outer_hash)
        // docs:end:is_valid_impl
    }

    /// @notice Helper function to check validity of private authwitnesses
    /// @param consumer The address of the consumer of the message
    /// @param message_hash The message hash of the message to check the validity
    /// @return True if the message_hash can be consumed, false otherwise
    #[external("utility")]
    unconstrained fn lookup_validity(consumer: AztecAddress, inner_hash: Field) -> bool {
        let public_key = self.storage.signing_public_key.view_note();

        let message_hash = compute_authwit_message_hash(
            consumer,
            self.context.chain_id(),
            self.context.version(),
            inner_hash,
        );

        let limbs: [Field; 4] = get_auth_witness(message_hash);
        let signature = (
            std::embedded_curve_ops::EmbeddedCurveScalar::new(limbs[0], limbs[1]),
            std::embedded_curve_ops::EmbeddedCurveScalar::new(limbs[2], limbs[3]),
        );
        let pub_key = std::embedded_curve_ops::EmbeddedCurvePoint { x: public_key.x, y: public_key.y };
        let valid_in_private = schnorr::verify_signature(pub_key, signature, message_hash);

        // Compute the nullifier and check if it is spent
        // This will BLINDLY TRUST the oracle, but the oracle is us, and
        // it is not as part of execution of the contract, so we are good.
        let nullifier = compute_authwit_nullifier(self.address, inner_hash);
        let siloed_nullifier = compute_siloed_nullifier(consumer, nullifier);
        let (low_leaf_preimage, _witness) =
            get_low_nullifier_membership_witness(self.context.block_header(), siloed_nullifier);
        let is_spent = low_leaf_preimage.nullifier == siloed_nullifier;

        !is_spent & valid_in_private
    }
}
