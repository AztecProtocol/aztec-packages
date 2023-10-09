use dep::aztec::constants_gen;

struct PublicDataRead {
    leaf_index : Field,
    value : Field,
}

impl PublicDataRead {
    fn hash(self) -> Field {
        let _hash_index = constants_gen::GENERATOR_INDEX__PUBLIC_DATA_READ;
        0
    }

    // TODO(David): explain again why we don't check other fields
    fn is_empty(self) -> bool {
        self.leaf_index == 0 
    }
}
