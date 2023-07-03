use dep;

fn hash_with_storage_slot(storage_slot: Field, key: Field) -> Field {
    dep::std::hash::pedersen([
        dep::aztec3::MappingStorageSlot,
        storage_slot,
        key
    ])[0]
}