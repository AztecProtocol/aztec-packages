use crate::{
    context::{Context,PrivateContext}, oracle::{storage::{storage_read, storage_write}}, state_vars::{storage::Storage,map::Map,private_mutable::PrivateMutable},
};
use dep::protocol_types::{hash::pedersen_hash, constants::INITIALIZATION_SLOT_SEPARATOR, traits::{Deserialize, Serialize}};
use crate::note::{
    lifecycle::{create_note, create_note_hash_from_public, destroy_note},
    note_getter::{get_note, get_notes, view_notes}, note_getter_options::NoteGetterOptions,
    note_header::NoteHeader, note_interface::NoteInterface, note_viewer_options::NoteViewerOptions,
    utils::compute_note_hash_for_consumption
};
use crate::state_vars_helpers::simple_note::SimpleNote;

struct PrivateDynamicArray<T> {
  context: Option<&mut PrivateContext>,
  map: Map<Field, T>,
  storage_slot: Field,
}

impl<T> Storage<T> for PrivateDynamicArray<T> {}

impl<T> PrivateDynamicArray<T> {
  pub fn new(
    context: Context,
    storage_slot: Field,
    state_var_constructor: fn(Context, Field) -> T
  ) -> Self {
    assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");

    let mut length = SimpleNote::new(0);
    let mut counter = SimpleNote::new(0);

    create_note(context.private.unwrap(), storage_slot, &mut length, false);
    create_note(context.private.unwrap(), storage_slot + INITIALIZATION_SLOT_SEPARATOR, &mut counter, false);

    PrivateDynamicArray { 
      context: context.private, 
      storage_slot, 
      map: Map::new(
        context,
        storage_slot + INITIALIZATION_SLOT_SEPARATOR + INITIALIZATION_SLOT_SEPARATOR,
        state_var_constructor
      )
    }
  }


  // self.storage_slot + Init + init + init + i
  pub fn push(mut self) -> T {
    let length_note: SimpleNote = get_note(self.context.unwrap(), self.storage_slot);
    let counter_note: SimpleNote = get_note(self.context.unwrap(), self.storage_slot + INITIALIZATION_SLOT_SEPARATOR);

    let length = length_note.value;
    let counter = counter_note.value;

    let mut slot_note = SimpleNote::new(counter);
    create_note(
      self.context.unwrap(),
      self.storage_slot + INITIALIZATION_SLOT_SEPARATOR + INITIALIZATION_SLOT_SEPARATOR + INITIALIZATION_SLOT_SEPARATOR + length,
      &mut slot_note,
      false
    );

    let mut ret = self.map.at(counter);

    destroy_note(self.context.unwrap(), length_note);
    destroy_note(self.context.unwrap(), counter_note);

    let mut new_length_note = SimpleNote::new(length + 1);
    let mut new_counter_note = SimpleNote::new(counter + 1);

    create_note(self.context.unwrap(), self.storage_slot, &mut new_length_note, false);
    create_note(self.context.unwrap(), self.storage_slot + INITIALIZATION_SLOT_SEPARATOR, &mut new_counter_note, false);

    ret
  }

  // notice - Because we don't nullify the note itself, the note is still "accessible" even when popped.
  // The implementer would need to nullify the popped note if he wants to ensure the note no longer exists
  pub fn pop<U, T_SERIALIZED_LEN>(mut self) -> T where U: Deserialize<T_SERIALIZED_LEN> {
    let length_note: SimpleNote = get_note(self.context.unwrap(), self.storage_slot);
    let new_length = length_note.value - 1;

    let mut slot_note: SimpleNote = get_note(
      self.context.unwrap(),
      self.storage_slot + INITIALIZATION_SLOT_SEPARATOR + INITIALIZATION_SLOT_SEPARATOR + INITIALIZATION_SLOT_SEPARATOR + new_length,
    );

    let mut ret = self.map.at(slot_note.value);

    destroy_note(self.context.unwrap(), slot_note);
    destroy_note(self.context.unwrap(), length_note);
    let mut new_length_note = SimpleNote::new(new_length);

    create_note(self.context.unwrap(), self.storage_slot, &mut new_length_note, false);

    ret
  }

  pub fn remove<U, T_SERIALIZED_LEN>(self, index: Field) where U: Deserialize<T_SERIALIZED_LEN> {
    let derived_storage_slot = pedersen_hash([self.storage_slot + INITIALIZATION_SLOT_SEPARATOR, index], 0);

    storage_write(derived_storage_slot, [0; T_SERIALIZED_LEN]);
  }

  pub fn at_index(self, index: Field) -> T {
    let array_read: [Field; 1] = storage_read(self.storage_slot);
    let array_length = array_read[0];

    self.map.at(index)
  }

  pub fn length(self) -> Field {
    let array_read: [Field; 1] = storage_read(self.storage_slot);

    array_read[0]
  }
}
