use aztec::{macros::notes::note, protocol::traits::{Deserialize, Packable, Serialize}};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct PowNote {
    pub x: Field,
    pub n: Field,
}
