use types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::MAX_NULLIFIERS_PER_TX, side_effect::Ordered, utils::arrays::find_first_index,
};

/// This function serves two key purposes: enforcing ordering and ensuring transient data is fully squashed.
///
/// 1. Ordering
/// For any nullifier that links to a note hash, this function ensures the nullifier is created
/// *after* the corresponding note hash.
///
/// Transient (note hash, nullifier) pairs are squashed in the Reset circuit, so their ordering is
/// implicitly enforced there. However, non-transient pairs are not squashed, so their counters must
/// be checked here to ensure correct ordering.
///
/// A pair may be non-transient if, for example, the note hash is non-revertible while its nullifier
/// is revertible, preventing them from being squashed together.
///
/// 2. Squashing
/// This function ensures that all transient (note hash, nullifier) pairs are properly squashed.
/// Leaving such a pair un-squashed (i.e. emitting it) would enable a double spend: the nullifier
/// derived from a transient note hash differs from the nullifier that would later be derived from
/// the same note once it is settled. Therefore, any un-squashed transient pair must be rejected.
///
/// Mechanism
/// In `aztec-nr`, a contract that emits a nullifier for a non-revertible note hash, or chooses not
/// to squash a note hash (e.g. to preserve a full execution record), sets `nullifier.note_hash` to
/// the *siloed* note hash (or leaves it unset).
///
/// By the time this function runs in the Tail circuit, all non-squashed note hashes have already
/// been siloed in the Reset circuit. As a result, nullifiers that correctly reference non-transient
/// note hashes will match these siloed values.
///
/// In contrast, a nullifier that should have been squashed with a transient (non-siloed) note hash
/// will fail to find a match here.
pub fn validate_unsquashable_note_hash_nullifier_ordering(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
) {
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
            // In most cases, the value check above is sufficient. At this point, note hashes are already siloed,
            // so an app that uses `DOM_SEP__NOTE_HASH` to compute its (inner) note hash is unlikely to collide
            // with another contract's siloed note hash.
            //
            // The contract address check below is mainly a safeguard for apps that do not follow this convention.
            // Without it, a transient nullifier could incorrectly match a siloed note hash from another contract.
            // Such a pair could be emitted and later used to spend the note again by deriving a nullifier from
            // the settled note hash value.
            //
            // Note: This check does not prevent collisions within the same contract.
            assert_eq(
                note_hash.contract_address,
                nullifier.contract_address,
                "Contract address of hinted note hash does not match nullifier",
            );
            assert(
                note_hash.counter() < nullifier.counter(),
                "Cannot link a note hash emitted after a nullifier",
            );
            // Note: No need to verify logs linked to a note hash are squashed.
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
// nullifiers:  [N(C5),  N, N(C3),  N,  N,  0,  0,  0] <-- E.g. N(C5) is the nullifier pointing to C5.
//
// this:        [    5,   _,    3,  _,  _,  _,  _,  _] <-- the index of the linked note for each nullifier
//
unconstrained fn get_note_hash_index_for_each_nullifier(
    previous_kernel: PrivateKernelCircuitPublicInputs,
) -> [u32; MAX_NULLIFIERS_PER_TX] {
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
