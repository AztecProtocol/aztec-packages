use aztec::{
    macros::notes::note,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct ValueNote {
    value: Field,
    owner: AztecAddress,
}

impl ValueNote {
    pub fn new(value: Field, owner: AztecAddress) -> Self {
        ValueNote { value, owner }
    }

    pub fn value(self) -> Field {
        self.value
    }
}
