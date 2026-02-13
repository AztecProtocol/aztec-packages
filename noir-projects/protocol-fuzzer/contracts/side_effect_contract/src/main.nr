use aztec::macros::aztec;

#[aztec]
pub contract SideEffect {
    use aztec::{
        context::note_hash_read::NoteHashRead,
        hash::compute_siloed_nullifier,
        history::{
            note_inclusion::ProveNoteInclusion,
            nullifier_inclusion::ProveNullifierInclusion,
        },
        macros::{
            functions::{external, initializer, noinitcheck, only_self},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        note::{
            constants::MAX_NOTES_PER_PAGE,
            lifecycle::{create_note, destroy_note_unsafe},
            note_getter::{get_notes, view_notes},
            note_getter_options::{NoteGetterOptions, NoteStatus},
            note_viewer_options::NoteViewerOptions,
            retrieved_note::RetrievedNote,
        },
        protocol_types::{
            address::AztecAddress,
            constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
        },
    };

    use uint_note::uint_note::{PartialUintNote, UintNote};

    #[storage]
    struct Storage<Context> {}

    #[initializer]
    #[external("private")]
    fn initialize() {}

    #[external("private")]
    fn call_create_note(
        value: u128,
        owner: AztecAddress,
        storage_slot: Field,
        make_tx_hybrid: bool,
    ) {
        let note = UintNote { value };
        create_note(self.context, owner, storage_slot, note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        if make_tx_hybrid {
            self.enqueue_self.dummy_public_call();
        }
    }

    #[external("private")]
    fn call_create_and_complete_partial_note(
        owner: AztecAddress,
        storage_slot: Field,
        value: u128,
    ) {
        let partial_note =
            UintNote::partial(owner, storage_slot, self.context, owner, self.address);

        self.enqueue_self.call_complete_partial_note(partial_note, value);
    }

    #[external("private")]
    fn call_destroy_note(owner: AztecAddress, storage_slot: Field) {
        let options = NoteGetterOptions::new().set_owner(owner);
        let (retrieved_notes, note_hashes): (BoundedVec<RetrievedNote<UintNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<NoteHashRead, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(self.context, storage_slot, options);

        let retrieved_note = retrieved_notes.get(0);
        let note_hash = note_hashes.get(0);

        destroy_note_unsafe(self.context, retrieved_note, note_hash);
    }

    #[external("private")]
    fn test_note_inclusion(owner: AztecAddress, storage_slot: Field) {
        let options = NoteGetterOptions::new().set_owner(owner).set_limit(1);

        let (retrieved_notes, _): (BoundedVec<RetrievedNote<UintNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<NoteHashRead, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(self.context, storage_slot, options);

        let header = self.context.get_anchor_block_header();

        header.prove_note_inclusion(retrieved_notes.get(0));
    }

    #[external("utility")]
    unconstrained fn call_view_notes_many(
        owner: AztecAddress,
        storage_slot: Field,
        active_or_nullified: bool,
    ) -> [u128; 2] {
        let mut options = NoteViewerOptions::new().set_owner(owner);
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
    ) -> [u128; 2] {
        let mut options = NoteGetterOptions::new().set_owner(owner);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let (retrieved_notes, _): (BoundedVec<RetrievedNote<UintNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<NoteHashRead, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(self.context, storage_slot, options);

        let v0 = if retrieved_notes.len() > 0 { retrieved_notes.get(0).note.value } else { 0 };
        let v1 = if retrieved_notes.len() > 1 { retrieved_notes.get(1).note.value } else { 0 };
        [v0, v1]
    }

    #[external("private")]
    #[noinitcheck]
    fn emit_nullifier(nullifier: Field) {
        self.context.push_nullifier(nullifier);
    }

    #[external("private")]
    fn test_nullifier_inclusion(nullifier: Field) {
        let header = self.context.get_anchor_block_header();
        let siloed = compute_siloed_nullifier(self.address, nullifier);
        header.prove_nullifier_inclusion(siloed);
    }

    #[external("public")]
    #[only_self]
    fn dummy_public_call() {}

    #[external("public")]
    fn call_complete_partial_note(partial_note: PartialUintNote, value: u128) {
        partial_note.complete(self.context, self.address, value);
    }
}
