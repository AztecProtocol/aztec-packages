use crate::messages::encoding::MESSAGE_CIPHERTEXT_LEN;
use crate::messages::processing::MessageContext;
use crate::protocol::traits::Deserialize;

/// An offchain message that has been ingested by PXE and validated against the chain,
/// ready to be processed during sync_state.
#[derive(Deserialize, Eq)]
pub(crate) struct PendingOffchainMessage {
    pub ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    pub context: MessageContext,
}
