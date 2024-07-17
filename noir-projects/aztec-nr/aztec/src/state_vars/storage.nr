use dep::protocol_types::{point::Point, traits::{Deserialize, Serialize}};

trait Storage<T> where T: Serialize<N> + Deserialize<N> {
    fn get_storage_slot(self) -> Point {
        self.storage_slot
    }
}

// Struct representing an exportable storage variable in the contract
// Every entry in the storage struct will be exported in the compilation artifact as a 
// Storable entity, containing the storage slot
struct Storable {
    slot: Point,
}

