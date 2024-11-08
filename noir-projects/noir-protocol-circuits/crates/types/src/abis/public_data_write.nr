use crate::{
    abis::{
        public_data_read::PublicDataRead,
        public_data_update_request::PublicDataUpdateRequest,
        side_effect::{Inner, Ordered, Overridable, Readable},
    },
    constants::PUBLIC_DATA_WRITE_LENGTH,
    traits::{Deserialize, Empty, Serialize},
};

pub struct PublicDataWrite {
    leaf_slot: Field,
    value: Field,
}

impl Eq for PublicDataWrite {
    fn eq(self, other: Self) -> bool {
        (self.leaf_slot == other.leaf_slot) & (self.value == other.value)
    }
}

impl Empty for PublicDataWrite {
    fn empty() -> Self {
        Self { leaf_slot: 0, value: 0 }
    }
}

impl Serialize<PUBLIC_DATA_WRITE_LENGTH> for PublicDataWrite {
    fn serialize(self) -> [Field; PUBLIC_DATA_WRITE_LENGTH] {
        [self.leaf_slot, self.value]
    }
}

impl Deserialize<PUBLIC_DATA_WRITE_LENGTH> for PublicDataWrite {
    fn deserialize(fields: [Field; PUBLIC_DATA_WRITE_LENGTH]) -> PublicDataWrite {
        PublicDataWrite { leaf_slot: fields[0], value: fields[1] }
    }
}

// TODO: To be deprecated.
pub struct OverridablePublicDataWrite {
    write: PublicDataUpdateRequest,
    override_counter: u32,
}

impl Eq for OverridablePublicDataWrite {
    fn eq(self, other: OverridablePublicDataWrite) -> bool {
        (other.write == self.write) & (other.override_counter == self.override_counter)
    }
}

impl Empty for OverridablePublicDataWrite {
    fn empty() -> Self {
        Self { write: PublicDataUpdateRequest::empty(), override_counter: 0 }
    }
}

impl Ordered for OverridablePublicDataWrite {
    fn counter(self) -> u32 {
        self.write.counter()
    }
}

impl Readable<PublicDataRead> for OverridablePublicDataWrite {
    fn assert_match_read_request(self, read_request: PublicDataRead) {
        assert_eq(
            self.write.leaf_slot,
            read_request.leaf_slot,
            "leaf_slot in OverridablePublicDataWrite does not match read request",
        );
        assert_eq(
            self.write.new_value,
            read_request.value,
            "value in OverridablePublicDataWrite does not match read request",
        );
    }
}

impl Overridable for OverridablePublicDataWrite {
    fn override_counter(self) -> u32 {
        self.override_counter
    }
}

impl Inner<PublicDataUpdateRequest> for OverridablePublicDataWrite {
    fn inner(self) -> PublicDataUpdateRequest {
        self.write
    }
}

#[test]
fn serialization_of_empty_public_data_write() {
    let item = PublicDataWrite::empty();
    let serialized = item.serialize();
    let deserialized = PublicDataWrite::deserialize(serialized);
    assert(item.eq(deserialized));
}
