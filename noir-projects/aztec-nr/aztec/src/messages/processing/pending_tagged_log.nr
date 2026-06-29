use crate::messages::processing::MessageContext;
use crate::protocol::{constants::PRIVATE_LOG_SIZE_IN_FIELDS, traits::{Deserialize, Serialize}};

/// A private log that was tagged for `recipient` and has not yet been processed, plus information related to the
/// transaction in which it was emitted.
#[derive(Deserialize, Eq, Serialize)]
pub(crate) struct PendingTaggedLog {
    pub log: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
    // Context of the message included in the log.
    pub context: MessageContext,
}
