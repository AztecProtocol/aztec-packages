use aztec::{macros::notes::note, protocol_types::traits::{Deserialize, Packable, Serialize}};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct FieldNote {
    pub value: Field,
}
