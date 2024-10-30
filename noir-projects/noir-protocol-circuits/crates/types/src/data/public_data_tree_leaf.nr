use crate::{
    abis::{public_data_read::PublicDataRead, side_effect::{Overridable, Readable}},
    traits::Empty,
};

pub struct PublicDataTreeLeaf {
    slot: Field,
    value: Field,
}

impl Eq for PublicDataTreeLeaf {
    fn eq(self, other: Self) -> bool {
        (self.slot == other.slot) & (self.value == other.value)
    }
}

impl Empty for PublicDataTreeLeaf {
    fn empty() -> Self {
        Self { slot: 0, value: 0 }
    }
}

impl PublicDataTreeLeaf {
    pub fn is_empty(self) -> bool {
        (self.slot == 0) & (self.value == 0)
    }
}

pub struct OverridablePublicDataTreeLeaf {
    leaf: PublicDataTreeLeaf,
    override_counter: u32,
}

impl Empty for OverridablePublicDataTreeLeaf {
    fn empty() -> Self {
        OverridablePublicDataTreeLeaf { leaf: PublicDataTreeLeaf::empty(), override_counter: 0 }
    }
}

impl Readable<PublicDataRead> for OverridablePublicDataTreeLeaf {
    fn assert_match_read_request(self, read_request: PublicDataRead) {
        assert_eq(
            self.leaf.slot,
            read_request.leaf_slot,
            "leaf_slot in OverridablePublicDataTreeLeaf does not match read request",
        );
        assert_eq(
            self.leaf.value,
            read_request.value,
            "value in OverridablePublicDataTreeLeaf does not match read request",
        );
    }
}

impl Overridable for OverridablePublicDataTreeLeaf {
    fn override_counter(self) -> u32 {
        self.override_counter
    }
}
