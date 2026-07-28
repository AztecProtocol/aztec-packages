use crate::side_effect::Readable;

pub type NoteHash = Field;

impl Readable for NoteHash {
    fn assert_match_read_request(self, read_request: Field) {
        assert_eq(self, read_request, "Value of the note hash does not match read request");
    }
}
