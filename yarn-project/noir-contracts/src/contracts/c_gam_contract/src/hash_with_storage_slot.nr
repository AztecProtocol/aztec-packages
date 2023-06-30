use dep;

fn hash_with_storage_slot(storage_slot_number: Field, key: Field) -> Field {
    dep::std::hash::pedersen([
        dep::aztec3::MappingStorageSlot,
        storage_slot_number,
        key
    ])[0]
}