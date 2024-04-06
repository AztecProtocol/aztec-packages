use crate::{
    context::Context, oracle::{storage::{storage_read, storage_write}}, state_vars::{storage::Storage,map::Map}
};
use dep::protocol_types::{hash::pedersen_hash, constants::INITIALIZATION_SLOT_SEPARATOR, traits::{Deserialize, Serialize}};

struct PublicDynamicArray<T> {
  context: Context,
  map: Map<Field, T>,
  storage_slot: Field,
}

impl<T> Storage<T> for PublicDynamicArray<T> {}

impl<T> PublicDynamicArray<T> {
  pub fn new(
    context: Context,
    storage_slot: Field,
    state_var_constructor: fn(Context, Field) -> T
  ) -> Self {
    assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
    assert(context.private.is_none(), "PublicDynamicArrays can be initialized from public only.");

    PublicDynamicArray { 
      context, 
      storage_slot, 
      map: Map::new(
        context,
        storage_slot + INITIALIZATION_SLOT_SEPARATOR,
        state_var_constructor
      ) 
    }
  }

  pub fn push(mut self) -> T {
    assert(self.context.private.is_none(), "PublicDynamicArrays can be pushed from public only.");

    let array_read: [Field; 1] = storage_read(self.storage_slot);
    let array_length = array_read[0];

    let mut ret = self.map.at(array_length);

    storage_write(self.storage_slot, [array_length + 1]);

    ret
  }

  pub fn pop<U, T_SERIALIZED_LEN>(mut self) -> T where U: Deserialize<T_SERIALIZED_LEN> {
    assert(self.context.private.is_none(), "PublicDynamicArrays can be popped from public only.");

    let array_read: [Field; 1] = storage_read(self.storage_slot);
    let array_length = array_read[0];
    let new_array_length = array_length - 1;

    let mut ret = self.map.at(new_array_length);

    // we make sure to overwrite the slot that is 1 greater than the one we are popping to make sure ret still has a value that can be read from.
    // Any subsequent pushes will overwrite the value, and we will at most have 1 dead value.
    let derived_storage_slot = pedersen_hash([self.storage_slot + INITIALIZATION_SLOT_SEPARATOR, new_array_length + 1], 0);

    storage_write(derived_storage_slot, [0; T_SERIALIZED_LEN]);
    storage_write(self.storage_slot, [new_array_length]);

    ret
  }

  pub fn remove<U, T_SERIALIZED_LEN>(self, index: Field) where U: Deserialize<T_SERIALIZED_LEN> {
    assert(self.context.private.is_none(), "PublicDynamicArrays can be pushed from public only.");

    let derived_storage_slot = pedersen_hash([self.storage_slot + INITIALIZATION_SLOT_SEPARATOR, index], 0);

    storage_write(derived_storage_slot, [0; T_SERIALIZED_LEN]);
  }

  pub fn at_index(self, index: Field) -> T {
    self.map.at(index)
  }

  pub fn length(self) -> Field {
    let array_read: [Field; 1] = storage_read(self.storage_slot);

    array_read[0]
  }
}
