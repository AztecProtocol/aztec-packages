use aztec::protocol::traits::{Deserialize, Packable, Serialize};
use std::meta::derive;

#[derive(Deserialize, Packable, Serialize)]
pub struct Note {
    pub a: Field,
    pub b: Field,
}
