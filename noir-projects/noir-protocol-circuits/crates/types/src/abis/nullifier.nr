use crate::{side_effect::{Counted, Readable, Scoped}, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct Nullifier {
    pub value: Field,
    // A nullifier may track the note hash that it nullifies, to enable squashing. This will be discarded in the
    // private tail and only the value is sent to public-land.
    pub note_hash: Field, // Consider renaming to: `linked_note_hash`.
}

impl Empty for Nullifier {
    fn empty() -> Self {
        Nullifier { value: 0, note_hash: 0 }
    }
}

impl Nullifier {
    pub fn count(self, counter: u32) -> Counted<Nullifier> {
        Counted::new(self, counter)
    }
}

impl Scoped<Counted<Nullifier>> {
    pub fn expose_to_public(self) -> Field {
        self.innermost().value
    }
}

impl Readable for Nullifier {
    fn assert_match_read_request(self, read_request: Field) {
        assert_eq(self.value, read_request, "Value of the nullifier does not match read request");
    }
}
