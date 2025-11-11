use types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::MAX_NULLIFIERS_PER_TX, side_effect::Ordered, utils::arrays::find_first_index,
};

// This is mainly for ensuring that for any nullifier that links to a note hash,
// it is created _after_ the note hash.
// This is enforced for transient data when they are squashed in the reset circuit.
// But if a pair is not transient, their counters will be checked here.
// Why would we have a (nullifier, pending note) pair that is non-transient?
// When a pending note hash is non-revertible and its nullifier is revertible, we can't
// squash them, but we still need to perform this check on their counters.
// A nice side effect of this check is that it also makes sure all the transient data is squashed:
// In aztec-nr, if a contract is emitting a nullifier for a non-revertible note
// hash, or if it doesn't want to squash the note hash at all (to keep a full record
// of what had happened, for example), it could set the nullifier.note_hash to be
// the _siloed_ note hash (or not set it at all).
// When we run this function (in the tail), because the non-squashed note hashes
// are already siloed in the reset circuit, the nullifiers that map to non-transient
// note hashes will match up with those _siloed_ note hashes. But for nullifiers
// that should already have been squashed against a transient (not siloed) note
// hash, they won't be able to find a match.
pub fn validate_no_transient_data(previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs) {
    // Safety: the below hints are constrained by the following methods. See private_kernel_inner for use.
    let note_hash_index_for_each_nullifier =
        unsafe { get_note_hash_index_for_each_nullifier(previous_kernel_public_inputs) };

    let nullifiers = previous_kernel_public_inputs.end.nullifiers;
    let note_hashes = previous_kernel_public_inputs.end.note_hashes;
    for i in 0..nullifiers.array.len() {
        let nullifier = nullifiers.array[i];
        let nullified_note_hash = nullifier.innermost().note_hash;
        if nullified_note_hash != 0 {
            let note_hash = note_hashes.array[note_hash_index_for_each_nullifier[i]];
            assert_eq(
                note_hash.innermost(),
                nullified_note_hash,
                "Hinted siloed note hash does not match nullified note hash",
            );
            assert(
                note_hash.counter() < nullifier.counter(),
                "Cannot link a note hash emitted after a nullifier",
            );
            // No need to verify logs linked to a note hash are squashed.
            // When a note hash is squashed, all associated logs are guaranteed to be removed.
            // See reset/transient_data/transient_data_validator.nr for details.
        }
    }
}

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
unconstrained fn get_note_hash_index_for_each_nullifier(
    previous_kernel: PrivateKernelCircuitPublicInputs,
) -> [u32; MAX_NULLIFIERS_PER_TX] {
    // Q: there's no "null" value, so how do we distinguish between "null" and transient note_hash index 0?
    let mut note_hash_index_for_each_nullifier = [0; MAX_NULLIFIERS_PER_TX];
    let note_hashes = previous_kernel.end.note_hashes;
    let nullifiers = previous_kernel.end.nullifiers;
    for i in 0..nullifiers.array.len() {
        let nullified_note_hash = nullifiers.array[i].innermost().note_hash;
        let note_hash_index =
            find_first_index(note_hashes.array, |n| n.innermost() == nullified_note_hash);
        if (nullified_note_hash != 0) & (note_hash_index != note_hashes.array.len()) {
            note_hash_index_for_each_nullifier[i] = note_hash_index;
        }
    }

    note_hash_index_for_each_nullifier
}
