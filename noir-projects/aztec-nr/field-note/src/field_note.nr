use aztec::{macros::notes::note, protocol_types::traits::{Deserialize, Packable, Serialize}};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct FieldNote {
    value: Field,
}

impl FieldNote {
    pub fn new(value: Field) -> Self {
        FieldNote { value }
    }

    pub fn value(self) -> Field {
        self.value
    }
}
