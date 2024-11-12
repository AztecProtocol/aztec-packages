use crate::components::public_tail_output_composer::generate_output_hints::OutputHints;
use dep::types::{
    abis::{
        accumulated_data::{CombinedAccumulatedData, PublicAccumulatedData},
        log_hash::{LogHash, ScopedLogHash},
        nullifier::Nullifier,
        public_data_update_request::PublicDataUpdateRequest,
        public_data_write::PublicDataWrite,
    },
    constants::{MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_NOTE_HASHES_PER_TX},
    hash::silo_note_hash,
    utils::arrays::{array_merge, dedupe_array, sort_by_counter_asc},
};

pub unconstrained fn combine_data<let NUM_PUBLIC_DATA_LEAVES: u32>(
    non_revertible: PublicAccumulatedData,
    revertible: PublicAccumulatedData,
    output_hints: OutputHints<NUM_PUBLIC_DATA_LEAVES>,
) -> CombinedAccumulatedData {
    // Note hashes.
    let mut siloed_note_hashes = [0; MAX_NOTE_HASHES_PER_TX];
    let sorted_unsiloed_note_hashes = sort_by_counter_asc(array_merge(
        non_revertible.note_hashes,
        revertible.note_hashes,
    ));
    let tx_hash = non_revertible.nullifiers[0].value;
    for i in 0..sorted_unsiloed_note_hashes.len() {
        let note_hash = sorted_unsiloed_note_hashes[i];
        siloed_note_hashes[i] = if note_hash.counter() == 0 {
            // If counter is zero, the note hash is either empty or is emitted from private and has been siloed in private_kernel_tail_to_public.
            note_hash.value()
        } else {
            silo_note_hash(note_hash, tx_hash, i)
        };
    }

    let nullifiers = sort_by_counter_asc(array_merge(
        non_revertible.nullifiers,
        revertible.nullifiers,
    ))
        .map(|n: Nullifier| n.value);

    let l2_to_l1_msgs = sort_by_counter_asc(array_merge(
        non_revertible.l2_to_l1_msgs,
        revertible.l2_to_l1_msgs,
    ));

    let public_data_writes = dedupe_array(output_hints.public_data_writes).map(
        |w: PublicDataUpdateRequest| {
            PublicDataWrite { leaf_slot: w.leaf_slot, value: w.new_value }
        },
    );

    let note_encrypted_logs_hashes = sort_by_counter_asc(array_merge(
        non_revertible.note_encrypted_logs_hashes,
        revertible.note_encrypted_logs_hashes,
    ));
    let note_encrypted_log_preimages_length =
        note_encrypted_logs_hashes.fold(0, |a, b: LogHash| a + b.length);

    let encrypted_logs_hashes = sort_by_counter_asc(array_merge(
        non_revertible.encrypted_logs_hashes,
        revertible.encrypted_logs_hashes,
    ));
    let encrypted_log_preimages_length =
        encrypted_logs_hashes.fold(0, |a, b: ScopedLogHash| a + b.log_hash.length);

    let unencrypted_logs_hashes = sort_by_counter_asc(array_merge(
        non_revertible.unencrypted_logs_hashes,
        revertible.unencrypted_logs_hashes,
    ));
    let unencrypted_log_preimages_length =
        unencrypted_logs_hashes.fold(0, |a, b: ScopedLogHash| a + b.log_hash.length);

    CombinedAccumulatedData {
        note_hashes: siloed_note_hashes,
        nullifiers,
        l2_to_l1_msgs,
        note_encrypted_logs_hashes,
        encrypted_logs_hashes,
        unencrypted_logs_hashes,
        contract_class_logs_hashes: [ScopedLogHash::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
        note_encrypted_log_preimages_length,
        encrypted_log_preimages_length,
        unencrypted_log_preimages_length,
        contract_class_log_preimages_length: 0,
        public_data_writes,
        gas_used: revertible.gas_used + non_revertible.gas_used,
    }
}
