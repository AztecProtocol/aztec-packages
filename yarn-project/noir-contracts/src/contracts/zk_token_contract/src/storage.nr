use dep::aztec3::state_vars::map::Map;
use dep::aztec3::state_vars::set::Set;
use dep::aztec3::notes::value_note::ValueNote;
use dep::aztec3::notes::value_note::NOTE_LEN;
use dep::aztec3::notes::value_note::get_value_note_functions;
// use dep::aztec3::state_vars::set::new_value_note_set;

// Specialisations:

// fn new_value_note_set(storage_slot: Field) -> Set<Note, 6> {
//     Set::new(storage_slot, get_value_note_functions())
// }

fn new_set_over_value_notes(storage_slot: Field) -> Set<ValueNote, NOTE_LEN>  {
    let note_interface = get_value_note_functions();
    Set::new(storage_slot, note_interface)
}

// fn new_map_over_t<T>(storage_slot: Field, new_t: fn(Field)->T) -> Map<T> {
//     Map::new(storage_slot, new_t)
// }

// Global storage variables are a bit flakey at the moment (because they were built during the hackathon), so I'm reverting to regular Noir structs to try to get generics further along.
// struct Storage<T> {
//     // maps user address => balance
//     balances: Map<T> // TODO: Noir doesn't support: Map<Set<ValueNote, NOTE_LEN>>, which is a concrete type
// }

// impl<T> Storage<T> {
//     fn init(new_t: fn(Field)->T) -> Self {
//         Storage {
//             balances: new_map_over_t(1, new_t),
//         }
//     }
// }


struct Storage {
    balances:  Map<Set<ValueNote, NOTE_LEN>>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            balances: Map::new(1, new_set_over_value_notes),
        }
    }
}