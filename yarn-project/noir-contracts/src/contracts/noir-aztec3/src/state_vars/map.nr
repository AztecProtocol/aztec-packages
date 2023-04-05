use crate::state_vars::set::Set;
use crate::notes::generic_note_functions::GenericNoteFunctions;

// V = Set<Note>
struct Map<V> {
    storage_slot: Field,
    new_v: fn (Field) -> V, // fn for calling V::new(derived_storage_slot)
}

// V = Set<Note>
// V = Singleton<Note>
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

        let new_v = self.new_v; 
        new_v(derived_storage_slot)
    }
}
