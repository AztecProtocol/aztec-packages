use crate::{
    abis::{
    public_data_read::PublicDataRead, public_data_update_request::PublicDataUpdateRequest,
    side_effect::{Inner, Ordered, Overridable, Positioned, Readable}
},
    traits::Empty
};

struct OverridablePublicDataWrite {
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
        Self {
            write: PublicDataUpdateRequest::empty(),
            override_counter: 0,
        }
    }
}

impl Ordered for OverridablePublicDataWrite {
    fn counter(self)-> u32{
        self.write.counter()
    }
}

impl Positioned for OverridablePublicDataWrite {
    fn position(self) -> Field {
        self.write.leaf_slot
    }
}

impl Readable<PublicDataRead> for OverridablePublicDataWrite {
    fn assert_match_read_request(self, read_request: PublicDataRead) {
        self.write.assert_match_read_request(read_request);
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
