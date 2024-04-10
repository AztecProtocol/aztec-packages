use crate::context::{PrivateContext, PublicContext, Context};
use dep::protocol_types::{constants::AVOID_SLOT_0_INDEX_SEPARATOR, hash::pedersen_hash, traits::ToField};
use crate::state_vars::storage::Storage;
use crate::state_vars::map::Map;

struct FixedArray<T, LENGTH> {
  context: Context,
  map: Map<u64, T>,
  storage_slot: Field,
  // The _dummy variable forces DELAY to be interpreted as a numberic value. This is a workaround to
  // https://github.com/noir-lang/noir/issues/4633. Remove once resolved.
  _dummy: [Field; LENGTH],
}

impl<T, LENGTH> Storage<T> for FixedArray<T, LENGTH> {}

impl<T, LENGTH> FixedArray<T, LENGTH> {
  pub fn new(
      context: Context,
      storage_slot: Field,
      state_var_constructor: fn(Context, Field) -> T
  ) -> Self {
    assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
    assert(LENGTH > 0, "Array length must be > 0");
    FixedArray { 
      context, 
      storage_slot, 
      map: Map::new(
        context,
        storage_slot,
        state_var_constructor
      ),
      _dummy: [0; LENGTH]
    }
  }

  pub fn at_index(self, index: u64) -> T {
    assert(index < LENGTH, "at_index must be called with number < length");
    self.map.at(index + AVOID_SLOT_0_INDEX_SEPARATOR)
  }
}
