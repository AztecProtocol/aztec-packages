/// Exported storage layout definition.
///
/// Struct representing an exportable storage variable in the contract. Every entry in the storage struct will be
/// exported in the compilation artifact as a Storable entity, containing the storage slot.
pub struct Storable {
    pub slot: Field,
}
