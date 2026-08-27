use crate::abis::L1ToL2MessageSponge;
use types::traits::{Deserialize, Empty, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct ParityPublicInputs {
    // Rolling hash of the Inbox message chain before absorbing this checkpoint's messages.
    pub start_rolling_hash: Field,
    // Rolling hash of the Inbox message chain after absorbing the checkpoint's real messages. Each link is
    // `update_inbox_rolling_hash(prev, msg, opens_bucket, bucket_timestamp)`, matching the domain-separated
    // truncated-to-field sha256 the L1 Inbox accumulates.
    pub end_rolling_hash: Field,
    // Message-bundle sponge after absorbing the same real messages into the empty sponge the circuit starts from. The
    // checkpoint root asserts this equals the sponge accumulated across the checkpoint's block roots, tying the
    // parity-committed message list to the leaves the blocks inserted into the L1-to-L2 tree. The sponge carries its
    // own absorbed count, so the message count needs no separate public output.
    pub end_sponge: L1ToL2MessageSponge,
    // Binds the parity proof to the prover producing the checkpoint, making it non-transferable. There is no
    // vk_tree_root alongside it: `InboxParity` verifies no proofs, so the checkpoint root checks this circuit's vk
    // against its own constants' tree root and a pass-through here would add no binding.
    pub prover_id: Field,
}

impl Empty for ParityPublicInputs {
    fn empty() -> Self {
        ParityPublicInputs {
            start_rolling_hash: 0,
            end_rolling_hash: 0,
            end_sponge: L1ToL2MessageSponge::empty(),
            prover_id: 0,
        }
    }
}
