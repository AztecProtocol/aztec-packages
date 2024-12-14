mod public_key_note;

// Account contract that uses Schnorr signatures for authentication.
// The signing key is stored in an immutable private note and should be different from the encryption/nullifying key.
use dep::aztec::macros::aztec;

#[aztec]
contract SchnorrAccount {
    use dep::authwit::{
        account::AccountActions,
        auth::{compute_authwit_message_hash, compute_authwit_nullifier},
        auth_witness::get_auth_witness,
        entrypoint::{app::AppPayload, fee::FeePayload},
    };
    use dep::aztec::encrypted_logs::encrypted_note_emission::encode_and_encrypt_note;
    use dep::aztec::hash::compute_siloed_nullifier;
    use dep::aztec::macros::{
        functions::{initializer, noinitcheck, private, view},
        storage::storage,
    };
    use dep::aztec::oracle::get_nullifier_membership_witness::get_low_nullifier_membership_witness;
    use dep::aztec::prelude::{AztecAddress, PrivateContext, PrivateImmutable};

    use crate::public_key_note::PublicKeyNote;
    use dep::aztec::protocol_types::constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS};

    #[storage]
    struct Storage<Context> {
        signing_public_key: PrivateImmutable<PublicKeyNote, Context>,
    }

    // Constructs the contract
    #[private]
    #[initializer]
    fn constructor(signing_pub_key_x: Field, signing_pub_key_y: Field) {
        let this = context.this_address();
        let mut pub_key_note = PublicKeyNote::new(signing_pub_key_x, signing_pub_key_y, this);
        storage.signing_public_key.initialize(&mut pub_key_note).emit(encode_and_encrypt_note(
            &mut context,
            this,
            this,
        ));
    }

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts file
    #[private]
    #[noinitcheck]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
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
    unconstrained fn lookup_validity(consumer: AztecAddress, inner_hash: Field) -> pub bool {
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
            std::schnorr::verify_signature(pub_key, signature, message_hash.to_be_bytes::<32>());

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

    unconstrained fn process_logs(
        log_plaintext: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
        tx_hash: Field,
        siloed_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
        recipient: AztecAddress,
    ) {
        dep::aztec::oracle::management::process_log(
            context,
            log_plaintext,
            tx_hash,
            siloed_note_hashes_in_tx,
            recipient,
            |serialized_note_content: BoundedVec<Field, _>, note_header, note_type_id| {
                let hashes = if note_type_id == PublicKeyNote::get_note_type_id() {
                    assert(serialized_note_content.len() == 3);
                    dep::aztec::note::utils::compute_note_hash_and_optionally_a_nullifier(
                        PublicKeyNote::deserialize_content,
                        note_header,
                        true,
                        serialized_note_content.storage(),
                    )
                } else {
                    panic(f"Unknown note type id {note_type_id}")
                };

                Option::some(
                    dep::aztec::oracle::management::NoteHashesAndNullifier {
                        note_hash: hashes[0],
                        siloed_note_hash: hashes[2],
                        inner_nullifier: hashes[3],
                    },
                )
            },
        );
    }
}
