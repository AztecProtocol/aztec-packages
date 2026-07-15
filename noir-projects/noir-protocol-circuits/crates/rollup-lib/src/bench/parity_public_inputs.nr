use crate::abis::L1ToL2MessageSponge;
use types::traits::{Deserialize, Empty, Serialize};

/// Public inputs shape shared by every bench parity variant (chain / empty / root / link).
///
/// It is deliberately a separate struct from the production `ParityPublicInputs` (which still carries the legacy sha
/// and poseidon merkle roots): the bench variants measure the post-flip end state, where both merkle trees are gone and
/// only the rolling-hash chain and the message sponge remain. Keeping it separate avoids touching the shared production
/// struct.
#[derive(Deserialize, Eq, Serialize)]
pub struct BenchParityPublicInputs {
    // Inbox rolling-hash chain value before this segment's messages.
    pub start_rolling_hash: Field,
    // Inbox rolling-hash chain value after absorbing the `num_msgs` real messages. Each link is `sha256ToField(h||m)`.
    pub end_rolling_hash: Field,
    // Poseidon2 message-bundle sponge before this segment's messages.
    pub start_sponge: L1ToL2MessageSponge,
    // Poseidon2 message-bundle sponge after absorbing the `num_msgs` real messages (real-count absorb, both sides).
    pub end_sponge: L1ToL2MessageSponge,
    // Number of real (non-padding) messages absorbed by this segment.
    pub num_msgs: u32,
    pub vk_tree_root: Field,
    pub prover_id: Field,
}

impl Empty for BenchParityPublicInputs {
    fn empty() -> Self {
        BenchParityPublicInputs {
            start_rolling_hash: 0,
            end_rolling_hash: 0,
            start_sponge: L1ToL2MessageSponge::empty(),
            end_sponge: L1ToL2MessageSponge::empty(),
            num_msgs: 0,
            vk_tree_root: 0,
            prover_id: 0,
        }
    }
}
