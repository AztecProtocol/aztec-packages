use dep::protocol_types::traits::Packable;

pub trait Storage<T, let N: u32>
where
    T: Packable<N>,
{
    fn get_storage_slot(self) -> Field;
}

// Struct representing an exportable storage variable in the contract
// Every entry in the storage struct will be exported in the compilation artifact as a
// Storable entity, containing the storage slot
pub struct Storable {
    pub slot: Field,
}
