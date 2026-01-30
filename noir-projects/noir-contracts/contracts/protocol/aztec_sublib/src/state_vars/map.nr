use crate::protocol::{storage::map::derive_storage_slot_in_map, traits::ToField};
use crate::state_vars::StateVariable;

/// A key-value container for state variables.
///
/// A key-value storage container that maps keys to state variables, similar to Solidity mappings.
pub struct Map<K, V, Context> {
    pub context: Context,
    storage_slot: Field,
}

// Map reserves a single storage slot regardless of what it stores because nothing is stored at said slot: it is only
// used to derive the storage slots of nested state variables.
impl<K, V, Context> StateVariable<1, Context> for Map<K, V, Context> {
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Map { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<K, V, Context> Map<K, V, Context> {
    /// Returns the state variable associated with the given key.
    ///
    /// This is equivalent to accessing `mapping[key]` in Solidity.
    pub fn at<let N: u32>(self, key: K) -> V
    where
        K: ToField,
        V: StateVariable<N, Context>,
    {
        V::new(
            self.context,
            derive_storage_slot_in_map(self.storage_slot, key),
        )
    }
}
