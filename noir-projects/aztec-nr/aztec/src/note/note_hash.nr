use protocol_types::{
    constants::GENERATOR_INDEX__NOTE_HASH, hash::poseidon2_hash_with_separator,
    utils::arrays::array_concat,
};

pub fn note_hash<let N: u32>(values: [Field; N], storage_slot: Field) -> Field {
    poseidon2_hash_with_separator(
        array_concat(values, [storage_slot]),
        GENERATOR_INDEX__NOTE_HASH,
    )
}
