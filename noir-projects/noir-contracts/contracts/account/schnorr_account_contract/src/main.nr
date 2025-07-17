mod public_key_note;

// Account contract that uses Schnorr signatures for authentication.
// The signing key is stored in an immutable private note and should be different from the encryption/nullifying key.
use dep::aztec::macros::aztec;

#[aztec]
pub contract SchnorrAccount {
    use dep::aztec::{
        authwit::{
            account::AccountActions,
            auth::{compute_authwit_message_hash, compute_authwit_nullifier},
            entrypoint::{app::AppPayload, fee::FeePayload},
        },
        context::PrivateContext,
        hash::compute_siloed_nullifier,
        macros::{functions::{initializer, noinitcheck, private, utility, view}, storage::storage},
        messages::logs::note::encode_and_encrypt_note,
        oracle::{
            auth_witness::get_auth_witness,
            get_nullifier_membership_witness::get_low_nullifier_membership_witness,
            notes::{get_sender_for_tags, set_sender_for_tags},
        },
        protocol_types::address::AztecAddress,
        state_vars::PrivateImmutable,
    };

    use crate::public_key_note::PublicKeyNote;

    #[storage]
    struct Storage<Context> {
        // docs:start:public_key
        signing_public_key: PrivateImmutable<PublicKeyNote, Context>,
        // docs:end:public_key
    }

    // Constructs the contract
    #[private]
    #[initializer]
    fn constructor(signing_pub_key_x: Field, signing_pub_key_y: Field) {
        let this = context.this_address();
        let pub_key_note = PublicKeyNote::new(signing_pub_key_x, signing_pub_key_y, this);

        // Safety: The sender for tags is only used to compute unconstrained shared secrets for emitting logs.
        // Since this value is only used for unconstrained tagging and not for any constrained logic,
        // it is safe to load from an unconstrained context.
        // TODO(#15752): Improve the sender_for_tags handling here when the original sender is undefined.
        let original_sender = unsafe { get_sender_for_tags().unwrap_or(this) };

        // We set the sender for tags to this contract because we don't want to force the user corresponding to this
        // account to add the account deployer as a sender to their PXE. By setting it to this contract, user's PXE
        // will manage to find the note even if the account deployer is not registered as a sender (i.e
        // `pxe.registerSender(accountDeployer)` was not called)

        // Safety: Comment from above applies here as well.
        unsafe { set_sender_for_tags(this) };
        storage.signing_public_key.initialize(pub_key_note).emit(encode_and_encrypt_note(
            &mut context,
            this,
        ));
        // Safety: Comment from above applies here as well.
        unsafe { set_sender_for_tags(original_sender) };
    }

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts file
    // using noinitcheck is an optimization, it reduces gates by omitting a check that the contract has been initialized
    #[private]
    #[noinitcheck]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        // Safety: The sender for tags is only used to compute unconstrained shared secrets for emitting logs.
        // Since this value is only used for unconstrained tagging and not for any constrained logic,
        // it is safe to set from a constrained context.
        unsafe { set_sender_for_tags(context.this_address()) };

        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload, cancellable);
    }

    #[private]
    #[noinitcheck]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // docs:start:is_valid_impl
        // Load public key from storage
        let storage = Storage::init(context);
        let public_key = storage.signing_public_key.get_note();

        // Load auth witness
        // Safety: The witness is only used as a "magical value" that makes the signature verification below pass.
        // Hence it's safe.
        let witness: [Field; 64] = unsafe { get_auth_witness(outer_hash) };
        let mut signature: [u8; 64] = [0; 64];
        for i in 0..64 {
            signature[i] = witness[i] as u8;
        }

        let pub_key = std::embedded_curve_ops::EmbeddedCurvePoint {
            x: public_key.x,
            y: public_key.y,
            is_infinite: false,
        };
        // Verify signature of the payload bytes
        schnorr::verify_signature(pub_key, signature, outer_hash.to_be_bytes::<32>())
        // docs:end:is_valid_impl
    }

    /**
    * @notice Helper function to check validity of private authwitnesses
    * @param consumer The address of the consumer of the message
    * @param message_hash The message hash of the message to check the validity
    * @return True if the message_hash can be consumed, false otherwise
    */
    #[utility]
    unconstrained fn lookup_validity(consumer: AztecAddress, inner_hash: Field) -> bool {
        let public_key = storage.signing_public_key.view_note();

        let message_hash = compute_authwit_message_hash(
            consumer,
            context.chain_id(),
            context.version(),
            inner_hash,
        );

        let witness: [Field; 64] = get_auth_witness(message_hash);
        let mut signature: [u8; 64] = [0; 64];
        for i in 0..64 {
            signature[i] = witness[i] as u8;
        }
        let pub_key = std::embedded_curve_ops::EmbeddedCurvePoint {
            x: public_key.x,
            y: public_key.y,
            is_infinite: false,
        };
        let valid_in_private =
            schnorr::verify_signature(pub_key, signature, message_hash.to_be_bytes::<32>());

        // Compute the nullifier and check if it is spent
        // This will BLINDLY TRUST the oracle, but the oracle is us, and
        // it is not as part of execution of the contract, so we are good.
        let nullifier = compute_authwit_nullifier(context.this_address(), inner_hash);
        let siloed_nullifier = compute_siloed_nullifier(consumer, nullifier);
        let lower_wit =
            get_low_nullifier_membership_witness(context.block_number(), siloed_nullifier);
        let is_spent = lower_wit.leaf_preimage.nullifier == siloed_nullifier;

        !is_spent & valid_in_private
    }
}
