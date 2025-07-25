// docs:start:balance_set
use dep::aztec::{
    context::{PrivateContext, UtilityContext},
    note::{
        note_emission::OuterNoteEmission,
        note_getter_options::{NoteGetterOptions, SortOrder},
        note_interface::NoteProperties,
        note_viewer_options::NoteViewerOptions,
        retrieved_note::RetrievedNote,
    },
    protocol_types::{address::AztecAddress, constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL},
    state_vars::{PrivateSet, storage::HasStorageSlot},
};
use dep::uint_note::uint_note::UintNote;
use std::ops::Add;

pub struct BalanceSet<Context> {
    pub set: PrivateSet<UintNote, Context>,
}

// TODO(#13824): remove this impl once we allow structs to hold state variables.
impl<Context> HasStorageSlot<1> for BalanceSet<Context> {
    fn get_storage_slot(self) -> Field {
        self.set.get_storage_slot()
    }
}

impl<Context> BalanceSet<Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { set: PrivateSet::new(context, storage_slot) }
    }
}

impl BalanceSet<UtilityContext> {
    pub unconstrained fn balance_of(self: Self) -> u128 {
        self.balance_of_with_offset(0)
    }

    pub unconstrained fn balance_of_with_offset(self: Self, offset: u32) -> u128 {
        let mut balance = 0 as u128;
        // docs:start:view_notes
        let mut options = NoteViewerOptions::new();
        let notes = self.set.view_notes(options.set_offset(offset));
        // docs:end:view_notes
        for i in 0..options.limit {
            if i < notes.len() {
                balance = balance + notes.get_unchecked(i).get_value();
            }
        }
        if (notes.len() == options.limit) {
            balance = balance + self.balance_of_with_offset(offset + options.limit);
        }

        balance
    }
}

impl BalanceSet<&mut PrivateContext> {
    pub fn add(self: Self, owner: AztecAddress, addend: u128) -> OuterNoteEmission<UintNote> {
        if addend == 0 as u128 {
            OuterNoteEmission::new(Option::none())
        } else {
            // We fetch the nullifier public key hash from the registry / from our PXE
            let mut addend_note = UintNote::new(addend, owner);

            // docs:start:insert
            OuterNoteEmission::new(Option::some(self.set.insert(addend_note)))
            // docs:end:insert
        }
    }

    pub fn sub(self: Self, owner: AztecAddress, amount: u128) -> OuterNoteEmission<UintNote> {
        let subtracted = self.try_sub(amount, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL);

        // try_sub may have substracted more or less than amount. We must ensure that we subtracted at least as much as
        // we needed, and then create a new note for the owner for the change (if any).
        assert(subtracted >= amount, "Balance too low");
        self.add(owner, subtracted - amount)
    }

    // Attempts to remove 'target_amount' from the owner's balance. try_sub returns how much was actually subtracted
    // (i.e. the sum of the value of nullified notes), but this subtracted amount may be more or less than the target
    // amount.
    // This may seem odd, but is unfortunately unavoidable due to the number of notes available and their amounts being
    // unknown. What try_sub does is a best-effort attempt to consume as few notes as possible that add up to more than
    // `target_amount`.
    // The `max_notes` parameter is used to fine-tune the number of constraints created by this function. The gate count
    // scales relatively linearly with `max_notes`, but a lower `max_notes` parameter increases the likelihood of
    // `try_sub` subtracting an amount smaller than `target_amount`.
    pub fn try_sub(self: Self, target_amount: u128, max_notes: u32) -> u128 {
        // We are using a preprocessor here (filter applied in an unconstrained context) instead of a filter because
        // we do not need to prove correct execution of the preprocessor.
        // Because the `min_sum` notes is not constrained, users could choose to e.g. not call it. However, all this
        // might result in is simply higher DA costs due to more nullifiers being emitted. Since we don't care
        // about proving optimal note usage, we can save these constraints and make the circuit smaller.
        let options = NoteGetterOptions::with_preprocessor(preprocess_notes_min_sum, target_amount)
            .sort(UintNote::properties().value, SortOrder.DESC)
            .set_limit(max_notes);
        let notes = self.set.pop_notes(options);

        let mut subtracted = 0 as u128;
        for i in 0..options.limit {
            if i < notes.len() {
                let note = notes.get_unchecked(i);
                subtracted = subtracted + note.get_value();
            }
        }

        subtracted
    }
}

// Computes the partial sum of the notes array, stopping once 'min_sum' is reached. This can be used to minimize the
// number of notes read that add to some value, e.g. when transferring some amount of tokens.
// The preprocessor (a filter applied in an unconstrained context) does not check if total sum is larger or equal to
// 'min_sum' - all it does is remove extra notes if it does reach that value.
// Note that proper usage of this preprocessor requires for notes to be sorted in descending order.
pub fn preprocess_notes_min_sum(
    notes: [Option<RetrievedNote<UintNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: u128,
) -> [Option<RetrievedNote<UintNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut sum = 0 as u128;
    for i in 0..notes.len() {
        // Because we process notes in retrieved order, notes need to be sorted in descending amount order for this
        // filter to be useful. Consider a 'min_sum' of 4, and a set of notes with amounts [3, 2, 1, 1, 1, 1, 1]. If
        // sorted in descending order, the filter will only choose the notes with values 3 and 2, but if sorted in
        // ascending order it will choose 4 notes of value 1.
        if notes[i].is_some() & sum < min_sum {
            let retrieved_note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(retrieved_note);
            sum = sum.add(retrieved_note.note.get_value());
        }
    }
    selected
}
// docs:end:balance_set

mod test {
    use crate::{test::utils, Token};
    use super::BalanceSet;
    use dep::aztec::protocol_types::{storage::map::derive_storage_slot_in_map, traits::ToField};

    #[test]
    unconstrained fn subtract_balance_small_note_first() {
        check_large_balance_note_used_first([5, 50]);
    }

    #[test]
    unconstrained fn subtract_balance_large_note_first() {
        check_large_balance_note_used_first([50, 5]);
    }

    unconstrained fn check_large_balance_note_used_first(note_values: [u128; 2]) {
        let (env, token_contract_address, owner, recipient) = utils::setup(false);

        // The owner mints two notes for the recipient
        let first_note_value = note_values[0];
        let _ = env.call_private(
            owner,
            Token::at(token_contract_address).mint_to_private(recipient, first_note_value),
        );

        let second_note_value = note_values[1];
        let _ = env.call_private(
            owner,
            Token::at(token_contract_address).mint_to_private(recipient, second_note_value),
        );

        // We check the recipient balance is correct both as a sanity check and as a way to make sure we've discovered
        // the notes.
        utils::check_private_balance(
            env,
            token_contract_address,
            recipient,
            first_note_value + second_note_value,
        );

        // We now instantiate a BalanceSet state variable for the recipient and subtract an amount equal to the smallest
        // of the two notes. Because large notes are consumed first, we should see that a change note is created with
        // amount equal to large - small, indicating that the larger note was consumed regardless of the order in which
        // the notes were created.
        env.private_context_at(token_contract_address, |context| {
            let recipient_balance_set = BalanceSet::new(
                context,
                derive_storage_slot_in_map(
                    Token::storage_layout().balances.slot,
                    recipient.to_field(),
                ),
            );

            let smaller_note_value = std::cmp::min(first_note_value, second_note_value);
            let larger_note_value = std::cmp::max(first_note_value, second_note_value);

            let note =
                recipient_balance_set.sub(recipient, smaller_note_value).emission.unwrap().note;
            assert_eq(note.get_value(), larger_note_value - smaller_note_value);
        });
    }
}
