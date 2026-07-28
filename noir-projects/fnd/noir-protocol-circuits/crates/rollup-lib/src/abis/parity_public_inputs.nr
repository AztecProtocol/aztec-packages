use crate::abis::L1ToL2MessageSponge;
use types::traits::{Deserialize, Empty, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct ParityPublicInputs {
    pub sha_root: Field,
    pub converted_root: Field,
    // Rolling hash of the Inbox message chain before absorbing this batch of messages.
    pub start_rolling_hash: Field,
    // Rolling hash of the Inbox message chain after absorbing the `num_msgs` real messages in this batch. Each link is
    // `sha256ToField(prev || msg)`, matching the truncated-to-field sha256 the L1 Inbox accumulates.
    pub end_rolling_hash: Field,
    // Poseidon2 message-bundle sponge before absorbing this batch of leaves. Threaded across the four base parity
    // segments the same way as the rolling hash, so each segment's start equals the previous segment's end.
    pub start_sponge: L1ToL2MessageSponge,
    // Message-bundle sponge after absorbing the full (padded) batch of leaves. Unlike the rolling hash, the sponge
    // absorbs every leaf inserted into the L1-to-L2 tree, including padding zeros (AZIP-22 transitional asymmetry). The
    // checkpoint root asserts this equals the sponge accumulated across the checkpoint's block roots.
    pub end_sponge: L1ToL2MessageSponge,
    // Number of real (non-padding) messages absorbed into the rolling hash by this batch.
    pub num_msgs: u32,
    pub vk_tree_root: Field,
    pub prover_id: Field,
}

impl Empty for ParityPublicInputs {
    fn empty() -> Self {
        ParityPublicInputs {
            sha_root: 0,
            converted_root: 0,
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
