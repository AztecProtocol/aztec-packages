use crate::{
    abis::{
        public_data_read::PublicDataRead,
        public_data_update_request::PublicDataUpdateRequest,
        side_effect::{Inner, Ordered, Overridable, Readable},
    },
    traits::Empty,
};

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
