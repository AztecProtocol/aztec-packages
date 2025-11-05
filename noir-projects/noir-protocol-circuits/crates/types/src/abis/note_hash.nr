use crate::side_effect::{Counted, Readable, Scoped};

pub type NoteHash = Field;

impl Readable for Scoped<Counted<NoteHash>> {
    fn assert_match_read_request(self, read_request: Scoped<Counted<Field>>) {
        assert_eq(
            self.innermost(),
            read_request.innermost(),
            "Value of the note hash does not match read request",
        );
        assert_eq(
            self.contract_address,
            read_request.contract_address,
            "Contract address of the note hash does not match read request",
        );
    }
}
