use crate::{
    abis::log::Log,
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    side_effect::{Counted, Scoped},
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

pub type PrivateLog = Log<PRIVATE_LOG_SIZE_IN_FIELDS>;

#[derive(Eq, Deserialize, Serialize)]
pub struct PrivateLogData {
    pub log: Log<PRIVATE_LOG_SIZE_IN_FIELDS>,
    // The counter of the note hash this log is for. 0 if it does not link to a note hash.
    pub note_hash_counter: u32,
}

impl Empty for PrivateLogData {
    fn empty() -> Self {
        PrivateLogData { log: PrivateLog::empty(), note_hash_counter: 0 }
    }
}

impl PrivateLogData {
    pub fn count(self, counter: u32) -> Counted<Self> {
        Counted::new(self, counter)
    }
}

impl Scoped<Counted<PrivateLogData>> {
    pub fn expose_to_public(self) -> PrivateLog {
        self.innermost().log
    }
}
