use types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::MAX_NULLIFIERS_PER_TX, side_effect::Ordered, utils::arrays::find_first_index,
};

/// Checks every nullifier that claims to nullify a note hash created in this tx, and serves two purposes:
///
/// 1. Ordering: a nullifier that links to a note hash must have been created *after* that note hash.
///    Squashed pairs get this check in the Reset circuit; pairs that survive to the Tail get it here.
/// 2. Squash enforcement: every transient (note hash, nullifier) pair must have been squashed. Emitting
///    such a pair would enable a double spend, because a nullifier derived from the transient note hash
///    differs from the one that would later be derived from the same note once it is settled.
///
/// # What the two sides of the comparison hold
///
/// The nullifier side, `nullifier.innermost().note_hash`, is filled by the app circuit. In `aztec-nr` it is
/// set by `note::lifecycle::destroy_note` from `note::utils::compute_confirmed_note_hash_for_nullification`,
/// and depends on the stage of the note being nullified:
///
/// | Note being nullified                                   | `nullifier.note_hash`                         |
/// |--------------------------------------------------------|-----------------------------------------------|
/// | settled (created in an earlier tx)                     | `0`                                           |
/// | pending, created in the same execution phase           | non-siloed note hash                          |
/// | pending, created in the non-revertible phase and       | unique note hash: siloed note hash combined   |
/// | nullified in the revertible phase                      | with the note nonce (first nullifier, index)  |
///
/// The third row is the pair that cannot be squashed: if the tx later reverts, the revertible nullifier is
/// discarded but the non-revertible note hash is still inserted, so both must be emitted and the nullifier
/// must be derived as if the note were already settled. A contract that emits a nullifier through
/// `push_nullifier_unsafe` instead leaves the link at `0` and is not checked here.
///
/// The note hash side, `note_hash.innermost()`, is the terminal Reset circuit's output. Every surviving note
/// hash has been siloed, and the note nonce has been applied to those whose final index is already known:
///
/// | Note hash                                       | tx with public calls | private-only tx |
/// |-------------------------------------------------|----------------------|-----------------|
/// | non-revertible (counter < revertible counter)   | unique               | unique          |
/// | revertible                                      | siloed only          | unique          |
///
/// The PXE assigns the nonce in the third row of the first table when the tx enters the revertible phase, from
/// the same siloed protocol nullifier and the same index the Reset circuit uses, so the two sides agree for a
/// correctly built tx. That nonce reaches the app circuit through an oracle and is not constrained there; the
/// value equality below is the constraint that pins it.
///
/// # Decision per nullifier
///
/// - `note_hash == 0`: settled note, or a padding nullifier. Nothing to check.
/// - `note_hash != 0`: look up the note hash with that value (hinted index). Then:
///   - No note hash in this tx has that value: reject ("Hinted siloed note hash does not match ...").
///     This is how an un-squashed transient pair is caught: its link is the non-siloed hash, which
///     cannot equal any siloed output.
///   - Found, but emitted by a different contract: reject. Guards apps whose note hash is not a hash
///     of the note content (see the inline comment below).
///   - Found, but with a counter above the nullifier's: reject ("Cannot link a note hash emitted after
///     a nullifier").
///   - Otherwise: accept. This is the legitimate previous-phase case from the tables above, where the
///     nullifier was correctly derived from the unique note hash and the pair is emitted as-is.
///
/// Slots beyond the claimed length of both arrays are iterated too. A trailing note hash cannot be matched
/// because its value is `0` (`validate_accumulated_items` asserts dense-trimmed values). A trailing nullifier
/// with a non-zero link is rejected by the counter check, because its own counter is `0`.
pub fn validate_unsquashable_note_hash_nullifier_ordering(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    // Should be known at compile time.
    is_for_public: bool,
) {
    // Safety: the below hints are constrained by the following methods. See private_kernel_inner for use.
    let note_hash_index_for_each_nullifier =
        unsafe { get_note_hash_index_for_each_nullifier(previous_kernel_public_inputs) };

    let min_revertible_side_effect_counter =
        previous_kernel_public_inputs.min_revertible_side_effect_counter;
    let nullifiers = previous_kernel_public_inputs.end.nullifiers;
    let note_hashes = previous_kernel_public_inputs.end.note_hashes;
    for i in 0..nullifiers.array.len() {
        let nullifier = nullifiers.array[i];
        let nullified_note_hash = nullifier.innermost().note_hash;
        // A nullifier's `value` is opaque to the kernel: only the app circuit knows which note, if any, it was
        // derived from, and this link is the app's claim about that. The checks below stop a prover from
        // skipping a squash or supplying a wrong note nonce for an honest app. They cannot catch an app that
        // misstates its link, such as a link of `0` on a nullifier derived from a pending note, or a link to a
        // different note. Such an app can only make its own notes spendable again: siloing scopes every note
        // hash and nullifier to the emitting contract, which could equally mint new notes or never nullify
        // them.
        if nullified_note_hash != 0 {
            // The note hash is the terminal Reset circuit's output, compared as-is: no unique note hash is
            // recomputed here.
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
            // The Reset circuit outputs a non-revertible note hash as its unique value (siloed, then combined
            // with the note nonce). A revertible note hash in a tx with public calls is output siloed only and
            // gets its nonce from the AVM later, so it settles under a different value from the one matched
            // above, and a nullifier derived from that value would not nullify the settled note. Requiring a
            // non-revertible note hash means the link can only match a unique note hash.
            //
            // A private-only tx outputs every note hash unique, so only tail-to-public needs this check.
            if is_for_public {
                assert(
                    note_hash.counter() < min_revertible_side_effect_counter,
                    "Linked note hash must be non-revertible",
                );
            }
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
