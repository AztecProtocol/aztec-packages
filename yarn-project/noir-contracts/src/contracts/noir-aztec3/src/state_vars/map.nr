use crate::state_vars::set::Set;

struct Map<V> {
    storage_slot: Field,
    new_v: fn (Field) -> V, // fn for calling V::new(derived_storage_slot)
}

impl<V> Map<V> {
    fn new(storage_slot: Field, new_v: fn (Field) -> V) -> Map<V> {
        Map { storage_slot, new_v }
    }

    fn at(self, key: Field) -> V {
        let derived_storage_slot = dep::std::hash::pedersen([
            crate::MappingStorageSlot, 
            self.storage_slot, 
            key
        ])[0];

        let { new_v } = self; 
        new_v(derived_storage_slot)
    }
}
