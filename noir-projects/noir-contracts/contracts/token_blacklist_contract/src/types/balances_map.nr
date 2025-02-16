use crate::types::token_note::OwnedNote;
use dep::aztec::{
    context::{PrivateContext, UnconstrainedContext},
    note::note_emission::OuterNoteEmission,
    protocol_types::constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
};
use dep::aztec::prelude::{
    AztecAddress, Map, NoteGetterOptions, NoteInterface, NoteViewerOptions, NullifiableNote,
    PrivateSet, RetrievedNote,
};

pub struct BalancesMap<Note, Context> {
    map: Map<AztecAddress, PrivateSet<Note, Context>, Context>,
}

impl<Note, Context> BalancesMap<Note, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self {
            map: Map::new(
                context,
                storage_slot,
                |context, slot| PrivateSet::new(context, slot),
            ),
        }
    }
}

impl<Note> BalancesMap<Note, UnconstrainedContext> {
    pub unconstrained fn balance_of<let NOTE_SERIALIZED_LEN: u32>(
        self: Self,
        owner: AztecAddress,
    ) -> U128
    where
        Note: NoteInterface<NOTE_SERIALIZED_LEN> + NullifiableNote + OwnedNote,
    {
        self.balance_of_with_offset(owner, 0)
    }

    pub unconstrained fn balance_of_with_offset<let NOTE_SERIALIZED_LEN: u32>(
        self: Self,
        owner: AztecAddress,
        offset: u32,
    ) -> U128
    where
        Note: NoteInterface<NOTE_SERIALIZED_LEN> + NullifiableNote + OwnedNote,
    {
        let mut balance = U128::from_integer(0);
        // docs:start:view_notes
        let mut options = NoteViewerOptions::new();
        let notes = self.map.at(owner).view_notes(options.set_offset(offset));
        // docs:end:view_notes
        for i in 0..options.limit {
            if i < notes.len() {
                balance = balance + notes.get_unchecked(i).get_amount();
            }
        }
        if (notes.len() == options.limit) {
            balance = balance + self.balance_of_with_offset(owner, offset + options.limit);
        }

        balance
    }
}

impl<Note> BalancesMap<Note, &mut PrivateContext> {

    pub fn add<let NOTE_SERIALIZED_LEN: u32>(
        self: Self,
        owner: AztecAddress,
        addend: U128,
    ) -> OuterNoteEmission<Note>
    where
        Note: NoteInterface<NOTE_SERIALIZED_LEN> + NullifiableNote + OwnedNote + Eq,
    {
        if addend == U128::from_integer(0) {
            OuterNoteEmission::new(Option::none())
        } else {
            let addend_note = Note::new(addend, owner);

            // docs:start:insert
            OuterNoteEmission::new(Option::some(self.map.at(owner).insert(addend_note)))
            // docs:end:insert
        }
    }

    pub fn sub<let NOTE_SERIALIZED_LEN: u32>(
        self: Self,
        owner: AztecAddress,
        subtrahend: U128,
    ) -> OuterNoteEmission<Note>
    where
        Note: NoteInterface<NOTE_SERIALIZED_LEN> + NullifiableNote + OwnedNote + Eq,
    {
        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend);
        let notes = self.map.at(owner).pop_notes(options);

        let mut minuend: U128 = U128::from_integer(0);
        for i in 0..options.limit {
            if i < notes.len() {
                let note: Note = notes.get_unchecked(i);
                minuend = minuend + note.get_amount();
            }
        }

        // This is to provide a nicer error msg,
        // without it minuend-subtrahend would still catch it, but more generic error then.
        // without the == true, it includes 'minuend.ge(subtrahend)' as part of the error.
        assert(minuend >= subtrahend, "Balance too low");

        self.add(owner, minuend - subtrahend)
    }
}

pub fn filter_notes_min_sum<Note, let NOTE_SERIALIZED_LEN: u32>(
    retrieved_notes: [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: U128,
) -> [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL]
where
    Note: NoteInterface<NOTE_SERIALIZED_LEN> + OwnedNote,
{
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut sum = U128::from_integer(0);
    for i in 0..retrieved_notes.len() {
        if retrieved_notes[i].is_some() & sum < min_sum {
            let retrieved_note = retrieved_notes[i].unwrap_unchecked();
            selected[i] = Option::some(retrieved_note);
            sum = sum.add(retrieved_note.note.get_amount());
        }
    }
    selected
}
