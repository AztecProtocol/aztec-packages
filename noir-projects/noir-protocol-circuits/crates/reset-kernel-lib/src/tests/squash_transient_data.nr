use dep::types::abis::{note_hash::ScopedNoteHash, nullifier::ScopedNullifier, log_hash::NoteLogHash};

unconstrained pub fn squash_transient_data<M, N, P>(
    note_hashes: [ScopedNoteHash; M],
    nullifiers: [ScopedNullifier; N],
    logs: [NoteLogHash; P]
) -> ([ScopedNoteHash; M], [ScopedNullifier; N], [NoteLogHash; P]) {
    let mut final_note_hashes = [ScopedNoteHash::empty(); M];
    let mut num_note_hashes = 0;
    for i in 0..note_hashes.len() {
        let note_hash = note_hashes[i];
        let nullified = nullifiers.any(|n: ScopedNullifier| (n.nullified_note_hash() == note_hash.note_hash.value));
        if !nullified {
            final_note_hashes[num_note_hashes] = note_hash;
            num_note_hashes += 1;
        }
    }

    let mut final_nullifiers = [ScopedNullifier::empty(); N];
    let mut num_nullifiers = 0;
    for i in 0..N {
        let nullifier = nullifiers[i];
        if nullifier.nullified_note_hash() == 0 {
            final_nullifiers[num_nullifiers] = nullifier;
            num_nullifiers += 1;
        }
    }

    let mut final_logs = [NoteLogHash::empty(); P];
    let mut num_logs = 0;
    for i in 0..logs.len() {
        let mut log = logs[i];
        let found_matching_note_hash = final_note_hashes.any(|n: ScopedNoteHash| (n.counter() == log.note_hash_counter));
        if found_matching_note_hash {
            final_logs[num_logs] = log;
            num_logs += 1;
        }
    }

    (final_note_hashes, final_nullifiers, final_logs)
}
