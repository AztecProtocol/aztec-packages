use crate::{filter::filter_notes_min_sum, value_note::ValueNote};

use aztec::{
    context::PrivateContext,
    messages::logs::note::encode_and_encrypt_note,
    note::{note_getter_options::{NoteGetterOptions, SortOrder}, note_interface::NoteProperties},
    protocol_types::{address::AztecAddress, traits::Packable},
    state_vars::PrivateSet,
};

// Sort the note values (0th field) in descending order.
// Pick the fewest notes whose sum is equal to or greater than `amount`.
pub fn create_note_getter_options_for_decreasing_balance<let N: u32>(
    amount: Field,
) -> NoteGetterOptions<ValueNote, N, Field, Field>
where
    ValueNote: Packable<N>,
{
    NoteGetterOptions::with_filter(filter_notes_min_sum, amount).sort(
        ValueNote::properties().value,
        SortOrder.DESC,
    )
}

// Creates a new note for the recipient.
// Inserts it to the recipient's set of notes.
pub fn increment(
    // docs:start:increment_args
    balance: PrivateSet<ValueNote, &mut PrivateContext>,
    amount: Field,
    recipient: AztecAddress, // docs:end:increment_args
    sender: AztecAddress,
) {
    let note = ValueNote::new(amount, recipient);
    // Insert the new note to the owner's set of notes and emit the log if value is non-zero.
    // TODO: consider how to give devs choice over this `encode_and_encrypt_note` function. At the moment, it's hard-coded as one of many potential strategies.
    balance.insert(note).emit(encode_and_encrypt_note(balance.context, recipient, sender));
}

// Find some of the `owner`'s notes whose values add up to the `amount`.
// Remove those notes.
// If the value of the removed notes exceeds the requested `amount`, create a new note containing the excess value, so that exactly `amount` is removed.
// Fail if the sum of the selected notes is less than the amount.
pub fn decrement(
    balance: PrivateSet<ValueNote, &mut PrivateContext>,
    amount: Field,
    owner: AztecAddress,
    sender: AztecAddress,
) {
    let sum = decrement_by_at_most(balance, amount, owner, sender);
    assert(sum == amount, "Balance too low");
}

// Similar to `decrement`, except that it doesn't fail if the decremented amount is less than max_amount.
// The motivation behind this function is that there is an upper-bound on the number of notes a function may
// read and nullify. The requested decrementation `amount` might be spread across too many of the `owner`'s
// notes to 'fit' within this upper-bound, so we might have to remove an amount less than `amount`. A common
// pattern is to repeatedly call this function across many function calls, until enough notes have been nullified to
// equal `amount`.
//
// It returns the decremented amount, which should be less than or equal to max_amount.
pub fn decrement_by_at_most(
    balance: PrivateSet<ValueNote, &mut PrivateContext>,
    max_amount: Field,
    owner: AztecAddress,
    sender: AztecAddress,
) -> Field {
    let options = create_note_getter_options_for_decreasing_balance(max_amount);
    let notes = balance.pop_notes(options);

    let mut decremented = 0;
    for i in 0..options.limit {
        if i < notes.len() {
            let note = notes.get_unchecked(i);
            decremented += note.value();
        }
    }

    // Add the change value back to the owner's balance.
    let mut change_value = 0;
    if max_amount.lt(decremented) {
        change_value = decremented - max_amount;
        decremented -= change_value;
    }
    increment(balance, change_value, owner, sender);

    decremented
}
