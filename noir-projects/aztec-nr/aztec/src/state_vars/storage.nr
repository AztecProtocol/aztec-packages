/// State variables must implement this trait in order to placed in the storage struct (i.e. the one marked with the
/// #[storage] attribute). The `N` value determines how many storage slots will be reserved for the state variable.
pub trait HasStorageSlot<let N: u32> {
    fn get_storage_slot(self) -> Field;
}

// Struct representing an exportable storage variable in the contract
// Every entry in the storage struct will be exported in the compilation artifact as a
// Storable entity, containing the storage slot
pub struct Storable {
    pub slot: Field,
}
