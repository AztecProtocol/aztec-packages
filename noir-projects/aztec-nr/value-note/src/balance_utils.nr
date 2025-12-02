use crate::value_note::ValueNote;
use dep::aztec::{
    context::UtilityContext,
    note::note_viewer_options::NoteViewerOptions,
    protocol_types::address::AztecAddress,
    state_vars::private_set::{OwnedPrivateSet, PrivateSet},
};

// DEPRECATED: Having this functionality in the value note package is incorrect and will be removed in the future.
pub unconstrained fn get_balance(
    set: PrivateSet<ValueNote, UtilityContext>,
    owner: AztecAddress,
) -> Field {
    get_balance_with_offset(set.at(owner), 0)
}

// DEPRECATED: Having this functionality in the value note package is incorrect and will be removed in the future.
unconstrained fn get_balance_with_offset(
    set: OwnedPrivateSet<ValueNote, UtilityContext>,
    offset: u32,
) -> Field {
    let mut balance = 0;
    let mut options = NoteViewerOptions::new();
    let notes = set.view_notes(options.set_offset(offset));
    for i in 0..options.limit {
        if i < notes.len() {
            balance += notes.get_unchecked(i).value();
        }
    }

    if (notes.len() == options.limit) {
        balance += get_balance_with_offset(set, offset + options.limit);
    }

    balance
}
