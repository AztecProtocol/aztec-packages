use dep::aztec::protocol_types::traits::{Deserialize, Packable, Serialize};
use std::meta::derive;

#[derive(Deserialize, Packable, Serialize)]
pub struct Note {
    pub a: Field,
    pub b: Field,
}
