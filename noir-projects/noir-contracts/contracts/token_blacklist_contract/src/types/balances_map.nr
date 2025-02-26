use crate::types::token_note::OwnedNote;
use dep::aztec::{
    context::{PrivateContext, UnconstrainedContext},
    note::note_emission::OuterNoteEmission,
    protocol_types::{constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, traits::Packable},
};
use dep::aztec::prelude::{
    AztecAddress, Map, NoteGetterOptions, NoteHash, NoteType, NoteViewerOptions, PrivateSet,
    RetrievedNote,
};

pub struct BalancesMap<NOTE, Context> {
    map: Map<AztecAddress, PrivateSet<NOTE, Context>, Context>,
}

impl<NOTE, Context> BalancesMap<NOTE, Context> {
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

impl<NOTE> BalancesMap<NOTE, UnconstrainedContext> {
    pub unconstrained fn balance_of<let N: u32>(self: Self, owner: AztecAddress) -> u128
    where
        NOTE: NoteType + NoteHash + OwnedNote + Packable<N>,
    {
        self.balance_of_with_offset(owner, 0)
    }

    pub unconstrained fn balance_of_with_offset<let N: u32>(
        self: Self,
        owner: AztecAddress,
        offset: u32,
    ) -> u128
    where
        NOTE: NoteType + NoteHash + OwnedNote + Packable<N>,
    {
        let mut balance = 0 as u128;
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

impl<NOTE> BalancesMap<NOTE, &mut PrivateContext> {

    pub fn add<let N: u32>(self: Self, owner: AztecAddress, addend: u128) -> OuterNoteEmission<NOTE>
    where
        NOTE: NoteType + NoteHash + OwnedNote + Eq + Packable<N>,
    {
        if addend == 0 as u128 {
            OuterNoteEmission::new(Option::none())
        } else {
            let addend_note = NOTE::new(addend, owner);

            // docs:start:insert
            OuterNoteEmission::new(Option::some(self.map.at(owner).insert(addend_note)))
            // docs:end:insert
        }
    }

    pub fn sub<let N: u32>(
        self: Self,
        owner: AztecAddress,
        subtrahend: u128,
    ) -> OuterNoteEmission<NOTE>
    where
        NOTE: NoteType + NoteHash + OwnedNote + Eq + Packable<N>,
    {
        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend);
        let notes = self.map.at(owner).pop_notes(options);

        let mut minuend: u128 = 0 as u128;
        for i in 0..options.limit {
            if i < notes.len() {
                let note: NOTE = notes.get_unchecked(i);
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

pub fn filter_notes_min_sum<NOTE>(
    retrieved_notes: [Option<RetrievedNote<NOTE>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: u128,
) -> [Option<RetrievedNote<NOTE>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL]
where
    NOTE: NoteType + OwnedNote,
{
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut sum = 0 as u128;
    for i in 0..retrieved_notes.len() {
        if retrieved_notes[i].is_some() & sum < min_sum {
            let retrieved_note = retrieved_notes[i].unwrap_unchecked();
            selected[i] = Option::some(retrieved_note);
            sum = sum.add(retrieved_note.note.get_amount());
        }
    }
    selected
}
