use aztec::{macros::notes::note, protocol_types::traits::{Deserialize, Packable, Serialize}};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct ValueNote {
    value: Field,
}

impl ValueNote {
    pub fn new(value: Field) -> Self {
        ValueNote { value }
    }

    pub fn value(self) -> Field {
        self.value
    }
}
