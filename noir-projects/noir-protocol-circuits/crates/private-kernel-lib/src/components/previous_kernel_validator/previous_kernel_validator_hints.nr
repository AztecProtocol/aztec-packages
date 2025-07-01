use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, note_hash::ScopedNoteHash,
        side_effect::OrderedValue,
    },
    constants::MAX_NULLIFIERS_PER_TX,
    utils::arrays::find_index_hint,
};

pub struct PreviousKernelValidatorHints {
    // Corresponds to the layout of the nullifiers array.
    // For each nullifier in the nullifiers array, it may or may not be nullifying a note
    // from this tx.
    // If it _is_ nullifying a note from this tx, then that note_hash will exist
    // somewhere in the new note_hashes array.
    // For each nullifier, this array gives the index of that note_hash in the new note_hashes array.
    //
    // note_hashes: [   C0, C1,    C2, C3, C4, C5, C6, C7]
    // nullifiers:  [N(C5),  N, N(C3),  N,  N,  0,  0,  0] <-- Notes C5 and C3 are transient notes.
    //
    // this:        [    5,   _,    3,  _,  _,  _,  _,  _] <-- the index of the transient note for each nullifier
    //
    pub transient_note_hash_index_for_each_nullifier: [u32; MAX_NULLIFIERS_PER_TX],
}

pub unconstrained fn generate_previous_kernel_validator_hints(
    previous_kernel: PrivateKernelCircuitPublicInputs,
) -> PreviousKernelValidatorHints {
    // Q: there's no "null" value, so how do we distinguish between "null" and transient note_hash index 0?
    let mut transient_note_hash_index_for_each_nullifier = [0; MAX_NULLIFIERS_PER_TX];
    let note_hashes = previous_kernel.end.note_hashes;
    let nullifiers = previous_kernel.end.nullifiers;
    for i in 0..nullifiers.array.len() {
        let nullified_note_hash = nullifiers.array[i].nullifier.note_hash;
        let maybe_matching_note_hash_index = find_index_hint(
            note_hashes.array,
            |n: ScopedNoteHash| n.value() == nullified_note_hash,
        );
        if (nullified_note_hash != 0) & (maybe_matching_note_hash_index.is_some()) {
            let matching_note_hash_index = maybe_matching_note_hash_index.unwrap_unchecked();
            transient_note_hash_index_for_each_nullifier[i] = matching_note_hash_index;
        }
    }

    PreviousKernelValidatorHints { transient_note_hash_index_for_each_nullifier }
}
