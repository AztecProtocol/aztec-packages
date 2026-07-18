use crate::abis::L1ToL2MessageSponge;
use types::traits::{Deserialize, Empty, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct ParityPublicInputs {
    // Rolling hash of the Inbox message chain before absorbing this checkpoint's messages.
    pub start_rolling_hash: Field,
    // Rolling hash of the Inbox message chain after absorbing the `num_msgs` real messages. Each link is
    // `sha256ToField(prev || msg)`, matching the truncated-to-field sha256 the L1 Inbox accumulates.
    pub end_rolling_hash: Field,
    // Poseidon2 message-bundle sponge before this checkpoint's messages (empty at checkpoint start).
    pub start_sponge: L1ToL2MessageSponge,
    // Message-bundle sponge after absorbing the `num_msgs` real messages. The checkpoint root asserts this equals the
    // sponge accumulated across the checkpoint's block roots, tying the parity-committed message list to the leaves
    // the blocks inserted into the L1-to-L2 tree.
    pub end_sponge: L1ToL2MessageSponge,
    // Number of real (non-padding) messages absorbed into the rolling hash and the sponge.
    pub num_msgs: u32,
    pub vk_tree_root: Field,
    pub prover_id: Field,
}

impl Empty for ParityPublicInputs {
    fn empty() -> Self {
        ParityPublicInputs {
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
