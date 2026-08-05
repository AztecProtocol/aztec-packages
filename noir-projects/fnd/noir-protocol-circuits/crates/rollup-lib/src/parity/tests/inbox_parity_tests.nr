use crate::{
    abis::L1ToL2MessageSponge,
    inbox_rolling_hash::accumulate_inbox_rolling_hash,
    parity::inbox_parity::{self, InboxParityPrivateInputs},
};
use types::traits::Empty;

global S: u32 = 64;

#[test]
fn public_inputs_match_expected() {
    let mut msgs = [0; S];
    for i in 0..S {
        msgs[i] = i as Field;
    }
    let private_inputs = InboxParityPrivateInputs {
        msgs,
        num_msgs: S,
        start_rolling_hash: 0,
        in_hash: 0x1234,
        vk_tree_root: 42,
        prover_id: 7,
    };
    let public_inputs = inbox_parity::execute(private_inputs);

    // `in_hash` is echoed through unconstrained.
    assert_eq(public_inputs.in_hash, 0x1234);
    assert_eq(public_inputs.vk_tree_root, 42);
    assert_eq(public_inputs.prover_id, 7);

    // The rolling hash chains all real messages on top of the start value, which the circuit echoes back.
    assert_eq(public_inputs.start_rolling_hash, 0);
    assert_eq(public_inputs.end_rolling_hash, accumulate_inbox_rolling_hash(0, msgs, S));

    // The sponge absorbs exactly the real messages (real-count) into the empty sponge the circuit starts from.
    let mut expected_end_sponge = L1ToL2MessageSponge::empty();
    expected_end_sponge.absorb(msgs, S);
    assert_eq(public_inputs.end_sponge, expected_end_sponge);
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
        num_msgs: 2,
        start_rolling_hash: 0,
        in_hash: 0,
        vk_tree_root: 42,
        prover_id: 7,
    };
    let public_inputs = inbox_parity::execute(private_inputs);

    // A block root absorbing the same two real leaves out of its 1024-wide bundle reaches the same sponge.
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
        num_msgs: 2,
        start_rolling_hash: 0,
        in_hash: 0,
        vk_tree_root: 42,
        prover_id: 7,
    };
    let _ = inbox_parity::execute(private_inputs);
}

#[test(should_fail_with = "in_len is greater than the input array len")]
fn num_msgs_greater_than_size_fails() {
    let private_inputs = InboxParityPrivateInputs {
        msgs: [0; S],
        num_msgs: S + 1,
        start_rolling_hash: 0,
        in_hash: 0,
        vk_tree_root: 42,
        prover_id: 7,
    };
    let _ = inbox_parity::execute(private_inputs);
}
