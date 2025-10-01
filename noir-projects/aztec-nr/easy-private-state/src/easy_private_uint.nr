use aztec::{
    context::{PrivateContext, UtilityContext},
    messages::message_delivery::MessageDelivery,
    note::note_getter_options::NoteGetterOptions,
    protocol_types::address::AztecAddress,
    state_vars::{PrivateSet, storage::HasStorageSlot},
};
use value_note::{balance_utils, filter::filter_notes_min_sum, value_note::ValueNote};

/// @deprecated (soon) (https://github.com/AztecProtocol/aztec-packages/issues/15959) because:
/// - Its functionality is a subset of `BalanceSet`
/// - The "Easy" naming has been criticized.
/// - It is not a wrapper around a Uint; bur rather around a Field.
/// - It's weird to have a state variable be defined at the top-level of aztecnr,
///   whilst all other state variables are defined _within_ aztecnr.
///
/// An example private state variable, representing a `Field` that can be:
/// - Incremented by anyone
/// - Decremented by the owner of the private state.
pub struct EasyPrivateUint<Context> {
    context: Context,
    set: PrivateSet<ValueNote, Context>,
}

// TODO(#13824): remove this impl once we allow structs to hold state variables.
impl<Context> HasStorageSlot<1> for EasyPrivateUint<Context> {
    fn get_storage_slot(self) -> Field {
        self.set.get_storage_slot()
    }
}

impl<Context> EasyPrivateUint<Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        EasyPrivateUint { context, set: PrivateSet::new(context, storage_slot) }
    }
}

impl EasyPrivateUint<&mut PrivateContext> {
    // Very similar to `value_note::utils::increment`.
    pub fn add(self, addend: u64, owner: AztecAddress) {
        // Creates new note for the owner.
        let addend_note = ValueNote::new(addend as Field, owner);

        // Insert the new note to the owner's set of notes.
        self.set.insert(addend_note).emit(self.context, owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // Very similar to `value_note::utils::decrement`.
    pub fn sub(self, subtrahend: u64, owner: AztecAddress) {
        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend as Field);
        let notes = self.set.pop_notes(options);
        let mut minuend: u64 = 0;
        for i in 0..options.limit {
            if i < notes.len() {
                let note = notes.get_unchecked(i);

                minuend += note.value() as u64;
            }
        }

        assert(minuend >= subtrahend);

        // Creates change note for the owner.
        let result_value = minuend - subtrahend;
        let result_note = ValueNote::new(result_value as Field, owner);
        self.set.insert(result_note).emit(self.context, owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }
}

impl EasyPrivateUint<UtilityContext> {
    pub unconstrained fn get_value(self) -> Field {
        balance_utils::get_balance(self.set)
    }
}
