use super::{
    asserted_note::AssertedNote,
    da::{
        extract_metadata_da_component, extract_tee_exit_message_hashes_da_component,
        extract_tee_notes_da_component, extract_tee_required_nullifiers_da_component, MAX_EFFECTS,
        MAX_EXITS, TEEMetadata,
    },
    schnorr::Signature,
};
use aztec::{
    context::UtilityContext,
    note::note_interface::NoteHash,
    protocol::{
        address::AztecAddress,
        blob_data::TxEffect,
        constants::MAX_NOTE_HASHES_PER_TX,
        hash::{
            compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash,
            poseidon2_hash,
        },
        traits::{Deserialize, Hash, Serialize},
    },
    state_vars::{Map, PublicMutable, StateVariable},
};

// Domain separator for TEE signatures. Prepended to the signed preimage so a signature produced
// for a note attestation cannot be reused as an exit attestation (or vice versa). Mirrors
// TeeSigDomain in yarn-project/end-to-end/src/tee/types.ts - keep in sync.
pub global TEE_SIG_DOMAIN_NOTE: Field = 0;
pub global TEE_SIG_DOMAIN_EXIT: Field = 1;

#[derive(Deserialize, Eq, Serialize)]
struct TeeSignedData {
    domain: Field,
    anchor_block_hash: Field,
    token_address: AztecAddress,
    signed_commitment: Field,
    required_nullifiers: [Field; MAX_EFFECTS],
    tee_notes: [Field; MAX_EFFECTS],
    exit_message_hashes: [Field; MAX_EXITS],
}

struct DAComponents {
    tee_notes: [Field; MAX_EFFECTS],
    required_nullifiers: [Field; MAX_EFFECTS],
    exit_message_hashes: [Field; MAX_EXITS],
    metadata: TEEMetadata,
}

impl DAComponents {
    fn from_effect(effect: TxEffect) -> Option<DAComponents> {
        let tee_notes = extract_tee_notes_da_component(effect);
        let metadata = extract_metadata_da_component(effect);
        let required_nullifiers = extract_tee_required_nullifiers_da_component(effect);
        let exit_message_hashes = extract_tee_exit_message_hashes_da_component(effect);

        if tee_notes.is_none()
            | metadata.is_none()
            | required_nullifiers.is_none()
            | exit_message_hashes.is_none() {
            Option::none()
        } else {
            Option::some(
                DAComponents {
                    tee_notes: tee_notes.unwrap_unchecked(),
                    metadata: metadata.unwrap_unchecked(),
                    required_nullifiers: required_nullifiers.unwrap_unchecked(),
                    exit_message_hashes: exit_message_hashes.unwrap_unchecked(),
                },
            )
        }
    }
}

fn validate_signature(
    signature: Signature,
    domain: Field,
    contract_address: AztecAddress,
    signed_commitment: Field,
    da_components: DAComponents,
) -> bool {
    let signed_data = TeeSignedData {
        domain,
        anchor_block_hash: da_components.metadata.anchor_block_hash,
        token_address: contract_address,
        signed_commitment,
        required_nullifiers: da_components.required_nullifiers,
        tee_notes: da_components.tee_notes,
        exit_message_hashes: da_components.exit_message_hashes,
    };

    aztec::protocol::logging::debug_log("Validating signature");

    aztec::protocol::logging::debug_log_format(
        "Public key: {0}, {1}",
        [da_components.metadata.pub_key_x, da_components.metadata.pub_key_y],
    );
    aztec::protocol::logging::debug_log_format("Signature: {}", signature.serialize());
    aztec::protocol::logging::debug_log_format("Signed data: {}", signed_data.serialize());

    crate::schnorr::verify(
        da_components.metadata.pub_key_x,
        da_components.metadata.pub_key_y,
        signature,
        signed_data.serialize(),
    )
}

fn validate_siloed_vs_unique_note_hash(siloed_note_hash: Field, effect: TxEffect) -> bool {
    let first_nullifier_in_tx = effect.nullifiers[0];
    let mut matching_count = 0;
    for i in 0..MAX_NOTE_HASHES_PER_TX {
        let nonce_for_i = compute_note_hash_nonce(first_nullifier_in_tx, i);
        let unique_note_hash_for_i = compute_unique_note_hash(nonce_for_i, siloed_note_hash);
        if effect.note_hashes[i] == unique_note_hash_for_i {
            matching_count += 1;
        }
    }
    // The siloed note hash must be used exactly once in the transaction.
    matching_count == 1
}

