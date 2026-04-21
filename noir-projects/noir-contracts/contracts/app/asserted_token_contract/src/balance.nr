use crate::asserted_note::AssertedNote;
use aztec::{
    context::UtilityContext, note::note_viewer_options::NoteViewerOptions,
    protocol::traits::Packable, state_vars::PrivateSet,
};

/// Recursively sums the amounts of all AssertedNotes in `notes_set` starting at `offset`.
/// Pages through the set since a single `view_notes` call is capped at `MAX_NOTES_PER_PAGE`.
/// Mirrors `balance-set::BalanceSet::balance_of_with_offset`.
pub unconstrained fn balance_of_with_offset(
    notes_set: PrivateSet<AssertedNote, UtilityContext>,
    offset: u32,
) -> u128 {
    let options =
        NoteViewerOptions::<AssertedNote, <AssertedNote as Packable>::N>::new().set_offset(offset);
    let notes = notes_set.view_notes(options);
    let mut balance: u128 = 0;
    for i in 0..options.limit {
        if i < notes.len() {
            balance += notes.get_unchecked(i).amount;
        }
    }
    if notes.len() == options.limit {
        balance += balance_of_with_offset(notes_set, offset + options.limit);
    }
    balance
}
