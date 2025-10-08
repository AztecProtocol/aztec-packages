use crate::{
    abis::{read_request::ScopedReadRequest, side_effect::Readable},
    hash::compute_siloed_nullifier,
    merkle_tree::{IndexedTreeLeafPreimage, LeafPreimage},
    traits::{Deserialize, Empty, Hash, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct NullifierLeafPreimage {
    pub nullifier: Field,
    pub next_nullifier: Field,
    pub next_index: Field,
}

impl Empty for NullifierLeafPreimage {
    fn empty() -> Self {
        Self { nullifier: 0, next_nullifier: 0, next_index: 0 }
    }
}

impl Hash for NullifierLeafPreimage {
    fn hash(self) -> Field {
        if self.is_empty() {
            0
        } else {
            crate::hash::poseidon2_hash(self.serialize())
        }
    }
}

impl LeafPreimage for NullifierLeafPreimage {
    fn get_key(self) -> Field {
        self.nullifier
    }

    fn as_leaf(self) -> Field {
        self.hash()
    }
}

impl IndexedTreeLeafPreimage<Field> for NullifierLeafPreimage {
    fn get_next_key(self) -> Field {
        self.next_nullifier
    }

    fn points_to_infinity(self) -> bool {
        (self.next_nullifier == 0) & (self.next_index == 0)
    }

    fn update_pointers(self, next_key: Field, next_index: Field) -> Self {
        Self { nullifier: self.nullifier, next_nullifier: next_key, next_index }
    }

    fn update_value(self, _nullifier: Field) -> Self {
        assert(false, "Tried to update a nullifier");
        Self::empty()
    }

    fn build_insertion_leaf(nullifier: Field, low_leaf: Self) -> Self {
        Self { nullifier, next_nullifier: low_leaf.next_nullifier, next_index: low_leaf.next_index }
    }
}

impl Readable<ScopedReadRequest> for NullifierLeafPreimage {
    fn assert_match_read_request(self, read_request: ScopedReadRequest) {
        let siloed_value =
            compute_siloed_nullifier(read_request.contract_address, read_request.value());
        assert_eq(
            self.nullifier,
            siloed_value,
            "Value of the nullifier leaf does not match read request",
        );
    }
}

impl NullifierLeafPreimage {
    pub fn is_empty(self) -> bool {
        (self.nullifier == 0) & (self.next_nullifier == 0) & (self.next_index == 0)
    }
}
