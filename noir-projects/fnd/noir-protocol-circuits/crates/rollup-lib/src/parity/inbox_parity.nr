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
    // Per-lane flag marking the leaves that are the first message of an L1 bucket, so the rolling hash commits to the
    // bucket boundaries. False beyond `num_msgs`.
    pub(crate) bucket_starts: [bool; S],
    // Number of real (non-padding) messages in `msgs`.
    pub(crate) num_msgs: u32,
    // Rolling hash of the Inbox chain before this checkpoint's messages (the previous checkpoint's end value; genesis
    // is zero).
    pub(crate) start_rolling_hash: Field,
    pub(crate) prover_id: Field,
}

/// The Inbox Parity circuit recomputes, for one checkpoint, the Inbox rolling-hash chain over the checkpoint's real
/// L1-to-L2 messages and absorbs the same real messages into the message-bundle sponge. It replaces the parity base +
/// parity root family with a single variable-size proof per checkpoint.
///
/// This circuit:
/// - Chains the `num_msgs` real messages into the rolling hash (two sha256 compressions per leaf), tagging each link
///   as a bucket start or a bucket continuation
/// - Absorbs the same real messages into the empty message sponge (real-count absorb; the checkpoint root asserts this
///   equals the sponge the block roots accumulate). The sponge resets per checkpoint and there is one proof per
///   checkpoint, so the start is always the empty sponge and is hard-coded rather than witnessed.
/// - Asserts the padding lanes past `num_msgs` are zero so they cannot silently enter either accumulator, and that
///   they claim no bucket start; a consuming checkpoint must also open a bucket at lane 0
///
/// The output feeds the Checkpoint Root circuits, which verify this proof against the `{64, 256, 1024}` VK ladder.
///
/// VkIndex: INBOX_PARITY_{64,256,1024}_VK_INDEX
pub fn execute<let S: u32>(inputs: InboxParityPrivateInputs<S>) -> ParityPublicInputs {
    // Guard the padding lanes so they can't silently enter either accumulator (`num_msgs <= S` is asserted here too).
    assert_trailing_zeros(inputs.msgs, inputs.num_msgs);

    // A checkpoint always begins consuming at a bucket boundary, since a bucket is only ever consumed from its first
    // unconsumed message onwards and the previous checkpoint stopped at a bucket end.
    if inputs.num_msgs > 0 {
        assert(inputs.bucket_starts[0], "First consumed message must open a bucket");
    }
    // Padding lanes must not claim to open a bucket, mirroring the zero-padding guard on `msgs`.
    let mut is_padding = false;
    for i in 0..S {
        is_padding |= i == inputs.num_msgs;
        if is_padding {
            assert(!inputs.bucket_starts[i], "Found bucket start after breakpoint");
        }
    }

    let end_rolling_hash = accumulate_inbox_rolling_hash(
        inputs.start_rolling_hash,
        inputs.msgs,
        inputs.bucket_starts,
        inputs.num_msgs,
    );

    let mut end_sponge = L1ToL2MessageSponge::new();
    end_sponge.absorb(inputs.msgs, inputs.num_msgs);

    ParityPublicInputs {
        start_rolling_hash: inputs.start_rolling_hash,
        end_rolling_hash,
        end_sponge,
        prover_id: inputs.prover_id,
    }
}
