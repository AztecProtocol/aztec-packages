pub mod get_transient_or_propagated_note_hash_index_for_each_log;
pub mod squash_transient_data;

use crate::components::reset_output_composer::reset_output_hints::{
    get_transient_or_propagated_note_hash_index_for_each_log::get_transient_or_propagated_note_hash_index_for_each_log,
    squash_transient_data::squash_transient_data,
};
use dep::reset_kernel_lib::TransientDataIndexHint;
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier, private_log::PrivateLogData, side_effect::scoped::Scoped,
    },
    constants::{MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX},
    utils::arrays::{ClaimedLengthArray, get_order_hints_asc, OrderHint},
};

pub struct ResetOutputHints {
    // note_hashes
    pub kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    pub sorted_kept_note_hash_indexes: [u32; MAX_NOTE_HASHES_PER_TX],
    // nullifiers
    pub kept_nullifiers: ClaimedLengthArray<ScopedNullifier, MAX_NULLIFIERS_PER_TX>,
    pub sorted_kept_nullifier_indexes: [u32; MAX_NULLIFIERS_PER_TX],
    // private_logs
    pub kept_private_logs: ClaimedLengthArray<Scoped<PrivateLogData>, MAX_PRIVATE_LOGS_PER_TX>,
    pub transient_or_propagated_note_hash_index_for_each_log: [u32; MAX_PRIVATE_LOGS_PER_TX],
    pub sorted_kept_private_log_indexes: [u32; MAX_PRIVATE_LOGS_PER_TX],
}

pub unconstrained fn generate_reset_output_hints<let TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32>(
    previous_kernel: PrivateKernelCircuitPublicInputs,
    transient_data_index_hints: [TransientDataIndexHint; TRANSIENT_DATA_SQUASHING_HINTS_LEN],
) -> ResetOutputHints {
    // Splice-removes transient items (as opposed to setting items to "empty" in-place).
    let (kept_note_hashes, kept_nullifiers, kept_private_logs) = squash_transient_data(
        previous_kernel.end.note_hashes,
        previous_kernel.end.nullifiers,
        previous_kernel.end.private_logs,
        transient_data_index_hints,
    );

    // We take the "kept" (propagated) side effects, and sort them by their counter.
    // Or rather, we record for each side_effect where its index will be in a sorted version:

    // E.g.
    // kept note hash indices:        [  0,  1,  2,  3,  4,  5,  6,  7]
    // counters:                      [ 12,  6, 99, 31, 32, 29, 42, 71]
    //
    // sorted counters:               [  6, 12, 29, 31, 32, 42, 71, 99]
    // sorted_kept_note_hash_indexes: [  1,  0,  7,  3,  4,  2,  5,  6]

    // note_hashes
    let sorted_kept_note_hash_indexes =
        get_order_hints_asc(kept_note_hashes.array).map(|h: OrderHint| h.sorted_index);

    // nullifiers
    let sorted_kept_nullifier_indexes =
        get_order_hints_asc(kept_nullifiers.array).map(|h: OrderHint| h.sorted_index);

    // private_logs
    let transient_or_propagated_note_hash_index_for_each_log = get_transient_or_propagated_note_hash_index_for_each_log(
        previous_kernel.end.private_logs.array,
        previous_kernel.end.note_hashes.array,
        kept_note_hashes.array,
        transient_data_index_hints,
    );
    let sorted_kept_private_log_indexes =
        get_order_hints_asc(kept_private_logs.array).map(|h: OrderHint| h.sorted_index);

    ResetOutputHints {
        kept_note_hashes,
        sorted_kept_note_hash_indexes,
        kept_nullifiers,
        sorted_kept_nullifier_indexes,
        kept_private_logs,
        transient_or_propagated_note_hash_index_for_each_log,
        sorted_kept_private_log_indexes,
    }
}
