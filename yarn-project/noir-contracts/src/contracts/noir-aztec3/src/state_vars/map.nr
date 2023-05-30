use crate::state_vars::set::Set;

struct Map<V> {
    storage_slot: Field,
    state_var_constructor: fn (Field) -> V, // fn for calling V::new(derived_storage_slot)
}

impl<V> Map<V> {
    // fn new(storage_slot: Field) -> Map {
    //     Map { storage_slot }
    // }

    // fn at(self, key: Field) -> Set {
    //     let derived_storage_slot = dep::std::hash::pedersen([
    //         crate::MAPPING_STORAGE_SLOT_GENERATOR, 
    //         self.storage_slot, 
    //         key
    //     ])[0];

    //     Set::new(derived_storage_slot)
    // }

    fn new(storage_slot: Field, state_var_constructor: fn (Field) -> V) -> Map<V> {
        Map { storage_slot, state_var_constructor }
    }

    fn at(self, key: Field) -> V {
        let derived_storage_slot = dep::std::hash::pedersen([
            crate::MAPPING_STORAGE_SLOT_GENERATOR, 
            self.storage_slot, 
            key
        ])[0];

        let state_var_constructor = self.state_var_constructor; 
        state_var_constructor(derived_storage_slot)
    }
}

// Specialisations:

// fn new_set_map(storage_slot: Field) -> Set {
//     Map::new(storage_slot)
// }
