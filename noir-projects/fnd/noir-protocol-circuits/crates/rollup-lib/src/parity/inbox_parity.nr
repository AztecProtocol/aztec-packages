use crate::{
    abis::{L1ToL2MessageSponge, ParityPublicInputs},
    inbox_rolling_hash::accumulate_inbox_rolling_hash,
};
use types::utils::arrays::assert_trailing_zeros;

/// Private inputs for the `InboxParity<S>` circuit, generic over the message-bundle size `S`.
///
/// One `InboxParity` proof is produced per checkpoint. The prover picks the smallest ladder size `S ∈ {64, 256, 1024}`
/// with `S >= num_msgs`, so a checkpoint with few messages proves a small circuit.
pub struct InboxParityPrivateInputs<let S: u32> {
    // The checkpoint's L1-to-L2 message leaves, padded with zeros beyond `num_msgs`.
    pub(crate) msgs: [Field; S],
    // Number of real (non-padding) messages in `msgs`.
    pub(crate) num_msgs: u32,
    // Rolling hash of the Inbox chain before this checkpoint's messages (the previous checkpoint's end value; genesis
    // is zero).
    pub(crate) start_rolling_hash: Field,
    // The L1 `in_hash` (sha256 frontier root of this checkpoint's messages), passed through UNCONSTRAINED to the
    // public inputs. See `ParityPublicInputs::in_hash`: the frontier tree is gone from this body, so the prover
    // supplies the value and the circuit does not recompute or bind it to `msgs`.
    pub(crate) in_hash: Field,
    pub(crate) vk_tree_root: Field,
    pub(crate) prover_id: Field,
}

/// The Inbox Parity circuit recomputes, for one checkpoint, the Inbox rolling-hash chain over the checkpoint's real
/// L1-to-L2 messages and absorbs the same real messages into the message-bundle sponge. It replaces the parity base +
/// parity root family with a single variable-size proof per checkpoint.
///
/// This circuit:
/// - Chains the `num_msgs` real messages into the rolling hash (two sha256 compressions per leaf)
/// - Absorbs the same real messages into the empty message sponge (real-count absorb; the checkpoint root asserts this
///   equals the sponge the block roots accumulate). The sponge resets per checkpoint and there is one proof per
///   checkpoint, so the start is always the empty sponge and is hard-coded rather than witnessed.
/// - Asserts the padding lanes past `num_msgs` are zero so they cannot silently enter either accumulator
/// - Passes `in_hash` through unconstrained (see `InboxParityPrivateInputs::in_hash`)
///
/// The output feeds the Checkpoint Root circuits, which verify this proof against the `{64, 256, 1024}` VK ladder.
///
/// VkIndex: INBOX_PARITY_{64,256,1024}_VK_INDEX
pub fn execute<let S: u32>(inputs: InboxParityPrivateInputs<S>) -> ParityPublicInputs {
    // Guard the padding lanes so they can't silently enter either accumulator (`num_msgs <= S` is asserted here too).
    assert_trailing_zeros(inputs.msgs, inputs.num_msgs);

    let end_rolling_hash =
        accumulate_inbox_rolling_hash(inputs.start_rolling_hash, inputs.msgs, inputs.num_msgs);

    let mut end_sponge = L1ToL2MessageSponge::new();
    end_sponge.absorb(inputs.msgs, inputs.num_msgs);

    ParityPublicInputs {
        in_hash: inputs.in_hash,
        start_rolling_hash: inputs.start_rolling_hash,
        end_rolling_hash,
        end_sponge,
        num_msgs: inputs.num_msgs,
        vk_tree_root: inputs.vk_tree_root,
        prover_id: inputs.prover_id,
    }
}
