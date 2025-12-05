// TODO(benesjan): This is just for the macro-generated StorageLayout struct. It seems strange to have it here and
// the file needs renaming to storable.nr.

// Struct representing an exportable storage variable in the contract
// Every entry in the storage struct will be exported in the compilation artifact as a
// Storable entity, containing the storage slot
pub struct Storable {
    pub slot: Field,
}
