use aztec::macros::aztec;

/// Test contract for the protocol fuzzer's side-effect state machine.
///
/// In Aztec, "side effects" are the state-mutating outputs that a transaction
/// appends to the rollup: note hashes, nullifiers, log hashes, l2-to-l1
/// messages, etc. Each function in this contract triggers a different
/// combination of these side effects so the fuzzer can verify the protocol
/// handles them correctly end-to-end:
///
/// - Note hashes: `call_create_note`, `call_create_and_complete_partial_note`
/// - Nullifiers (from note destruction): `call_destroy_note`
/// - Raw nullifier emission: `emit_nullifier`
/// - Note read requests: `call_get_notes_many`
/// - Unconstrained note queries: `call_view_notes_many`
/// - Archive inclusion proofs: `test_note_inclusion`, `test_settled_nullifier_inclusion`
///
/// Uses `UintNote` with caller-chosen storage slots (no declared storage)
/// so the fuzzer can exercise multiple independent note sets.
/// Returns `[u128; 2]` from query functions, with 0 as the "no note" sentinel.
///
/// Some functions can also be called indirectly via the `Parent` contract
/// to exercise cross-contract call paths.
#[aztec]
pub contract SideEffect {
    use aztec::{
        hash::compute_siloed_nullifier,
        history::nullifier::assert_nullifier_existed_by,
        macros::{
            functions::{external, initializer, noinitcheck},
            storage::storage,
        },
        messages::delivery::MessageDelivery,
        note::{
            ConfirmedNote,
            constants::MAX_NOTES_PER_PAGE,
            lifecycle::{create_note, destroy_note},
            note_getter::{get_notes, view_notes},
            note_getter_options::{NoteGetterOptions, NoteStatus, PropertySelector, SortOrder},
            note_viewer_options::NoteViewerOptions,
        },
        protocol::address::AztecAddress,
    };

    use uint_note::{PartialUintNote, UintNote};

    #[storage]
    struct Storage<Context> {}

    #[initializer]
    #[external("private")]
    fn initialize() {}

    // Note: value must be non-zero because 0 is used as "no note found" sentinel
    // in call_view_notes_many / call_get_notes_many return values.
    #[external("private")]
    fn call_create_note(value: u128, owner: AztecAddress, storage_slot: Field) {
        assert(value != 0, "note value must be non-zero");
        let note = UintNote { value };
        create_note(self.context, owner, storage_slot, note).deliver(
            MessageDelivery::onchain_unconstrained(),
        );
    }

    // Partial-note flow: the private phase hashes the owner, storage slot, and
    // a random nonce into a "partial commitment" (without the value), emits an
    // encrypted log for the recipient, and enqueues a public call. The public
    // phase fills in the value, pushes the final note hash, and emits a public
    // log so the recipient can reconstruct the full note. This lets the value
    // be determined by public state (e.g. a token swap amount that depends on
    // the current pool price) while keeping the owner private. Here the value
    // is known upfront, but we still exercise the cross-phase machinery.
    // Value must be non-zero (0 is the "no note found" sentinel).
    #[external("private")]
    fn call_create_and_complete_partial_note(
        owner: AztecAddress,
        storage_slot: Field,
        value: u128,
    ) {
        assert(value != 0, "note value must be non-zero");
        let partial_note = UintNote::partial(owner, self.context, owner, self.address);

        self.enqueue_self.call_complete_partial_note(partial_note, storage_slot, value);
    }

    // This function creates a nullifier for an existing note hash. If the linked
    // note hash doesn't exist, the kernel will throw.
    // TODO: Add a function that emits a nullifier linked to a note hash provided
    // as a parameter (rather than fetched via get_notes).
    #[external("private")]
    fn call_destroy_note(owner: AztecAddress, storage_slot: Field) {
        let options: NoteGetterOptions<UintNote, _, _, _> = NoteGetterOptions::new()
            .set_owner(owner)
            .sort(PropertySelector { index: 0, offset: 0, length: 32 }, SortOrder.ASC);
        let confirmed_notes = get_notes(self.context, storage_slot, options);

        destroy_note(self.context, confirmed_notes.get(0));
    }

    // test_note_inclusion: get_notes proves that a settled note exists in the
    // note hash tree, and a pending note was emitted earlier in the tx. We
    // assert len == 1 so the tx fails on empty slots, exercising the inclusion
    // proof path only when a note actually exists.
    #[external("private")]
    fn test_note_inclusion(owner: AztecAddress, storage_slot: Field) {
        let options: NoteGetterOptions<UintNote, _, _, _> = NoteGetterOptions::new()
            .set_owner(owner)
            .set_limit(1)
            .sort(PropertySelector { index: 0, offset: 0, length: 32 }, SortOrder.ASC);

        let confirmed_notes = get_notes(self.context, storage_slot, options);
        assert_eq(confirmed_notes.len(), 1);
    }

    // TODO: Sort by counter instead of value. Notes with the same value can be
    // returned in arbitrary order by the oracle, but counters are unique, giving
    // a deterministic ordering the fuzzer model can predict exactly.
    #[external("utility")]
    unconstrained fn call_view_notes_many(
        owner: AztecAddress,
        storage_slot: Field,
        active_or_nullified: bool,
        offset: u32,
    ) -> [u128; 2] {
        let mut options = NoteViewerOptions::new()
            .set_owner(owner)
            .set_offset(offset)
            .sort(PropertySelector { index: 0, offset: 0, length: 32 }, SortOrder.ASC);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<UintNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        let v0 = if notes.len() > 0 { notes.get(0).value } else { 0 };
        let v1 = if notes.len() > 1 { notes.get(1).value } else { 0 };
        [v0, v1]
    }

    #[external("private")]
    fn call_get_notes_many(
        owner: AztecAddress,
        storage_slot: Field,
        active_or_nullified: bool,
        offset: u32,
    ) -> [u128; 2] {
        let mut options: NoteGetterOptions<UintNote, _, _, _> = NoteGetterOptions::new()
            .set_owner(owner)
            .set_offset(offset)
            .sort(PropertySelector { index: 0, offset: 0, length: 32 }, SortOrder.ASC);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let confirmed_notes = get_notes(self.context, storage_slot, options);

        let v0 = if confirmed_notes.len() > 0 { confirmed_notes.get(0).note.value } else { 0 };
        let v1 = if confirmed_notes.len() > 1 { confirmed_notes.get(1).note.value } else { 0 };
        [v0, v1]
    }

    // TODO: Add more functions that push data directly to the context (both
    // private and public) to test more side-effect scenarios -- e.g. pushing
    // note hashes, log hashes, l2-to-l1 messages directly.
    #[external("private")]
    #[noinitcheck]
    fn emit_nullifier(nullifier: Field) {
        self.context.push_nullifier_unsafe(nullifier);
    }

    #[external("private")]
    fn test_settled_nullifier_inclusion(nullifier: Field) {
        let header = self.context.get_anchor_block_header();
        let siloed = compute_siloed_nullifier(self.address, nullifier);
        assert_nullifier_existed_by(header, siloed);
    }

    #[external("public")]
    fn call_complete_partial_note(partial_note: PartialUintNote, storage_slot: Field, value: u128) {
        partial_note.complete(self.context, self.address, storage_slot, value);
    }
}