fn validate_required_nullifiers<let N: u32>(
    required_nullifiers: [Field; N],
    effect: TxEffect,
) -> bool {
    let mut valid = true;
    for i in 0..N {
        let required_nullifier = required_nullifiers[i];
        if (required_nullifier != 0) {
            valid =
                valid & (count_appearances_in_array(effect.nullifiers, required_nullifier) == 1);
        }
    }
    valid
}

fn validate_siloed_note_hash_in_tee_notes<let N: u32>(
    siloed_note_hash: Field,
    tee_notes: [Field; N],
) -> bool {
    count_appearances_in_array(tee_notes, siloed_note_hash) == 1
}

// Mirrors validateExitMessageHashesInL2ToL1Msgs in yarn-project/end-to-end/src/tee/signer.ts.
// We do the whole TEE dance because we can't fully trust the outbox - it inherits trust from
// circuits that may be buggy. So independently verify that every exit the TEE attested in the
// creation preimage actually shows up as an L2->L1 message in the creation tx's effects.
fn validate_exit_message_hashes_in_l2_to_l1_msgs<let N: u32>(
    exit_message_hashes: [Field; N],
    effect: TxEffect,
) -> bool {
    let mut valid = true;
    for i in 0..N {
        let exit_message_hash = exit_message_hashes[i];
        if (exit_message_hash != 0) {
            valid =
                valid & (count_appearances_in_array(effect.l2_to_l1_msgs, exit_message_hash) == 1);
        }
    }
    valid
}

global APPROVED_SIGNERS_SLOT: Field = 4;

unconstrained fn validate_signer_registration(metadata: TEEMetadata) -> bool {
    let util_ctx = UtilityContext::new();
    let approved_signers: Map<Field, PublicMutable<bool, UtilityContext>, UtilityContext> =
        Map::new(util_ctx, APPROVED_SIGNERS_SLOT);
    let signer_key = poseidon2_hash([metadata.pub_key_x, metadata.pub_key_y]);
    approved_signers.at(signer_key).read()
}

unconstrained fn validate_anchor_block_hash_in_the_past(metadata: TEEMetadata) -> bool {
    let pxe_head_header = UtilityContext::new().block_header();
    // Accept the PXE head as well: its archive only contains strictly earlier blocks.
    (pxe_head_header.hash() == metadata.anchor_block_hash)
        | aztec::oracle::get_membership_witness::is_block_in_archive(
            pxe_head_header,
            metadata.anchor_block_hash,
        )
}

pub unconstrained fn validate_note(
    note: AssertedNote,
    contract_address: AztecAddress,
    storage_slot: Field,
    owner: AztecAddress,
    tx_hash: Field,
) -> bool {
    let inner_note_hash = note.compute_note_hash(owner, storage_slot, note.randomness);
    let siloed_note_hash = compute_siloed_note_hash(contract_address, inner_note_hash);

    let maybe_effect = aztec::oracle::message_processing::get_tx_effect(tx_hash);
    if maybe_effect.is_none() {
        false
    } else {
        let effect = maybe_effect.unwrap();
        aztec::protocol::logging::debug_log_format(
            "Fetched tx effect for {0}: revert_code={1}, fee={2}, first_nullifier={3}, randomness={4}",
            [
                effect.tx_hash,
                effect.revert_code as Field,
                effect.transaction_fee,
                effect.nullifiers[0],
                note.randomness,
            ],
        );

        let da_components = DAComponents::from_effect(effect);

        if da_components.is_none() {
            false
        } else {
            let da_components = da_components.unwrap_unchecked();

            validate_signature(
                note.signature,
                TEE_SIG_DOMAIN_NOTE,
                contract_address,
                siloed_note_hash,
                da_components,
            )
                & validate_siloed_vs_unique_note_hash(siloed_note_hash, effect)
                & validate_required_nullifiers(da_components.required_nullifiers, effect)
                & validate_siloed_note_hash_in_tee_notes(siloed_note_hash, da_components.tee_notes)
                & validate_exit_message_hashes_in_l2_to_l1_msgs(
                    da_components.exit_message_hashes,
                    effect,
                )
                & validate_signer_registration(da_components.metadata)
                & validate_anchor_block_hash_in_the_past(da_components.metadata)
        }
    }
}

fn count_appearances_in_array<T: Eq, let N: u32>(array: [T; N], value: T) -> u32 {
    let mut count = 0;
    for i in 0..N {
        if array[i] == value {
            count += 1;
        }
    }
    count
}
