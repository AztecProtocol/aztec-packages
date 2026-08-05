use crate::abis::L1ToL2MessageSponge;
use types::traits::{Deserialize, Empty, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct ParityPublicInputs {
    // The L1 `in_hash`: the sha256 frontier root of the checkpoint's L1-to-L2 messages, checked on L1 against
    // `inbox.consume()`. It is an UNCONSTRAINED pass-through: `InboxParity` echoes the value the prover supplies and
    // does not recompute it from the messages (the frontier tree is gone from the parity body). Until the Fast Inbox
    // flip moves the L1 anchor to the rolling hash, `in_hash` remains the authoritative L1 check, so the prover must
    // supply the true frontier root; the in-circuit tie between it and the processed messages is deferred to the flip.
    pub in_hash: Field,
    // Rolling hash of the Inbox message chain before absorbing this checkpoint's messages.
    pub start_rolling_hash: Field,
    // Rolling hash of the Inbox message chain after absorbing the checkpoint's real messages. Each link is
    // `sha256ToField(prev || msg)`, matching the truncated-to-field sha256 the L1 Inbox accumulates.
    pub end_rolling_hash: Field,
    // Message-bundle sponge after absorbing the same real messages into the empty sponge the circuit starts from. The
    // checkpoint root asserts this equals the sponge accumulated across the checkpoint's block roots, tying the
    // parity-committed message list to the leaves the blocks inserted into the L1-to-L2 tree. The sponge carries its
    // own absorbed count, so the message count needs no separate public output.
    pub end_sponge: L1ToL2MessageSponge,
    pub vk_tree_root: Field,
    pub prover_id: Field,
}

impl Empty for ParityPublicInputs {
    fn empty() -> Self {
        ParityPublicInputs {
            in_hash: 0,
            start_rolling_hash: 0,
            end_rolling_hash: 0,
            end_sponge: L1ToL2MessageSponge::empty(),
            vk_tree_root: 0,
            prover_id: 0,
        }
    }
}
