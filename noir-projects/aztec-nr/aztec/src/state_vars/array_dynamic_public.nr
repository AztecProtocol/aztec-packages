use crate::{
    context::Context, oracle::{storage::{storage_read, storage_write}}, state_vars::{storage::Storage,map::Map}
};
use dep::protocol_types::{constants::AVOID_SLOT_0_INDEX_SEPARATOR,hash::pedersen_hash, traits::{Deserialize, Serialize}};

global ARRAY_UNDERLYING_MAP_SEPARATOR: Field = 6_969_696_969;

struct PublicDynamicArray<T> {
  context: Context,
  map: Map<u64, T>,
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

    PublicDynamicArray { 
      context, 
      storage_slot, 
      map: Map::new(
        context,
        storage_slot + ARRAY_UNDERLYING_MAP_SEPARATOR,
        state_var_constructor
      ) 
    }
  }

  pub fn push(mut self) -> T {
    assert(self.context.private.is_none(), "PublicDynamicArrays can be accessed from public only.");

    let array_read: [Field; 1] = storage_read(self.storage_slot);
    let array_length = array_read[0];

    let mut ret = self.map.at(array_length as u64 + AVOID_SLOT_0_INDEX_SEPARATOR);

    storage_write(self.storage_slot, [array_length + 1]);

    ret
  }

  pub fn pop<U, T_SERIALIZED_LEN>(mut self) -> T where U: Deserialize<T_SERIALIZED_LEN> {
    assert(self.context.private.is_none(), "PublicDynamicArrays can be accessed from public only.");

    let array_read: [Field; 1] = storage_read(self.storage_slot);
    let array_length = array_read[0];
    assert(array_length as u64 > 0, "Array length must be > 0 to be popped");

    let new_array_length = array_length - 1;

    let mut ret = self.map.at(new_array_length as u64 + AVOID_SLOT_0_INDEX_SEPARATOR);

    // we make sure to overwrite the slot that is 1 greater than the one we are popping to make sure ret still has a value that can be read from.
    // Any subsequent pushes will overwrite the value, and we will at most have 1 dead value.
    let derived_storage_slot = pedersen_hash([self.storage_slot + ARRAY_UNDERLYING_MAP_SEPARATOR, new_array_length + 1 + AVOID_SLOT_0_INDEX_SEPARATOR], 0);

    storage_write(derived_storage_slot, [0; T_SERIALIZED_LEN]);
    storage_write(self.storage_slot, [new_array_length]);

    ret
  }

  pub fn remove<U, T_SERIALIZED_LEN>(self, index: u64) where U: Deserialize<T_SERIALIZED_LEN> {
    assert(self.context.private.is_none(), "PublicDynamicArrays can be accessed from public only.");

    let array_read: [Field; 1] = storage_read(self.storage_slot);
    let array_length = array_read[0];
    assert(index < array_length as u64, "remove must be called with index < length");

    let derived_storage_slot = pedersen_hash([self.storage_slot + ARRAY_UNDERLYING_MAP_SEPARATOR, index as Field + AVOID_SLOT_0_INDEX_SEPARATOR], 0);

    storage_write(derived_storage_slot, [0; T_SERIALIZED_LEN]);
  }

  pub fn at_index(self, index: u64) -> T {
    assert(self.context.private.is_none(), "PublicDynamicArrays can be accessed from public only.");

    let array_read: [Field; 1] = storage_read(self.storage_slot);
    let array_length = array_read[0];
    assert(index < array_length as u64, "at_index must be called with index < length");

    self.map.at(index + AVOID_SLOT_0_INDEX_SEPARATOR)
  }

  pub fn length(self) -> Field {
    assert(self.context.private.is_none(), "PublicDynamicArrays can be accessed from public only.");
    let array_read: [Field; 1] = storage_read(self.storage_slot);

    array_read[0]
  }
}
