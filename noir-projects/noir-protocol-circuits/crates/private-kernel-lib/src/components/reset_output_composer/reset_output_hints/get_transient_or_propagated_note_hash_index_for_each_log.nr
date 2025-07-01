use dep::reset_kernel_lib::TransientDataIndexHint;
use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        private_log::PrivateLogData,
        side_effect::{Ordered, scoped::Scoped},
    },
    utils::arrays::find_index_hint,
};

pub unconstrained fn get_transient_or_propagated_note_hash_index_for_each_log<let NUM_LOGS: u32, let NUM_NOTE_HASHES: u32, let NUM_INDEX_HINTS: u32>(
    logs: [Scoped<PrivateLogData>; NUM_LOGS],
    note_hashes: [ScopedNoteHash; NUM_NOTE_HASHES],
    kept_note_hashes: [ScopedNoteHash; NUM_NOTE_HASHES],
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
) -> [u32; NUM_LOGS] {
    let mut indexes = [0; NUM_LOGS];
    for i in 0..logs.len() {
        let log_note_hash_counter = logs[i].inner.note_hash_counter;
        if log_note_hash_counter != 0 {
            // A nonzero counter implies the log relates to a note_hash.
            // Now we determine whether that note_hash is transient or will be propagated.
            let mut propagated = false;
            for j in 0..kept_note_hashes.len() {
                if !propagated & (kept_note_hashes[j].counter() == log_note_hash_counter) {
                    indexes[i] = j;
                    propagated = true;
                    // break; ?
                    // Can a log correspond to multiple note_hashes? I guess No.
                    // Can a note_hash correspond to multiple logs? Yes.
                }
            }
            if !propagated {
                for j in 0..note_hashes.len() {
                    if note_hashes[j].counter() == log_note_hash_counter {
                        indexes[i] = find_index_hint(
                            transient_data_index_hints,
                            |hint: TransientDataIndexHint| hint.note_hash_index == j,
                        )
                            .unwrap();
                    }
                }
            }
        }
    }

    indexes
}
