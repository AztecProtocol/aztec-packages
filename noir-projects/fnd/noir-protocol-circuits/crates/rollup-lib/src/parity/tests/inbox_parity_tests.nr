use crate::{
    abis::L1ToL2MessageSponge,
    inbox_rolling_hash::accumulate_inbox_rolling_hash,
    parity::inbox_parity::{self, InboxParityPrivateInputs},
};
use types::traits::Empty;

global S: u32 = 64;

// Flags for a checkpoint consuming a single contiguous run out of one bucket: lane 0 opens the bucket and every
// other lane continues it.
fn only_first_is_bucket_start() -> [bool; S] {
    let mut bucket_starts = [false; S];
    bucket_starts[0] = true;
    bucket_starts
}

#[test]
fn public_inputs_match_expected() {
    let mut msgs = [0; S];
    for i in 0..S {
        msgs[i] = i as Field;
    }
    let bucket_starts = only_first_is_bucket_start();
    let private_inputs = InboxParityPrivateInputs {
        msgs,
        bucket_starts,
        num_msgs: S,
        start_rolling_hash: 0,
        prover_id: 7,
    };
    let public_inputs = inbox_parity::execute(private_inputs);

    assert_eq(public_inputs.prover_id, 7);

    // The rolling hash chains all real messages on top of the start value, which the circuit echoes back.
    assert_eq(public_inputs.start_rolling_hash, 0);
    assert_eq(
        public_inputs.end_rolling_hash,
        accumulate_inbox_rolling_hash(0, msgs, bucket_starts, S),
    );

    // The sponge absorbs exactly the real messages (real-count) into the empty sponge the circuit starts from.
    let mut expected_end_sponge = L1ToL2MessageSponge::empty();
    expected_end_sponge.absorb(msgs, S);
    assert_eq(public_inputs.end_sponge, expected_end_sponge);
}

#[test]
fn bucket_starts_are_committed_to() {
    // Two checkpoints over the same messages but with a bucket boundary in a different place reach different rolling
    // hashes, so the chain pins the grouping and not just the message order.
    let mut msgs = [0; S];
    msgs[0] = 101;
    msgs[1] = 202;
    msgs[2] = 303;

    let one_bucket = only_first_is_bucket_start();
    let mut split_at_third = one_bucket;
    split_at_third[2] = true;

    let single = inbox_parity::execute(
        InboxParityPrivateInputs {
            msgs,
            bucket_starts: one_bucket,
            num_msgs: 3,
            start_rolling_hash: 0,
            prover_id: 7,
        },
    );
    let split = inbox_parity::execute(
        InboxParityPrivateInputs {
            msgs,
            bucket_starts: split_at_third,
            num_msgs: 3,
            start_rolling_hash: 0,
            prover_id: 7,
        },
    );

    assert(single.end_rolling_hash != split.end_rolling_hash);
    // The sponge is unaffected: it only sees the leaves.
    assert_eq(single.end_sponge, split.end_sponge);
}

#[test]
fn sponge_matches_block_root_real_count_absorb() {
    // The checkpoint root asserts InboxParity's end sponge equals the sponge the block roots accumulate. The block
    // roots absorb the real messages (real-count) out of their padded bundle, so InboxParity must reach the same
    // state absorbing the same real prefix out of a differently-sized (here smaller) array.
    let mut msgs = [0; S];
    msgs[0] = 101;
    msgs[1] = 202;

    let private_inputs = InboxParityPrivateInputs {
        msgs,
        bucket_starts: only_first_is_bucket_start(),
        num_msgs: 2,
        start_rolling_hash: 0,
        prover_id: 7,
    };
    let public_inputs = inbox_parity::execute(private_inputs);

    // A block root absorbing the same two real leaves out of its wider bundle reaches the same sponge.
    let mut block_sponge = L1ToL2MessageSponge::empty();
    block_sponge.absorb([101, 202, 0, 0, 0], 2);
    assert_eq(public_inputs.end_sponge, block_sponge);
}

#[test(should_fail_with = "Found non-zero field after breakpoint")]
fn non_zero_padding_lane_fails() {
    // Claim two real messages but leave a non-zero value in a padding lane.
    let mut msgs = [0; S];
    msgs[0] = 11;
    msgs[1] = 22;
    msgs[5] = 999;

    let private_inputs = InboxParityPrivateInputs {
        msgs,
        bucket_starts: only_first_is_bucket_start(),
        num_msgs: 2,
        start_rolling_hash: 0,
        prover_id: 7,
    };
    let _ = inbox_parity::execute(private_inputs);
}

#[test(should_fail_with = "First consumed message must open a bucket")]
fn first_message_not_a_bucket_start_fails() {
    let mut msgs = [0; S];
    msgs[0] = 11;
    msgs[1] = 22;

    let private_inputs = InboxParityPrivateInputs {
        msgs,
        bucket_starts: [false; S],
        num_msgs: 2,
        start_rolling_hash: 0,
        prover_id: 7,
    };
    let _ = inbox_parity::execute(private_inputs);
}

#[test(should_fail_with = "Found bucket start after breakpoint")]
fn bucket_start_in_padding_lane_fails() {
    let mut msgs = [0; S];
    msgs[0] = 11;
    msgs[1] = 22;

    let mut bucket_starts = only_first_is_bucket_start();
    bucket_starts[5] = true;

    let private_inputs = InboxParityPrivateInputs {
        msgs,
        bucket_starts,
        num_msgs: 2,
        start_rolling_hash: 0,
        prover_id: 7,
    };
    let _ = inbox_parity::execute(private_inputs);
}

#[test]
fn empty_checkpoint_needs_no_bucket_start() {
    let public_inputs = inbox_parity::execute(
        InboxParityPrivateInputs {
            msgs: [0; S],
            bucket_starts: [false; S],
            num_msgs: 0,
            start_rolling_hash: 0x2a,
            prover_id: 7,
        },
    );
    assert_eq(public_inputs.end_rolling_hash, 0x2a);
}

#[test(should_fail_with = "in_len is greater than the input array len")]
fn num_msgs_greater_than_size_fails() {
    let private_inputs = InboxParityPrivateInputs {
        msgs: [0; S],
        bucket_starts: only_first_is_bucket_start(),
        num_msgs: S + 1,
        start_rolling_hash: 0,
        prover_id: 7,
    };
    let _ = inbox_parity::execute(private_inputs);
}
