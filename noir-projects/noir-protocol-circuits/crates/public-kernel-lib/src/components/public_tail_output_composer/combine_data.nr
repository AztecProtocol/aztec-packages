use crate::components::public_tail_output_composer::generate_output_hints::OutputHints;
use dep::types::{
    abis::{
        accumulated_data::{CombinedAccumulatedData, PublicAccumulatedData},
        log_hash::{LogHash, ScopedLogHash},
        nullifier::Nullifier,
    },
    utils::arrays::{array_merge, dedupe_array, sort_by_counter_asc},
};

pub unconstrained fn combine_data<let NUM_PUBLIC_DATA_LEAVES: u32>(
    non_revertible: PublicAccumulatedData,
    revertible: PublicAccumulatedData,
    output_hints: OutputHints<NUM_PUBLIC_DATA_LEAVES>,
) -> CombinedAccumulatedData {
    let nullifiers = sort_by_counter_asc(array_merge(
        non_revertible.nullifiers,
        revertible.nullifiers,
    ))
        .map(|n: Nullifier| n.value);

    let l2_to_l1_msgs = sort_by_counter_asc(array_merge(
        non_revertible.l2_to_l1_msgs,
        revertible.l2_to_l1_msgs,
    ));

    let public_data_update_requests = dedupe_array(output_hints.public_data_writes);

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
        note_hashes: output_hints.siloed_note_hashes,
        nullifiers,
        l2_to_l1_msgs,
        note_encrypted_logs_hashes,
        encrypted_logs_hashes,
        unencrypted_logs_hashes,
        note_encrypted_log_preimages_length,
        encrypted_log_preimages_length,
        unencrypted_log_preimages_length,
        public_data_update_requests,
        gas_used: revertible.gas_used + non_revertible.gas_used,
    }
}
