use crate::{
    merkle_tree::LeafPreimage,
    side_effect::Readable,
    traits::{Deserialize, Empty, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct NoteHashLeafPreimage {
    pub value: Field,
}

impl Empty for NoteHashLeafPreimage {
    fn empty() -> Self {
        Self { value: 0 }
    }
}

impl LeafPreimage for NoteHashLeafPreimage {
    fn get_key(self) -> Field {
        self.value
    }

    fn as_leaf(self) -> Field {
        self.value
    }
}

impl Readable for NoteHashLeafPreimage {
    fn assert_match_read_request(self, read_request: Field) {
        assert_eq(
            self.value,
            read_request,
            "Value of the note hash leaf does not match read request",
        );
    }
}

impl NoteHashLeafPreimage {
    pub fn is_empty(self) -> bool {
        (self.value == 0)
    }
}

impl Eq for NoteHashLeafPreimage {
    fn eq(self, other: Self) -> bool {
        self.value == other.value
    }
}

#[test]
fn serialization_of_empty() {
    let item = NoteHashLeafPreimage::empty();
    let serialized = item.serialize();
    let deserialized = NoteHashLeafPreimage::deserialize(serialized);
    assert(item.eq(deserialized));
}
