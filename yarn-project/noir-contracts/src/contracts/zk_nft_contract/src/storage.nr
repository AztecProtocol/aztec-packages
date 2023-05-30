use dep::aztec3::state_vars::map::Map;
use dep::aztec3::state_vars::singleton::Singleton;
use dep::aztec3::notes::owner_note::OwnerNote;
use dep::aztec3::notes::owner_note::NOTE_LEN;
use dep::aztec3::notes::owner_note::get_owner_note_functions;

// Specialisations:



fn new_singleton_over_owner_notes(storage_slot: Field) -> Singleton<OwnerNote, NOTE_LEN> {
    let note_interface = get_owner_note_functions();
    Singleton::new(storage_slot, note_interface)
}

// fn new_map_over_t<T>(storage_slot: Field, new_t: fn(Field)->T) -> Map<T> {
//     Map::new(storage_slot, new_t)
// }

// Global storage variables are a bit flakey at the moment (because they were built during the hackathon), so I'm reverting to regular Noir structs to try to get generics further along.
// struct Storage<T> {
//     // maps user address => balance
//     balances: Map<T>,
// }

// impl<T> Storage<T> {
//     fn init(new_t: fn(Field)->T) -> Self {
//         let balances: Map<T> = new_map_over_t(1, new_t);
//         Storage {
//             balances,
//         }
//     }
// }


struct Storage {
    // maps user address => balance
    balances: Map<Singleton<OwnerNote, NOTE_LEN>>,
}

impl Storage {
    fn init() -> Storage {
        Storage {
            balances: Map::new(1, new_singleton_over_owner_notes),
        }
    }
}